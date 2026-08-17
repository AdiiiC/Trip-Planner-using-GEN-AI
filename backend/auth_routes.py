"""Auth endpoints: register, login, TOTP 2FA setup/enable/disable, recovery."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import usernames
from auth_deps import get_current_user
from auth_schemas import (
    CodeInput,
    LoginInput,
    LoginResponse,
    MfaLoginInput,
    RecoveryCodesResponse,
    RegisterInput,
    TokenResponse,
    TotpSetupResponse,
    UsernameAvailability,
    UsernameInput,
    UserOut,
)
from auth_security import (
    create_access_token,
    create_mfa_token,
    decode_token,
    decrypt_secret,
    encrypt_secret,
    generate_recovery_codes,
    hash_password,
    hash_recovery_code,
    new_totp_secret,
    totp_uri,
    verify_password,
    verify_totp,
)
from db import get_db
from rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Deliberately vague so attackers can't distinguish "wrong email" from "wrong password".
_BAD_CREDS = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

_TAKEN = "That username is taken"


def _get_user_by_email(db: Session, email: str) -> models.User | None:
    return db.scalar(select(models.User).where(models.User.email == email.lower()))


def _validated_handle(raw: str) -> str:
    try:
        return usernames.clean_username(raw)
    except usernames.UsernameError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


def _out(user: models.User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=usernames.display_name(user),
        is_2fa_enabled=user.is_2fa_enabled,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("10/hour")
def register(request: Request, body: RegisterInput, db: Session = Depends(get_db)):
    if _get_user_by_email(db, body.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    handle: str | None = None
    if body.username:
        handle = _validated_handle(body.username)
        if usernames.is_taken(db, handle):
            raise HTTPException(status_code=409, detail=_TAKEN)

    user = models.User(
        email=body.email.lower(),
        username=handle,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/username-available", response_model=UsernameAvailability)
@limiter.limit("30/minute")
def username_available(request: Request, u: str = Query(min_length=1, max_length=32), db: Session = Depends(get_db)):
    """Live check for the signup/rename field. Format errors come back as `reason`."""
    try:
        handle = usernames.clean_username(u)
    except usernames.UsernameError as err:
        return UsernameAvailability(username=u.strip(), available=False, reason=str(err))
    taken = usernames.is_taken(db, handle)
    return UsernameAvailability(username=handle, available=not taken, reason=_TAKEN if taken else None)


@router.patch("/me", response_model=UserOut)
@limiter.limit("10/hour")
def set_username(
    request: Request,
    body: UsernameInput,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    handle = _validated_handle(body.username)
    if usernames.is_taken(db, handle, exclude_user_id=user.id):
        raise HTTPException(status_code=409, detail=_TAKEN)
    user.username = handle
    db.commit()
    db.refresh(user)
    return _out(user)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("20/minute")
def login(request: Request, body: LoginInput, db: Session = Depends(get_db)):
    user = _get_user_by_email(db, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise _BAD_CREDS
    if user.is_2fa_enabled:
        return LoginResponse(mfa_required=True, mfa_token=create_mfa_token(user.id))
    return LoginResponse(access_token=create_access_token(user.id))


@router.post("/login/2fa", response_model=TokenResponse)
@limiter.limit("20/minute")
def login_2fa(request: Request, body: MfaLoginInput, db: Session = Depends(get_db)):
    user_id = decode_token(body.mfa_token, expected_scope="mfa")
    if user_id is None:
        raise HTTPException(status_code=401, detail="2FA session expired — please log in again")
    user = db.get(models.User, user_id)
    if user is None or not user.is_2fa_enabled or not user.totp_secret:
        raise _BAD_CREDS
    secret = decrypt_secret(user.totp_secret)
    if secret and verify_totp(secret, body.code):
        return TokenResponse(access_token=create_access_token(user.id))
    if _consume_recovery_code(db, user, body.code):
        return TokenResponse(access_token=create_access_token(user.id))
    raise HTTPException(status_code=401, detail="Invalid 2FA code")


@router.get("/me", response_model=UserOut)
def me(user: models.User = Depends(get_current_user)):
    return _out(user)


@router.post("/2fa/setup", response_model=TotpSetupResponse)
def totp_setup(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate (but do not yet enable) a TOTP secret; user must verify a code to enable."""
    secret = new_totp_secret()
    user.totp_secret = encrypt_secret(secret)
    user.is_2fa_enabled = False
    db.commit()
    return TotpSetupResponse(secret=secret, otpauth_uri=totp_uri(secret, user.email))


@router.post("/2fa/enable", response_model=RecoveryCodesResponse)
def totp_enable(body: CodeInput, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Start 2FA setup first")
    secret = decrypt_secret(user.totp_secret)
    if not secret or not verify_totp(secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code — try again")
    user.is_2fa_enabled = True
    # Replace any prior recovery codes with a fresh set.
    for rc in list(user.recovery_codes):
        db.delete(rc)
    codes = generate_recovery_codes()
    for c in codes:
        db.add(models.RecoveryCode(user_id=user.id, code_hash=hash_recovery_code(c)))
    db.commit()
    return RecoveryCodesResponse(recovery_codes=codes)


@router.post("/2fa/disable", status_code=204)
def totp_disable(body: CodeInput, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_2fa_enabled or not user.totp_secret:
        return
    secret = decrypt_secret(user.totp_secret)
    if not (secret and verify_totp(secret, body.code)) and not _consume_recovery_code(db, user, body.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    user.is_2fa_enabled = False
    user.totp_secret = None
    for rc in list(user.recovery_codes):
        db.delete(rc)
    db.commit()


def _consume_recovery_code(db: Session, user: models.User, code: str) -> bool:
    target = hash_recovery_code(code)
    for rc in user.recovery_codes:
        if not rc.used and rc.code_hash == target:
            rc.used = True
            db.commit()
            return True
    return False

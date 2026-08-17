"""Auth endpoints: register, login, TOTP 2FA setup/enable/disable, recovery,
password reset and email verification."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import models
import usernames
from auth_deps import get_current_user
from auth_schemas import (
    ChangePasswordInput,
    CodeInput,
    ForgotPasswordInput,
    LoginInput,
    LoginResponse,
    MessageResponse,
    MfaLoginInput,
    RecoveryCodesResponse,
    RegisterInput,
    ResetPasswordInput,
    TokenResponse,
    TotpSetupResponse,
    UsernameAvailability,
    UsernameInput,
    UserOut,
    VerifyEmailInput,
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
    hash_url_token,
    new_totp_secret,
    new_url_token,
    totp_uri,
    verify_password,
    verify_totp,
)
from db import get_db
from mailer import build_link, send_email_verification, send_password_reset
from rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Deliberately vague so attackers can't distinguish "wrong email" from "wrong password".
_BAD_CREDS = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

_TAKEN = "That username is taken"

# Same answer whether or not the address is registered — see password_forgot().
_RESET_SENT = "If that address has an account, a reset link is on its way"
_BAD_LINK = HTTPException(status_code=400, detail="That link is invalid or has expired")

_RESET_TTL = timedelta(minutes=60)
_VERIFY_TTL = timedelta(hours=24)
# Don't let a crowd of IPs mail-bomb one inbox by hammering /password/forgot.
_RESEND_COOLDOWN = timedelta(minutes=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
        email_verified=user.email_verified_at is not None,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("10/hour")
def register(
    request: Request,
    body: RegisterInput,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
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
    _send_verification(db, user, background)
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


# ── password reset ────────────────────────────────────────────────────────────

@router.post("/password/forgot", response_model=MessageResponse, status_code=202)
@limiter.limit("5/hour")
def password_forgot(
    request: Request,
    body: ForgotPasswordInput,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Email a reset link. The response is identical for unknown addresses."""
    user = _get_user_by_email(db, body.email)
    if user is not None and not _recently_issued(db, user, models.PURPOSE_PASSWORD_RESET):
        _clear_tokens(db, user, models.PURPOSE_PASSWORD_RESET)
        raw = _issue_token(db, user, models.PURPOSE_PASSWORD_RESET, _RESET_TTL)
        db.commit()
        background.add_task(send_password_reset, user.email, build_link("/account/reset", raw))
    return MessageResponse(detail=_RESET_SENT)


@router.post("/password/reset", response_model=MessageResponse)
@limiter.limit("10/hour")
def password_reset(request: Request, body: ResetPasswordInput, db: Session = Depends(get_db)):
    token = _consume_token(db, body.token, models.PURPOSE_PASSWORD_RESET)
    if token is None:
        raise _BAD_LINK
    user = db.get(models.User, token.user_id)
    if user is None:
        raise _BAD_LINK

    user.password_hash = hash_password(body.new_password)
    # Logs out every session that started before now, including whoever had the
    # account before it was taken back.
    user.password_changed_at = _now()
    db.flush()
    _clear_tokens(db, user, models.PURPOSE_PASSWORD_RESET)
    db.commit()
    # No access token on purpose: control of the inbox alone shouldn't hand out
    # a session, and 2FA accounts must still pass their second factor.
    return MessageResponse(detail="Password updated — log in with your new password")


@router.post("/password/change", response_model=TokenResponse)
@limiter.limit("10/hour")
def password_change(
    request: Request,
    body: ChangePasswordInput,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the password while logged in. Other devices are signed out."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = _now()
    _clear_tokens(db, user, models.PURPOSE_PASSWORD_RESET)
    db.commit()
    # Fresh token so the caller isn't logged out by their own change.
    return TokenResponse(access_token=create_access_token(user.id))


# ── email verification ────────────────────────────────────────────────────────

@router.post("/email/verify", response_model=MessageResponse)
@limiter.limit("20/hour")
def email_verify(request: Request, body: VerifyEmailInput, db: Session = Depends(get_db)):
    token = _consume_token(db, body.token, models.PURPOSE_EMAIL_VERIFY)
    if token is None:
        raise _BAD_LINK
    user = db.get(models.User, token.user_id)
    if user is None:
        raise _BAD_LINK
    if user.email_verified_at is None:
        user.email_verified_at = _now()
    db.commit()
    return MessageResponse(detail="Email address confirmed")


@router.post("/email/verify/request", response_model=MessageResponse, status_code=202)
@limiter.limit("3/hour")
def email_verify_request(
    request: Request,
    background: BackgroundTasks,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.email_verified_at is None:
        _send_verification(db, user, background)
    return MessageResponse(detail="Check your inbox for the confirmation link")


def _send_verification(db: Session, user: models.User, background: BackgroundTasks) -> None:
    _clear_tokens(db, user, models.PURPOSE_EMAIL_VERIFY)
    raw = _issue_token(db, user, models.PURPOSE_EMAIL_VERIFY, _VERIFY_TTL)
    db.commit()
    # Queued, so a dead mail server can't fail the request that triggered it.
    background.add_task(send_email_verification, user.email, build_link("/account/verify", raw))


# ── emailed link tokens ───────────────────────────────────────────────────────

def _issue_token(db: Session, user: models.User, purpose: str, ttl: timedelta) -> str:
    """Store the hash, return the raw token for the email. Caller commits."""
    # Spent and expired rows have no further use — a redeemed token is rejected
    # because its row is gone, not because of the used_at flag — so drop them
    # here to stop the table growing a row per request forever.
    db.execute(
        delete(models.AuthToken).where(
            models.AuthToken.user_id == user.id,
            models.AuthToken.purpose == purpose,
        )
    )
    raw = new_url_token()
    db.add(models.AuthToken(
        user_id=user.id,
        purpose=purpose,
        token_hash=hash_url_token(raw),
        expires_at=_now() + ttl,
    ))
    return raw


def _clear_tokens(db: Session, user: models.User, purpose: str) -> None:
    """Drop the user's outstanding tokens of one purpose. Caller commits."""
    db.execute(
        delete(models.AuthToken).where(
            models.AuthToken.user_id == user.id,
            models.AuthToken.purpose == purpose,
            models.AuthToken.used_at.is_(None),
        )
    )


def _recently_issued(db: Session, user: models.User, purpose: str) -> bool:
    newest = db.scalar(
        select(models.AuthToken.created_at)
        .where(
            models.AuthToken.user_id == user.id,
            models.AuthToken.purpose == purpose,
            models.AuthToken.used_at.is_(None),
        )
        .order_by(models.AuthToken.created_at.desc())
        .limit(1)
    )
    return newest is not None and _now() - _aware(newest) < _RESEND_COOLDOWN


def _consume_token(db: Session, raw: str, purpose: str) -> models.AuthToken | None:
    """Look a token up by hash and mark it used. None if it can't be redeemed.

    The lookup is a single indexed comparison on the digest, so an unknown token
    costs the same as a known one.
    """
    token = db.scalar(select(models.AuthToken).where(models.AuthToken.token_hash == hash_url_token(raw)))
    if token is None or token.purpose != purpose or token.used_at is not None:
        return None
    if _aware(token.expires_at) <= _now():
        return None
    token.used_at = _now()
    return token


def _aware(value: datetime) -> datetime:
    """SQLite returns naive datetimes; everything is written as UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

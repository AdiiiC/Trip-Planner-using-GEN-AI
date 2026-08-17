"""Password hashing, JWT issue/verify, TOTP secret encryption, recovery codes."""
from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
from cryptography.fernet import Fernet, InvalidToken
from passlib.context import CryptContext

from config import settings

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")

# Derive a stable Fernet key from the JWT secret so TOTP secrets are encrypted
# at rest without needing a second env var.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest()))


# ── passwords ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _pwd.verify(password, password_hash)
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def _encode(sub: str, scope: str, ttl: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "scope": scope, "iat": now, "exp": now + timedelta(seconds=ttl)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(user_id: int) -> str:
    return _encode(str(user_id), "access", settings.jwt_access_ttl)


def create_mfa_token(user_id: int) -> str:
    """Short-lived token proving the password step passed, pending a TOTP code."""
    return _encode(str(user_id), "mfa", settings.jwt_mfa_ttl)


def decode_token_claims(token: str, expected_scope: str) -> tuple[int, datetime] | None:
    """The user id plus when the token was issued, or None if it isn't usable.

    Callers need `iat` to reject tokens minted before a password change.
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("scope") != expected_scope:
        return None
    try:
        user_id = int(payload["sub"])
        issued_at = datetime.fromtimestamp(int(payload["iat"]), tz=timezone.utc)
    except (KeyError, ValueError, TypeError, OverflowError, OSError):
        return None
    return user_id, issued_at


def decode_token(token: str, expected_scope: str) -> int | None:
    claims = decode_token_claims(token, expected_scope)
    return None if claims is None else claims[0]


# ── TOTP ──────────────────────────────────────────────────────────────────────

def new_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return None


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.totp_issuer)


def verify_totp(secret: str, code: str) -> bool:
    # valid_window=1 tolerates ~30s clock drift between phone and server.
    return pyotp.TOTP(secret).verify((code or "").strip().replace(" ", ""), valid_window=1)


# ── recovery codes ──────────────────────────────────────────────────────────

def generate_recovery_codes(n: int = 8) -> list[str]:
    return ["-".join(secrets.token_hex(2) for _ in range(2)) for _ in range(n)]


def hash_recovery_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


# ── emailed link tokens ─────────────────────────────────────────────────────

def new_url_token() -> str:
    """Password-reset / email-verification token. 32 bytes of entropy, URL-safe."""
    return secrets.token_urlsafe(32)


def hash_url_token(token: str) -> str:
    """Only this digest is stored, so a leaked database can't be replayed."""
    return hashlib.sha256(token.strip().encode()).hexdigest()

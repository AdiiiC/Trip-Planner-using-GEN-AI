"""FastAPI dependency that resolves the current user from a Bearer token."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import models
from auth_security import decode_token_claims
from db import get_db
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

_UNAUTHORIZED = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

# `iat` has one-second resolution, so a token minted in the same second as the
# password change would otherwise look older than it. Forgive a few seconds.
_SKEW = timedelta(seconds=5)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    claims = decode_token_claims(token, expected_scope="access")
    if claims is None:
        raise _UNAUTHORIZED
    user_id, issued_at = claims
    user = db.get(models.User, user_id)
    if user is None or _predates_password_change(user, issued_at):
        raise _UNAUTHORIZED
    return user


def _predates_password_change(user: models.User, issued_at: datetime) -> bool:
    """Changing the password logs out every session that started before it."""
    changed_at = user.password_changed_at
    if changed_at is None:
        return False
    if changed_at.tzinfo is None:
        # SQLite hands back naive datetimes; they were written as UTC.
        changed_at = changed_at.replace(tzinfo=UTC)
    return issued_at < changed_at - _SKEW

"""Display-handle rules: format validation, reserved names, case-insensitive lookup."""
from __future__ import annotations

import re

import models
from sqlalchemy import func, select
from sqlalchemy.orm import Session

MIN_LEN = 3
MAX_LEN = 20

# Allow-list only: a leading letter then letters/digits/underscores. Keeps handles
# URL-safe and stops look-alike tricks such as leading dots or spaces.
_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")

# Names that would be confusing or impersonate the product / a system account.
RESERVED = frozenset({
    "admin", "administrator", "root", "superuser", "sysadmin", "moderator", "mod",
    "staff", "team", "support", "help", "billing", "security", "abuse", "noreply",
    "api", "auth", "login", "logout", "signup", "register", "account", "settings",
    "me", "user", "users", "profile", "wayfare", "tripplanner", "system",
    "null", "undefined", "none", "anonymous", "guest", "everyone", "all",
})


class UsernameError(ValueError):
    """Raised with a message that is safe to show the user verbatim."""


def clean_username(raw: str) -> str:
    """Validate a proposed handle and return it with the user's casing intact."""
    handle = (raw or "").strip()
    if not (MIN_LEN <= len(handle) <= MAX_LEN):
        raise UsernameError(f"Username must be {MIN_LEN}-{MAX_LEN} characters")
    if not _PATTERN.match(handle):
        raise UsernameError("Start with a letter; use only letters, numbers and underscores")
    if handle.endswith("_") or "__" in handle:
        raise UsernameError("Underscores can't be doubled or come last")
    if handle.lower() in RESERVED:
        raise UsernameError("That username is reserved")
    return handle


def find_by_username(db: Session, handle: str) -> models.User | None:
    return db.scalar(select(models.User).where(func.lower(models.User.username) == handle.lower()))


def is_taken(db: Session, handle: str, *, exclude_user_id: int | None = None) -> bool:
    owner = find_by_username(db, handle)
    return owner is not None and owner.id != exclude_user_id


def display_name(user: models.User) -> str:
    """What the UI shows. Falls back to the local part of the email, never the full address."""
    return user.username or user.email.split("@", 1)[0]

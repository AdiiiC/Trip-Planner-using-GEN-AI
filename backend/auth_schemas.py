"""Pydantic request/response schemas for auth and budget-plan endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator
from usernames import MAX_LEN as USERNAME_MAX


class RegisterInput(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Optional at signup so the form stays short; it can be chosen later.
    # Format is checked in the route so failures come back as a readable 400.
    username: str | None = Field(default=None, max_length=USERNAME_MAX)

    @field_validator("username", mode="before")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return None if v is None or not str(v).strip() else str(v).strip()


class LoginInput(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=1, max_length=128)


class MfaLoginInput(BaseModel):
    mfa_token: str
    code:      str = Field(min_length=6, max_length=20)


class CodeInput(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class ForgotPasswordInput(BaseModel):
    email: EmailStr


# `new_password` mirrors RegisterInput.password so a reset can't sneak past the
# strength rules signup enforces.
class ResetPasswordInput(BaseModel):
    token:        str = Field(min_length=16, max_length=512)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password:     str = Field(min_length=8, max_length=128)


class VerifyEmailInput(BaseModel):
    token: str = Field(min_length=16, max_length=512)


class MessageResponse(BaseModel):
    """Deliberately bland text for flows that must not reveal account state."""
    detail: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"


class LoginResponse(BaseModel):
    mfa_required: bool = False
    mfa_token:    str | None = None
    access_token: str | None = None
    token_type:   str = "bearer"


class UsernameInput(BaseModel):
    username: str = Field(min_length=1, max_length=USERNAME_MAX)


class UsernameAvailability(BaseModel):
    username:  str
    available: bool
    reason:    str | None = None


class UserOut(BaseModel):
    id:              int
    email:           EmailStr
    username:        str | None
    # What the UI should print. Never the full email address.
    display_name:    str
    is_2fa_enabled:  bool
    # Nothing is gated on this — the UI only nudges.
    email_verified:  bool


class TotpSetupResponse(BaseModel):
    secret:   str
    otpauth_uri: str


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class PlanInput(BaseModel):
    name:    str = Field(min_length=1, max_length=200)
    payload: dict[str, Any]
    # The computed result, stored alongside the inputs so saved plans can be listed
    # and ranked without recalculating each one. Optional: a plan can be saved
    # before it has ever been calculated.
    result:    dict[str, Any] | None = None
    total_inr: float | None = Field(default=None, ge=0)
    nights:    int | None   = Field(default=None, ge=0, le=365)


class PlanOut(BaseModel):
    id:         int
    name:       str
    payload:    dict[str, Any]
    result:     dict[str, Any] | None = None
    total_inr:  float | None = None
    nights:     int | None = None
    version_count: int = 0
    created_at: str
    updated_at: str


class PlanVersionOut(BaseModel):
    """A past state of a plan, newest first. `payload` drives the diff view."""
    id:         int
    payload:    dict[str, Any]
    total_inr:  float | None = None
    created_at: str

"""Pydantic request/response schemas for auth and budget-plan endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RegisterInput(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=1, max_length=128)


class MfaLoginInput(BaseModel):
    mfa_token: str
    code:      str = Field(min_length=6, max_length=20)


class CodeInput(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"


class LoginResponse(BaseModel):
    mfa_required: bool = False
    mfa_token:    str | None = None
    access_token: str | None = None
    token_type:   str = "bearer"


class UserOut(BaseModel):
    id:              int
    email:           EmailStr
    is_2fa_enabled:  bool


class TotpSetupResponse(BaseModel):
    secret:   str
    otpauth_uri: str


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class PlanInput(BaseModel):
    name:    str = Field(min_length=1, max_length=200)
    payload: dict[str, Any]


class PlanOut(BaseModel):
    id:         int
    name:       str
    payload:    dict[str, Any]
    created_at: str
    updated_at: str

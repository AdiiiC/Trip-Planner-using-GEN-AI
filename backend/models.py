"""ORM models: users, their saved budget plans (with history), 2FA recovery codes
and the short-lived tokens behind password reset / email verification."""
from __future__ import annotations

from datetime import UTC, datetime

from db import Base
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Token purposes for `AuthToken.purpose`.
PURPOSE_PASSWORD_RESET = "password_reset"
PURPOSE_EMAIL_VERIFY = "email_verify"


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]  = mapped_column(Integer, primary_key=True)
    email:         Mapped[str]  = mapped_column(String(320), unique=True, index=True, nullable=False)
    # Public display handle. Null for accounts created before handles existed, and
    # for anyone who signs up without choosing one; uniqueness is case-insensitive
    # (see the functional index below) while the chosen casing is preserved.
    username:      Mapped[str | None] = mapped_column(String(32), nullable=True)
    password_hash: Mapped[str]  = mapped_column(String(255), nullable=False)
    # Encrypted TOTP secret (Fernet); null until 2FA is set up.
    totp_secret:   Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Null until the address is proven. Nothing is gated on it yet — the UI just
    # nudges — but it's the flag any future gating should read.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Access tokens issued before this instant are rejected, so a password reset
    # logs out every other device.
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    plans:          Mapped[list[BudgetPlan]]   = relationship(back_populates="user", cascade="all, delete-orphan")
    recovery_codes: Mapped[list[RecoveryCode]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tokens:         Mapped[list[AuthToken]]    = relationship(back_populates="user", cascade="all, delete-orphan")


# "aadhi_123" and "Aadhi_123" must not be two different accounts. NULLs stay
# exempt on both SQLite and Postgres, so handle-less accounts are unaffected.
Index("ix_users_username_lower", func.lower(User.username), unique=True)


class BudgetPlan(Base):
    __tablename__ = "budget_plans"

    id:         Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name:       Mapped[str] = mapped_column(String(200), nullable=False)
    payload:    Mapped[str] = mapped_column(Text, nullable=False)  # JSON-serialized form values
    # Last computed BudgetResult, kept so plans can be listed and ranked without
    # recalculating every one of them.
    result:     Mapped[str | None]   = mapped_column(Text, nullable=True)
    total_inr:  Mapped[float | None] = mapped_column(Float, nullable=True)
    nights:     Mapped[int | None]   = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user:     Mapped[User] = relationship(back_populates="plans")
    versions: Mapped[list[PlanVersion]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanVersion.created_at.desc()"
    )


class PlanVersion(Base):
    """Snapshot of a plan as it was *before* an edit, for the history/diff view."""
    __tablename__ = "plan_versions"

    id:         Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id:    Mapped[int] = mapped_column(ForeignKey("budget_plans.id", ondelete="CASCADE"), index=True, nullable=False)
    payload:    Mapped[str] = mapped_column(Text, nullable=False)
    result:     Mapped[str | None]   = mapped_column(Text, nullable=True)
    total_inr:  Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    plan: Mapped[BudgetPlan] = relationship(back_populates="versions")


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    user_id:   Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    code_hash: Mapped[str]  = mapped_column(String(255), nullable=False)
    used:      Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User] = relationship(back_populates="recovery_codes")


class AuthToken(Base):
    """Single-use, expiring token for password reset and email verification.

    Only the SHA-256 of the token is stored, so a database leak can't be replayed.
    """
    __tablename__ = "auth_tokens"

    id:         Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    purpose:    Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="tokens")

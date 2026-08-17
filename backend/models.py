"""ORM models: users, their saved budget plans, and 2FA recovery codes."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]  = mapped_column(Integer, primary_key=True)
    email:         Mapped[str]  = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str]  = mapped_column(String(255), nullable=False)
    # Encrypted TOTP secret (Fernet); null until 2FA is set up.
    totp_secret:   Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    plans:          Mapped[list["BudgetPlan"]]   = relationship(back_populates="user", cascade="all, delete-orphan")
    recovery_codes: Mapped[list["RecoveryCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class BudgetPlan(Base):
    __tablename__ = "budget_plans"

    id:         Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name:       Mapped[str] = mapped_column(String(200), nullable=False)
    payload:    Mapped[str] = mapped_column(Text, nullable=False)  # JSON-serialized form values
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="plans")


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    user_id:   Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    code_hash: Mapped[str]  = mapped_column(String(255), nullable=False)
    used:      Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="recovery_codes")

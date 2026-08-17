"""Baseline: accounts, saved budget plans, 2FA recovery codes.

This is the schema as it existed before Alembic was introduced. Databases created
by the old `create_all` path are stamped at this revision rather than running it
(see backend/migrate.py), so it only ever executes on a fresh database.

Revision ID: 0001
Revises:
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("totp_secret", sa.String(length=255), nullable=True),
        sa.Column("is_2fa_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "budget_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_budget_plans_user_id", "budget_plans", ["user_id"])

    op.create_table(
        "recovery_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_recovery_codes_user_id", "recovery_codes", ["user_id"])


def downgrade() -> None:
    op.drop_table("recovery_codes")
    op.drop_table("budget_plans")
    op.drop_table("users")

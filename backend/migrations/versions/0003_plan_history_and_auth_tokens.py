"""Store computed plan results, keep plan history, add password-reset /
email-verification tokens.

Revision ID: 0003
Revises: 0002
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    plan_columns = _columns("budget_plans")
    if "result" not in plan_columns:
        op.add_column("budget_plans", sa.Column("result", sa.Text(), nullable=True))
    if "total_inr" not in plan_columns:
        op.add_column("budget_plans", sa.Column("total_inr", sa.Float(), nullable=True))
    if "nights" not in plan_columns:
        op.add_column("budget_plans", sa.Column("nights", sa.Integer(), nullable=True))

    user_columns = _columns("users")
    if "email_verified_at" not in user_columns:
        op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    if "password_changed_at" not in user_columns:
        op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))

    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "plan_versions" not in tables:
        op.create_table(
            "plan_versions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("budget_plans.id", ondelete="CASCADE"), nullable=False),
            sa.Column("payload", sa.Text(), nullable=False),
            sa.Column("result", sa.Text(), nullable=True),
            sa.Column("total_inr", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_plan_versions_plan_id", "plan_versions", ["plan_id"])

    if "auth_tokens" not in tables:
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("purpose", sa.String(length=32), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
        op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_table("auth_tokens")
    op.drop_table("plan_versions")
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "email_verified_at")
    op.drop_column("budget_plans", "nights")
    op.drop_column("budget_plans", "total_inr")
    op.drop_column("budget_plans", "result")

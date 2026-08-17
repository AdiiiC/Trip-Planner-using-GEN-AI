"""Add display handles (users.username) with case-insensitive uniqueness.

Revision ID: 0002
Revises: 0001
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # A short-lived pre-Alembic release added this column directly, so tolerate
    # databases where it is already present.
    if not _has_column("users", "username"):
        op.add_column("users", sa.Column("username", sa.String(length=32), nullable=True))
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_username_lower")
    op.drop_column("users", "username")

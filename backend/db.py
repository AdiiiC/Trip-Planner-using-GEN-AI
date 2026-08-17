"""SQLAlchemy database layer. SQLite by default; set DATABASE_URL for Postgres."""
from __future__ import annotations

import logging
from collections.abc import Iterator

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import settings

logger = logging.getLogger(__name__)

# Render hands out "postgres://" URLs; pin the psycopg (v3) driver explicitly so
# SQLAlchemy doesn't default to psycopg2 (which lacks wheels on newer Python).
_db_url = settings.database_url
if _db_url.startswith("postgres://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgres://"):]
elif _db_url.startswith("postgresql://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgresql://"):]

# SQLite needs check_same_thread off for FastAPI's threadpool; Postgres ignores it.
_is_sqlite = _db_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(_db_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    import models  # noqa: F401 — register mappers before create_all
    Base.metadata.create_all(bind=engine)
    _add_username_column()
    _seed_owner_username()


def _add_username_column() -> None:
    """Additive migration for databases created before handles existed.

    `create_all` skips tables that already exist, so an already-deployed `users`
    table never gains the new column on its own and there is no Alembic setup here.
    Both statements are idempotent and safe to run on every boot.
    """
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return

    needs_column = "username" not in {c["name"] for c in insp.get_columns("users")}
    with engine.begin() as conn:
        if needs_column:
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(32)"))
        # SQLite reflection can't see expression indexes, so ask for it
        # unconditionally instead of checking whether it already exists.
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))"
        ))
    if needs_column:
        logger.info("db: added users.username column")


def _seed_owner_username() -> None:
    """Backfill the handle for the account that predates this feature.

    The project owner's test account was created without a handle. Set
    SEED_USERNAME_EMAIL to pin the handle to that exact address; otherwise the
    oldest handle-less account (the original signup) gets it.
    """
    handle = settings.seed_username.strip()
    if not handle:
        return

    import models

    with SessionLocal() as db:
        if db.scalar(select(models.User).where(func.lower(models.User.username) == handle.lower())):
            return  # already claimed — nothing to do

        query = select(models.User).where(models.User.username.is_(None))
        target_email = settings.seed_username_email.strip().lower()
        query = (
            query.where(models.User.email == target_email)
            if target_email
            else query.order_by(models.User.id)
        )
        user = db.scalars(query.limit(1)).first()
        if user is None:
            return

        user.username = handle
        db.commit()
        logger.info("db: seeded username %s for user id=%d", handle, user.id)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

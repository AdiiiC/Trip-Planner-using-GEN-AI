"""Runs Alembic migrations at startup.

Render deploys straight from a git push with no release step, so migrations run
in-process when the app boots. Databases that predate Alembic (created by the old
`create_all` path) are stamped at the baseline revision first, so their existing
tables aren't recreated.
"""
from __future__ import annotations

import logging
import pathlib

from sqlalchemy import inspect

from db import engine

logger = logging.getLogger(__name__)

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent
_BASELINE_REVISION = "0001"


def _config():
    from alembic.config import Config

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    return cfg


def run_migrations() -> bool:
    """Bring the database to head. Returns False if Alembic couldn't run at all."""
    try:
        from alembic import command
    except ImportError:
        logger.warning("alembic is not installed — falling back to create_all")
        return False

    cfg = _config()
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        if "users" in tables and "alembic_version" not in tables:
            # Pre-Alembic database: adopt it at the baseline instead of trying to
            # create tables that are already there.
            command.stamp(cfg, _BASELINE_REVISION)
            logger.info("db: stamped pre-existing schema at revision %s", _BASELINE_REVISION)
        command.upgrade(cfg, "head")
        logger.info("db: migrations up to date")
        return True
    except Exception:
        logger.exception("db: migrations failed — falling back to create_all")
        return False

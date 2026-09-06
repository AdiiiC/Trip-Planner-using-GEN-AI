"""Session-wide test setup: never let a test touch the real database.

`db.py` builds its engine at import time, so the first module to import it pins
the file for the whole run. A module that sets DATABASE_URL for itself therefore
only wins when it happens to import `db` first — and when it loses, it silently
registers its test users in the developer's tripplanner.db. pytest imports
conftest before collecting any test module, which makes this the one place the
choice can be made reliably.
"""
from __future__ import annotations

import os
import pathlib
import secrets
import sys
import tempfile

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_DB = pathlib.Path(tempfile.gettempdir()) / "tripplanner-tests.db"
_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
# Tests must not depend on the insecure development default; config treats it as
# a startup failure, and the token tests should exercise a realistic key length.
os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
# The owner-handle backfill runs on startup and claims SEED_USERNAME for whichever
# account registered first, which collides with tests that register that handle
# themselves. It is a one-off production migration, not behaviour under test.
os.environ["SEED_USERNAME"] = ""


@pytest.fixture(scope="session", autouse=True)
def _isolate_share_store():
    """Keep the suite off the repo's data/shares.json.

    Without Redis, shares persist to a file that is checked in. One module used
    to repoint main._SHARES_FILE at import time, which leaked into every other
    module and made behaviour depend on collection order: the whole suite wrote
    to a scratch file, but that module alone wrote to the repo. Seeded from the
    real file so read-only tests still see the demo shares.
    """
    import main

    original = main._SHARES_FILE
    scratch = pathlib.Path(tempfile.gettempdir()) / "tripplanner-test-shares.json"
    scratch.write_text(original.read_text() if original.exists() else "{}")
    main._SHARES_FILE = scratch
    yield
    main._SHARES_FILE = original
    scratch.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def client():
    """The app itself, in-process.

    Entered as a context manager so startup runs; a bare TestClient(app) skips
    the lifespan and silently leaves the schema uncreated.
    """
    import main
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c

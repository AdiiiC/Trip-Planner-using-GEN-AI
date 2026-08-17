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
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_DB = pathlib.Path(tempfile.gettempdir()) / "tripplanner-tests.db"
_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"

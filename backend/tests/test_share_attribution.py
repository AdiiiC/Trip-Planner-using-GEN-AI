"""A shared trip credits the sharer's handle — and nothing else about them."""
from __future__ import annotations

import os
import pathlib
import tempfile

# Without Redis the share store falls back to a JSON file in the repo.
os.environ.setdefault("REDIS_URL", "")

import main
import pytest
from db import init_db
from fastapi.testclient import TestClient
from main import app

# Send those writes to a scratch file instead.
main._SHARES_FILE = pathlib.Path(tempfile.gettempdir()) / "test_shares.json"
main._SHARES_FILE.unlink(missing_ok=True)

# TestClient only fires startup events inside a context manager, so migrate here.
init_db()
client = TestClient(app)

_TRIP = {
    "title": "Bangkok Weekend",
    "city": "Bangkok",
    "country": "Thailand",
    "days": 3,
    "markdown": "# Trip\n\nDay 1: temples\nDay 2: markets",
}


def _register(email: str, username: str | None = None) -> str:
    body = {"email": email, "password": "Str0ng-Passw0rd!"}
    if username:
        body["username"] = username
    res = client.post("/api/auth/register", json=body)
    assert res.status_code in (200, 201), res.text
    return res.json()["access_token"]


def _share(headers: dict[str, str] | None = None) -> dict:
    res = client.post("/api/share", json=_TRIP, headers=headers or {})
    assert res.status_code == 200, res.text
    fetched = client.get(f"/api/share/{res.json()['id']}")
    assert fetched.status_code == 200, fetched.text
    return fetched.json()


def test_anonymous_shares_stay_anonymous():
    assert _share()["author"] == ""


def test_a_logged_in_sharer_with_a_handle_is_credited():
    token = _register("sharer@example.com", "Aadhi_123")
    assert _share({"Authorization": f"Bearer {token}"})["author"] == "Aadhi_123"


def test_a_sharer_without_a_handle_is_not_identified_by_email():
    token = _register("nohandle@example.com")
    entry = _share({"Authorization": f"Bearer {token}"})
    assert entry["author"] == ""
    # The public payload must not carry the address in any form.
    assert "nohandle" not in str(entry)


@pytest.mark.parametrize("header", ["Bearer not-a-token", "Basic abc", "", "Bearer "])
def test_a_bad_token_still_shares_just_without_a_name(header: str):
    assert _share({"Authorization": header} if header else {})["author"] == ""

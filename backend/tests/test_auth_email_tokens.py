"""Password reset, session invalidation and email verification.

Runs against a throwaway SQLite file and a mini app that mounts only the auth
router, so nothing here touches the developer's real tripplanner.db.
Run:  cd backend && pytest tests/test_auth_email_tokens.py -v
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import auth_routes  # noqa: E402
import models  # noqa: E402
from auth_routes import router as auth_router  # noqa: E402
from config import settings  # noqa: E402
from db import Base, get_db  # noqa: E402
from rate_limit import limiter  # noqa: E402

PASSWORD = "correct-horse-battery"
NEW_PASSWORD = "staple-battery-horse"


@pytest.fixture(scope="module")
def sessions(tmp_path_factory):
    engine = create_engine(
        f"sqlite:///{tmp_path_factory.mktemp('db') / 'auth.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield sessionmaker(bind=engine, autoflush=False, autocommit=False)
    engine.dispose()


@pytest.fixture(scope="module")
def client(sessions):
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(auth_router)

    def _db():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    # The real per-IP limits (5/hour on forgot-password) would trip mid-suite.
    was_enabled, limiter.enabled = limiter.enabled, False
    with TestClient(app) as c:
        yield c
    limiter.enabled = was_enabled


@pytest.fixture
def mailbox(monkeypatch):
    """Collects the links that would have been emailed, in send order."""
    sent: list[tuple[str, str, str]] = []

    def capture(kind: str):
        def _send(to: str, link: str) -> bool:
            sent.append((kind, to, link))
            return True
        return _send

    monkeypatch.setattr(auth_routes, "send_password_reset", capture("reset"))
    monkeypatch.setattr(auth_routes, "send_email_verification", capture("verify"))
    return sent


# ── helpers ───────────────────────────────────────────────────────────────────

_counter = iter(range(1, 1000))


def register(client) -> tuple[str, str]:
    """Create an account. Returns its email and access token."""
    email = f"user{next(_counter)}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return email, r.json()["access_token"]


def token_from(link: str) -> str:
    return link.split("token=", 1)[1]


def links(mailbox, kind: str) -> list[str]:
    return [link for k, _, link in mailbox if k == kind]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def backdated_access_token(user_id: int, age: timedelta) -> str:
    """An access token as it would look after a while — i.e. older than the
    clock-skew leeway `get_current_user` allows."""
    issued = datetime.now(timezone.utc) - age
    return jwt.encode(
        {"sub": str(user_id), "scope": "access", "iat": issued, "exp": issued + timedelta(days=7)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def newest_token_id(db, email: str, purpose: str) -> int:
    user = db.scalar(select(models.User).where(models.User.email == email))
    return db.scalar(
        select(models.AuthToken.id)
        .where(models.AuthToken.user_id == user.id, models.AuthToken.purpose == purpose)
        .order_by(models.AuthToken.id.desc())
        .limit(1)
    )


# ── password reset ────────────────────────────────────────────────────────────

def test_reset_happy_path(client, mailbox):
    email, _ = register(client)

    r = client.post("/api/auth/password/forgot", json={"email": email})
    assert r.status_code == 202
    link = links(mailbox, "reset")[0]
    assert link.startswith(f"{settings.app_base_url}/account/reset?token=")

    r = client.post("/api/auth/password/reset",
                    json={"token": token_from(link), "new_password": NEW_PASSWORD})
    assert r.status_code == 200
    # A reset must not hand out a session — only the inbox was proven.
    assert "access_token" not in r.json()

    assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD}).status_code == 200


def test_reset_rejects_expired_token(client, mailbox, sessions):
    email, _ = register(client)
    client.post("/api/auth/password/forgot", json={"email": email})
    link = links(mailbox, "reset")[0]

    with sessions() as db:
        row = db.get(models.AuthToken, newest_token_id(db, email, models.PURPOSE_PASSWORD_RESET))
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    r = client.post("/api/auth/password/reset",
                    json={"token": token_from(link), "new_password": NEW_PASSWORD})
    assert r.status_code == 400
    assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


def test_reset_token_works_only_once(client, mailbox):
    email, _ = register(client)
    client.post("/api/auth/password/forgot", json={"email": email})
    token = token_from(links(mailbox, "reset")[0])

    assert client.post("/api/auth/password/reset",
                       json={"token": token, "new_password": NEW_PASSWORD}).status_code == 200
    replay = client.post("/api/auth/password/reset",
                         json={"token": token, "new_password": "third-password-here"})
    assert replay.status_code == 400
    # The replay must not have taken effect.
    assert client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD}).status_code == 200


def test_forgot_is_identical_for_unknown_email(client, mailbox):
    email, _ = register(client)
    known = client.post("/api/auth/password/forgot", json={"email": email})
    unknown = client.post("/api/auth/password/forgot", json={"email": "nobody@example.com"})

    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(links(mailbox, "reset")) == 1  # nothing was sent to the unknown address


def test_forgot_replaces_the_previous_link(client, mailbox, sessions):
    """Only the newest link stays redeemable, so a leaked older mail is dead."""
    email, _ = register(client)
    client.post("/api/auth/password/forgot", json={"email": email})
    first = token_from(links(mailbox, "reset")[0])

    # Sidestep the one-minute resend cooldown that guards a single inbox.
    with sessions() as db:
        row = db.get(models.AuthToken, newest_token_id(db, email, models.PURPOSE_PASSWORD_RESET))
        row.created_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

    client.post("/api/auth/password/forgot", json={"email": email})
    second = token_from(links(mailbox, "reset")[1])
    assert first != second

    assert client.post("/api/auth/password/reset",
                       json={"token": first, "new_password": NEW_PASSWORD}).status_code == 400
    assert client.post("/api/auth/password/reset",
                       json={"token": second, "new_password": NEW_PASSWORD}).status_code == 200


def test_reset_enforces_password_length(client, mailbox):
    email, _ = register(client)
    client.post("/api/auth/password/forgot", json={"email": email})
    r = client.post("/api/auth/password/reset",
                    json={"token": token_from(links(mailbox, "reset")[0]), "new_password": "short"})
    assert r.status_code == 422  # same min_length=8 as register()


# ── session invalidation ──────────────────────────────────────────────────────

def test_reset_logs_out_existing_sessions(client, mailbox):
    email, token = register(client)
    user_id = client.get("/api/auth/me", headers=auth(token)).json()["id"]
    old_token = backdated_access_token(user_id, timedelta(days=1))
    assert client.get("/api/auth/me", headers=auth(old_token)).status_code == 200

    client.post("/api/auth/password/forgot", json={"email": email})
    client.post("/api/auth/password/reset",
                json={"token": token_from(links(mailbox, "reset")[0]), "new_password": NEW_PASSWORD})

    assert client.get("/api/auth/me", headers=auth(old_token)).status_code == 401

    fresh = client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD}).json()["access_token"]
    assert client.get("/api/auth/me", headers=auth(fresh)).status_code == 200


def test_password_change_keeps_the_caller_signed_in(client, mailbox):
    email, token = register(client)
    user_id = client.get("/api/auth/me", headers=auth(token)).json()["id"]
    other_device = backdated_access_token(user_id, timedelta(hours=2))

    wrong = client.post("/api/auth/password/change", headers=auth(token),
                        json={"current_password": "not-it", "new_password": NEW_PASSWORD})
    assert wrong.status_code == 400

    r = client.post("/api/auth/password/change", headers=auth(token),
                    json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=auth(r.json()["access_token"])).status_code == 200
    assert client.get("/api/auth/me", headers=auth(other_device)).status_code == 401


# ── email verification ────────────────────────────────────────────────────────

def test_register_sends_a_verification_link(client, mailbox):
    _, token = register(client)
    assert links(mailbox, "verify")[0].startswith(f"{settings.app_base_url}/account/verify?token=")
    assert client.get("/api/auth/me", headers=auth(token)).json()["email_verified"] is False


def test_email_verification_flips_the_flag(client, mailbox):
    _, token = register(client)
    raw = token_from(links(mailbox, "verify")[0])

    assert client.post("/api/auth/email/verify", json={"token": raw}).status_code == 200
    assert client.get("/api/auth/me", headers=auth(token)).json()["email_verified"] is True

    # Single use, same bland error as any bad link.
    replay = client.post("/api/auth/email/verify", json={"token": raw})
    assert replay.status_code == 400
    assert client.get("/api/auth/me", headers=auth(token)).json()["email_verified"] is True


def test_email_verification_rejects_a_reset_token(client, mailbox):
    """Purposes aren't interchangeable."""
    email, _ = register(client)
    client.post("/api/auth/password/forgot", json={"email": email})
    reset = token_from(links(mailbox, "reset")[0])
    assert client.post("/api/auth/email/verify", json={"token": reset}).status_code == 400


def test_verification_resend(client, mailbox):
    _, token = register(client)
    assert len(links(mailbox, "verify")) == 1

    r = client.post("/api/auth/email/verify/request", headers=auth(token))
    assert r.status_code == 202
    resent = links(mailbox, "verify")
    assert len(resent) == 2
    assert client.post("/api/auth/email/verify", json={"token": token_from(resent[1])}).status_code == 200

    # Already verified — still a success, but no second mail.
    assert client.post("/api/auth/email/verify/request", headers=auth(token)).status_code == 202
    assert len(links(mailbox, "verify")) == 2


def test_verification_request_needs_a_session(client):
    assert client.post("/api/auth/email/verify/request").status_code == 401

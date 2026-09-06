"""Regressions for the hardening pass: injection escaping, startup guards, health."""
from __future__ import annotations

import logging
from unittest.mock import patch

import main
import pytest
import rate_limit
from agents.export import ExportEvent, ExportInput, build_ics
from config import INSECURE_JWT_SECRET, Settings
from fastapi.testclient import TestClient
from main import _safe_filename


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


# ── availability ──────────────────────────────────────────────────────────────

def test_liveness_has_no_dependencies(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness_reports_database(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    assert r.json()["checks"]["database"]["ok"] is True


def test_readiness_is_503_when_database_is_down(client):
    with patch("main.check_database", return_value=(False, "OperationalError")):
        r = client.get("/readyz")
    assert r.status_code == 503
    assert r.json()["status"] == "unready"


def test_missing_llm_key_does_not_fail_readiness(client):
    """Providers degrade gracefully, so they must not take the instance out of rotation."""
    with patch.object(type(main.settings), "has_groq", property(lambda _: False)), \
         patch.object(type(main.settings), "has_fallback", property(lambda _: False)):
        r = client.get("/readyz")
    assert r.status_code == 200


# ── injection ─────────────────────────────────────────────────────────────────

def test_download_filename_cannot_inject_headers():
    got = _safe_filename('Trip"; filename="evil.html\r\nX-Injected: yes')
    assert '"' not in got and "\r" not in got and "\n" not in got


def test_download_filename_falls_back_when_title_is_all_punctuation():
    assert _safe_filename("!!!") == "trip"


def test_ics_escapes_carriage_returns():
    """The injected text must stay inside the SUMMARY value, not become new properties."""
    ics = build_ics(ExportInput(
        title="T",
        events=[ExportEvent(title="Museum\r\nDTSTART:19700101T000000\r\nSUMMARY:Forged")],
    ))
    lines = ics.split("\r\n")
    assert sum(line.startswith("SUMMARY:") for line in lines) == 1
    assert sum(line.startswith("DTSTART:") for line in lines) == 1
    assert "Museum\\nDTSTART:19700101T000000\\nSUMMARY:Forged" in ics


# ── configuration guards ──────────────────────────────────────────────────────

def test_production_refuses_default_jwt_secret():
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(ENVIRONMENT="production", JWT_SECRET=INSECURE_JWT_SECRET).assert_production_ready()


def test_production_refuses_short_jwt_secret():
    with pytest.raises(RuntimeError, match="at least 32"):
        Settings(ENVIRONMENT="production", JWT_SECRET="short").assert_production_ready()


def test_production_refuses_debug_mode():
    with pytest.raises(RuntimeError, match="DEBUG"):
        Settings(ENVIRONMENT="production", JWT_SECRET="x" * 48, DEBUG=True).assert_production_ready()


def test_strong_secret_passes():
    assert Settings(ENVIRONMENT="production", JWT_SECRET="x" * 48).insecure_settings() == []


# ── CORS ──────────────────────────────────────────────────────────────────────

def test_cors_does_not_allow_arbitrary_origins(client):
    r = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert r.headers.get("access-control-allow-origin") is None


def test_cors_allows_the_local_frontend(client):
    r = client.get("/healthz", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


# A deploy with ALLOWED_ORIGINS unset answered every frontend preflight with a
# bare 400 and no allow-origin header, so login failed in the browser with only
# "Load failed" to go on -- no status, no log line, nothing to search for.

def test_preflight_from_an_unlisted_origin_is_rejected(client):
    r = client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://trip-planner.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.headers.get("access-control-allow-origin") is None


def test_configured_frontend_origin_passes_preflight():
    origin = "https://trip-planner.vercel.app"
    assert origin in Settings(ALLOWED_ORIGINS=origin).cors_origins


def test_production_without_allowed_origins_is_reported_at_boot():
    warnings = Settings(ENVIRONMENT="production", JWT_SECRET="x" * 48).browser_access_warnings()
    assert len(warnings) == 1
    assert "ALLOWED_ORIGINS" in warnings[0]


def test_production_with_allowed_origins_is_quiet():
    s = Settings(
        ENVIRONMENT="production",
        JWT_SECRET="x" * 48,
        ALLOWED_ORIGINS="https://trip-planner.vercel.app",
    )
    assert s.browser_access_warnings() == []


def test_missing_allowed_origins_never_blocks_startup():
    """An unreachable frontend must not become an unstartable backend."""
    assert Settings(ENVIRONMENT="production", JWT_SECRET="x" * 48).insecure_settings() == []


# ── rate limiter storage ──────────────────────────────────────────────────────
# A REDIS_URL set to a bare password crashed the app on boot: `limits` rejected
# the scheme at import time and took the whole service down with it, quoting the
# credential in the traceback.

def test_bare_password_redis_url_falls_back_instead_of_crashing(monkeypatch, caplog):
    monkeypatch.setattr(rate_limit.settings, "redis_url", "A327dtvb0kkqkmgvkgbaq9dd4xsviryq")
    with caplog.at_level(logging.ERROR, logger="rate_limit"):
        assert rate_limit._resolve_storage_uri() == "memory://"
    assert "REDIS_URL" in caplog.text


def test_storage_failure_never_logs_the_credential(monkeypatch, caplog):
    secret = "A327dtvb0kkqkmgvkgbaq9dd4xsviryq"
    monkeypatch.setattr(rate_limit.settings, "redis_url", secret)
    with caplog.at_level(logging.ERROR, logger="rate_limit"):
        rate_limit._resolve_storage_uri()
    assert secret not in caplog.text


def test_well_formed_redis_url_is_used(monkeypatch):
    monkeypatch.setattr(rate_limit.settings, "redis_url", "redis://:pw@cache:6379/0")
    assert rate_limit._resolve_storage_uri() == "redis://:pw@cache:6379/0"


def test_missing_redis_url_uses_memory(monkeypatch):
    monkeypatch.setattr(rate_limit.settings, "redis_url", "")
    assert rate_limit._resolve_storage_uri() == "memory://"


def test_unreachable_storage_is_detected_at_startup():
    """Otherwise every rate-limited route 500s on the first request."""
    unreachable = rate_limit._build_limiter("redis://localhost:6399/0")
    assert rate_limit._storage_reachable(unreachable) is False
    assert rate_limit._storage_reachable(rate_limit._build_limiter("memory://")) is True


def test_rate_limited_route_works_with_degraded_storage(client):
    assert client.get("/api/share/aaaaaaaaaa").status_code == 404

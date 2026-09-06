"""Performance and observability regressions.

The query-count and latency assertions are deliberately loose. They exist to
catch a reintroduced N+1 or a dropped log field, not to police exact numbers.
"""
from __future__ import annotations

import json
import logging

import main
import pytest
from db import engine
from fastapi.testclient import TestClient
from observability import (
    JsonFormatter,
    Metrics,
    install_record_factory,
    request_id_var,
    user_id_var,
)
from sqlalchemy import event


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    r = client.post("/api/auth/register",
                    json={"email": "perf@example.com", "password": "Str0ng-Passw0rd!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ── N+1 ───────────────────────────────────────────────────────────────────────

def test_listing_plans_does_not_scale_queries_with_plan_count(client, auth):
    """`len(plan.versions)` used to lazy-load snapshots once per plan."""
    for i in range(12):
        r = client.post("/api/plans", json={
            "name": f"p{i}", "payload": {"a": 1}, "result": {"r": 1},
            "total_inr": 100.0, "nights": 2,
        }, headers=auth)
        client.put(f"/api/plans/{r.json()['id']}", json={
            "name": f"p{i}", "payload": {"a": 2}, "result": {"r": 2},
            "total_inr": 101.0, "nights": 2,
        }, headers=auth)

    seen: list[str] = []
    listener = lambda conn, cur, stmt, *a: seen.append(stmt)  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        r = client.get("/api/plans", headers=auth)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert r.status_code == 200
    assert len(r.json()) == 12
    # user lookup + plans + one grouped version count. Not one query per plan.
    assert len(seen) <= 5, f"expected a constant number of queries, issued {len(seen)}"
    assert all(p["version_count"] == 1 for p in r.json())


# ── event loop ────────────────────────────────────────────────────────────────

def test_cpu_bound_endpoints_are_not_coroutines():
    """`async def` handlers run on the event loop and block every other request."""
    import inspect
    for name in ("budget_endpoint", "optimize_route_endpoint",
                 "intelligence_endpoint", "export_ics_endpoint"):
        fn = getattr(main, name)
        assert not inspect.iscoroutinefunction(fn), f"{name} must be `def`, not `async def`"


# ── observability ─────────────────────────────────────────────────────────────

def test_request_id_is_echoed_and_logged(client, caplog):
    with caplog.at_level(logging.INFO, logger="main"):
        r = client.get("/healthz", headers={"X-Request-ID": "trace-abc"})
    assert r.headers["X-Request-ID"] == "trace-abc"
    rec = next(r for r in caplog.records if r.getMessage() == "request")
    assert rec.route == "/healthz"
    assert rec.status == 200
    assert isinstance(rec.duration_ms, float)


def test_request_id_is_generated_when_absent(client):
    assert len(client.get("/healthz").headers["X-Request-ID"]) >= 16


def test_authenticated_request_log_carries_user_id(client, auth, caplog):
    """Regression: BaseHTTPMiddleware runs the endpoint in a separate anyio task,
    so a ContextVar set in `get_current_user` was lost before the middleware
    logged. The middleware is raw ASGI so it stays in the same context."""
    with caplog.at_level(logging.INFO, logger="main"):
        client.get("/api/plans", headers=auth)
    rec = next(r for r in caplog.records
               if r.getMessage() == "request" and r.route == "/api/plans")
    assert rec.status == 200
    assert getattr(rec, "user_id", ""), "request log line lost the authenticated user id"


def test_record_factory_binds_ids_onto_the_record():
    install_record_factory()
    request_id_var.set("rid-1")
    user_id_var.set("42")
    try:
        rec = logging.getLogRecordFactory()(
            "t", logging.INFO, __file__, 1, "hello", None, None)
        rec.route = "/api/plans"
        rec.duration_ms = 12.5
    finally:
        request_id_var.set("")
        user_id_var.set("")
    # Formatted after the vars are cleared: the ids must already be on the record.
    payload = json.loads(JsonFormatter().format(rec))
    assert payload["msg"] == "hello"
    assert payload["request_id"] == "rid-1"
    assert payload["user_id"] == "42"
    assert payload["route"] == "/api/plans"
    assert payload["duration_ms"] == 12.5


def test_no_request_context_outside_a_request():
    rec = logging.getLogRecordFactory()("t", logging.INFO, __file__, 1, "boot", None, None)
    payload = json.loads(JsonFormatter().format(rec))
    assert "request_id" not in payload and "user_id" not in payload


def test_json_formatter_serialises_exceptions():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys
        rec = logging.LogRecord("t", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    payload = json.loads(JsonFormatter().format(rec))
    assert "ValueError: boom" in payload["error"]


def test_route_label_uses_template_not_filled_path(client):
    """Otherwise every share id becomes its own latency series."""
    client.get("/api/share/abcdef0123")
    labels = client.get("/metrics").json()["latency_ms"]
    assert "/api/share/{share_id}" in labels


# ── metrics ───────────────────────────────────────────────────────────────────

def test_metrics_endpoint_reports_the_three_key_signals(client):
    body = client.get("/metrics").json()
    assert body["requests_total"] > 0
    assert 0.0 <= body["error_rate"] <= 1.0
    assert body["latency_ms"]["/healthz"]["count"] > 0


def test_error_rate_counts_only_server_errors():
    m = Metrics()
    for status in (200, 200, 404, 500):
        m.record_request("/x", status, 1.0)
    snap = m.snapshot()
    assert snap["error_rate"] == 0.25          # 500 only
    assert snap["client_error_rate"] == 0.25   # 404 only


def test_latency_percentiles_are_ordered():
    m = Metrics()
    for i in range(100):
        m.record_request("/x", 200, float(i))
    p = m.snapshot()["latency_ms"]["/x"]
    assert p["p50"] <= p["p95"] <= p["p99"]


def test_latency_samples_are_bounded():
    """A long-lived process must not accumulate samples forever."""
    m = Metrics()
    for i in range(5000):
        m.record_request("/x", 200, float(i))
    assert m.snapshot()["latency_ms"]["/x"]["count"] <= Metrics._MAX_SAMPLES


def test_event_counters_track_llm_fallback():
    m = Metrics()
    m.incr("llm.primary_failure")
    m.incr("llm.fallback_used")
    m.incr("llm.fallback_used")
    assert m.snapshot()["events"] == {"llm.primary_failure": 1, "llm.fallback_used": 2}

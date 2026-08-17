"""Saved plans: stored results, version history, restore, and ownership."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fastapi import FastAPI

import plans_routes
from auth_routes import router as auth_router
from db import init_db

app = FastAPI()
app.include_router(auth_router)
app.include_router(plans_routes.router)
init_db()
client = TestClient(app)


def _auth(email: str) -> dict[str, str]:
    res = client.post("/api/auth/register", json={"email": email, "password": "Str0ng-Passw0rd!"})
    assert res.status_code in (200, 201), res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def headers() -> dict[str, str]:
    return _auth("plans-owner@example.com")


def _create(headers, **body):
    payload = {"name": "SEA trip", "payload": {"travelers": 2, "nights": 5}}
    payload.update(body)
    return client.post("/api/plans", json=payload, headers=headers)


# ── stored results ────────────────────────────────────────────────────────────

def test_plan_keeps_its_computed_result_and_total(headers):
    res = _create(headers, result={"grand_total": {"inr": 120_000}}, total_inr=120_000, nights=5)
    assert res.status_code == 201, res.text
    plan = res.json()
    assert plan["total_inr"] == 120_000
    assert plan["nights"] == 5
    assert plan["result"]["grand_total"]["inr"] == 120_000
    assert plan["version_count"] == 0

    listed = client.get("/api/plans", headers=headers).json()
    mine = next(p for p in listed if p["id"] == plan["id"])
    assert mine["total_inr"] == 120_000, "the list must carry totals so it can be ranked"


def test_result_is_optional(headers):
    plan = _create(headers, name="Not calculated yet").json()
    assert plan["result"] is None and plan["total_inr"] is None


# ── history ───────────────────────────────────────────────────────────────────

def test_editing_a_plan_snapshots_the_previous_state(headers):
    plan = _create(headers, payload={"travelers": 2, "hotel": 12_000}, total_inr=100_000).json()
    pid = plan["id"]

    updated = client.put(
        f"/api/plans/{pid}",
        json={"name": "SEA trip", "payload": {"travelers": 2, "hotel": 20_000}, "total_inr": 108_000},
        headers=headers,
    ).json()
    assert updated["total_inr"] == 108_000
    assert updated["version_count"] == 1

    versions = client.get(f"/api/plans/{pid}/versions", headers=headers).json()
    assert len(versions) == 1
    assert versions[0]["payload"]["hotel"] == 12_000, "the snapshot holds the OLD state"
    assert versions[0]["total_inr"] == 100_000
    # Which is what makes "this hotel change added ₹8,000" computable client-side.
    assert updated["total_inr"] - versions[0]["total_inr"] == 8_000


def test_resaving_an_unchanged_plan_does_not_add_history(headers):
    plan = _create(headers, payload={"travelers": 3}).json()
    pid = plan["id"]
    body = {"name": "Renamed only", "payload": {"travelers": 3}}
    assert client.put(f"/api/plans/{pid}", json=body, headers=headers).json()["version_count"] == 0


def test_history_is_capped(headers):
    plan = _create(headers, payload={"n": 0}).json()
    pid = plan["id"]
    for n in range(1, 26):
        client.put(f"/api/plans/{pid}", json={"name": "Churn", "payload": {"n": n}}, headers=headers)
    versions = client.get(f"/api/plans/{pid}/versions", headers=headers).json()
    assert len(versions) == plans_routes._MAX_VERSIONS
    # Newest first, and the oldest snapshots are the ones dropped.
    assert versions[0]["payload"]["n"] == 24
    assert min(v["payload"]["n"] for v in versions) > 0


def test_restore_rolls_back_and_keeps_the_current_state_recoverable(headers):
    plan = _create(headers, payload={"stage": "original"}, total_inr=50_000).json()
    pid = plan["id"]
    client.put(f"/api/plans/{pid}", json={"name": "P", "payload": {"stage": "edited"}, "total_inr": 70_000}, headers=headers)
    versions = client.get(f"/api/plans/{pid}/versions", headers=headers).json()

    restored = client.post(f"/api/plans/{pid}/restore/{versions[0]['id']}", headers=headers).json()
    assert restored["payload"] == {"stage": "original"}
    assert restored["total_inr"] == 50_000
    # The edited state is still in history, so a restore is undoable too.
    payloads = [v["payload"]["stage"] for v in client.get(f"/api/plans/{pid}/versions", headers=headers).json()]
    assert "edited" in payloads


# ── ownership ─────────────────────────────────────────────────────────────────

def test_another_users_plan_is_invisible_not_forbidden(headers):
    mine = _create(headers, name="Private").json()
    other = _auth("plans-stranger@example.com")
    for method, path in [
        ("get", f"/api/plans/{mine['id']}/versions"),
        ("put", f"/api/plans/{mine['id']}"),
        ("delete", f"/api/plans/{mine['id']}"),
    ]:
        res = getattr(client, method)(
            path, headers=other, **({"json": {"name": "x", "payload": {}}} if method == "put" else {})
        )
        assert res.status_code == 404, f"{method} {path} → {res.status_code}"
    assert client.get("/api/plans", headers=other).json() == []


def test_versions_require_authentication(headers):
    mine = _create(headers, name="Auth check").json()
    assert client.get(f"/api/plans/{mine['id']}/versions").status_code == 401


def test_restoring_a_version_from_another_plan_is_rejected(headers):
    a = _create(headers, name="A", payload={"a": 1}).json()
    b = _create(headers, name="B", payload={"b": 1}).json()
    client.put(f"/api/plans/{a['id']}", json={"name": "A", "payload": {"a": 2}}, headers=headers)
    stolen = client.get(f"/api/plans/{a['id']}/versions", headers=headers).json()[0]["id"]
    assert client.post(f"/api/plans/{b['id']}/restore/{stolen}", headers=headers).status_code == 404


def test_deleting_a_plan_takes_its_history(headers):
    plan = _create(headers, payload={"x": 1}).json()
    pid = plan["id"]
    client.put(f"/api/plans/{pid}", json={"name": "P", "payload": {"x": 2}}, headers=headers)
    assert client.delete(f"/api/plans/{pid}", headers=headers).status_code == 204
    assert client.get(f"/api/plans/{pid}/versions", headers=headers).status_code == 404

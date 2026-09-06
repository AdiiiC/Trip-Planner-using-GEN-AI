"""
Smoke + unit tests for the Trip Planner backend.
Run:  pytest -q
LLM-dependent endpoints are covered by pure-function tests to avoid API calls.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.currency import ConvertInput, convert_currency
from agents.export import ExportEvent, ExportInput, build_ics
from agents.geospatial import DistanceMatrixInput, GeoPoint, haversine_km
from agents.route import OptimizeRouteInput, RouteStop, optimize_route
from main import app

client = TestClient(app)


# ── health ────────────────────────────────────────────────────────────────────

def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] in {"ok", "degraded"}


# ── currency conversion ─────────────────────────────────────────────────────────

def test_currency_convert_basic():
    rates = {"USD": 96.0, "MYR": 24.0, "INR": 1.0}
    out = convert_currency(ConvertInput(amount=10, from_currency="USD", to_currency="MYR"), rates)
    assert out["amount_inr"] == 960.0
    assert out["converted"] == 40.0  # 960 / 24


def test_currency_convert_missing_rate():
    with pytest.raises(ValueError):
        convert_currency(ConvertInput(amount=5, from_currency="USD", to_currency="XYZ"), {"USD": 96.0})


# ── route optimiser ─────────────────────────────────────────────────────────────

def test_optimize_route_orders_and_measures():
    stops = [
        RouteStop(city="Delhi", lat=28.61, lng=77.20),
        RouteStop(city="Mumbai", lat=19.07, lng=72.87),
        RouteStop(city="Bengaluru", lat=12.97, lng=77.59),
    ]
    out = optimize_route(OptimizeRouteInput(stops=stops, fixed_start=True))
    assert out["ordered_cities"][0] == "Delhi"       # fixed start preserved
    assert len(out["legs"]) == 2
    assert out["total_distance_km"] > 0


# ── iCalendar export ────────────────────────────────────────────────────────────

def test_build_ics_valid_structure():
    inp = ExportInput(
        title="Bali Trip",
        start_date="2026-08-01",
        events=[ExportEvent(title="Uluwatu Temple", day=1, start_time="16:00", duration_min=90)],
    )
    ics = build_ics(inp)
    assert ics.startswith("BEGIN:VCALENDAR")
    assert "END:VCALENDAR" in ics
    assert "SUMMARY:Uluwatu Temple" in ics
    assert "BEGIN:VEVENT" in ics


# ── budget calculator ───────────────────────────────────────────────────────────

def test_budget_endpoint_smoke():
    payload = {
        "travelers": 2,
        "exchange_rates": [{"currency": "USD", "rate_to_inr": 96.0}],
        "flights": [{"route": "BLR-SGN", "price_inr": 17000, "per_person": True}],
        "accommodations": [{"destination": "Da Nang", "total_cost_inr": 8000, "split_type": "group"}],
        "sightseeing": [], "extras": [],
        "pocket_money_usd": 500, "cash_conversions": [],
    }
    r = client.post("/api/budget", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert "grand_total" in body


# ── validation ──────────────────────────────────────────────────────────────────

def test_currency_convert_validation_error():
    r = client.post("/api/currency-convert", json={"amount": -5, "from_currency": "USD", "to_currency": "INR"})
    assert r.status_code == 422  # pydantic ge=0 violation


def test_optimize_route_requires_two_stops():
    r = client.post("/api/optimize-route", json={"stops": [{"city": "X", "lat": 0, "lng": 0}]})
    assert r.status_code == 422


def test_haversine_distance_is_geographically_sane():
    hotel = GeoPoint(name="Hotel", lat=10.7769, lng=106.7009)
    museum = GeoPoint(name="Museum", lat=10.7792, lng=106.6920)
    assert 0.8 < haversine_km(hotel, museum) < 1.2


def test_distance_matrix_validates_empty_destinations():
    with pytest.raises(ValueError):
        DistanceMatrixInput(
            origin=GeoPoint(name="Hotel", lat=10.77, lng=106.70),
            destinations=[],
        )


def test_cash_predict_requires_destination():
    r = client.post("/api/cash-predict", json={"destinations": [], "duration_days": 5})
    assert r.status_code == 422  # min_length=1 violation


def test_cash_predict_validates_duration():
    r = client.post("/api/cash-predict", json={"destinations": ["Bali"], "duration_days": 0})
    assert r.status_code == 422  # ge=1 violation

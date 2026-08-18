from datetime import date, timedelta

import pytest

from agents.geospatial import DistanceMatrixInput, GeoPoint, haversine_km
from agents.travel_intelligence import (
    BookingAdviceInput,
    BudgetRiskInput,
    DestinationCompareInput,
    FeasibilityInput,
    ReadinessInput,
    ScenarioInput,
    booking_advice,
    budget_risk,
    compare_destinations,
    feasibility,
    readiness,
    scenarios,
)


def test_geospatial_distance_and_validation():
    hotel = GeoPoint(name="Hotel", lat=10.7769, lng=106.7009)
    museum = GeoPoint(name="Museum", lat=10.7792, lng=106.6920)
    assert 0.8 < haversine_km(hotel, museum) < 1.2
    with pytest.raises(ValueError):
        DistanceMatrixInput(origin=hotel, destinations=[])


def test_readiness_prioritizes_missing_critical_items():
    result = readiness(ReadinessInput(
        departure_date=date.today() + timedelta(days=7), flights_booked=False, visa_ready=False
    ))
    assert result["score"] < 60
    assert all(action["urgency"] == "now" for action in result["actions"])


def test_scenarios_are_ordered():
    result = scenarios(ScenarioInput(categories=[{"name": "Flights", "amount": 50000}]))
    totals = [item["expected"] for item in result["scenarios"]]
    assert totals == sorted(totals)


def test_booking_advice_books_a_low_fare():
    result = booking_advice(BookingAdviceInput(items=[{
        "name": "BLR to SGN", "kind": "flight", "current_price": 18000,
        "typical_low": 17000, "typical_high": 30000, "days_until_trip": 90,
    }]))
    assert result["items"][0]["action"] == "book"


def test_destination_comparison_ranks_best_fit():
    payload = {"destinations": [
        {"name": "A", "daily_cost": 100, "weather": 90, "visa_ease": 90, "transit": 90, "interests": 90, "crowd_comfort": 90},
        {"name": "B", "daily_cost": 200, "weather": 50, "visa_ease": 50, "transit": 50, "interests": 50, "crowd_comfort": 50},
    ]}
    assert compare_destinations(DestinationCompareInput(**payload))["recommended"] == "A"


def test_feasibility_flags_overpacked_day():
    result = feasibility(FeasibilityInput(days=[{
        "day": 1, "activities": 8, "activity_hours": 10, "travel_hours": 4, "meal_breaks": 1,
    }]))
    assert result["score"] < 65
    assert result["problem_days"] == [1]


def test_budget_risk_includes_currency_exposure():
    result = budget_risk(BudgetRiskInput(categories=[{
        "name": "Hotels", "amount": 50000, "uncertainty_pct": 10, "exchange_exposed": True,
    }], currency_shock_pct=10))
    assert result["likely_high"] == 60000
    assert result["recommended_buffer"] > 5000
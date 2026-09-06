from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class CostCategory(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    amount: float = Field(..., ge=0, le=100_000_000)
    uncertainty_pct: float = Field(default=10, ge=0, le=100)
    exchange_exposed: bool = False


class ReadinessInput(BaseModel):
    departure_date: date
    budget_ready: bool = False
    flights_booked: bool = False
    hotel_booked: bool = False
    visa_ready: bool = False
    itinerary_ready: bool = False
    insurance_ready: bool = False
    weather_risk: Literal["low", "medium", "high"] = "low"


class ScenarioInput(BaseModel):
    categories: list[CostCategory] = Field(..., min_length=1, max_length=20)


class BookingItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: Literal["flight", "hotel"]
    current_price: float = Field(..., gt=0)
    typical_low: float = Field(..., gt=0)
    typical_high: float = Field(..., gt=0)
    days_until_trip: int = Field(..., ge=0, le=730)


class BookingAdviceInput(BaseModel):
    items: list[BookingItem] = Field(..., min_length=1, max_length=20)


class DestinationMetric(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    daily_cost: float = Field(..., gt=0)
    weather: int = Field(..., ge=0, le=100)
    visa_ease: int = Field(..., ge=0, le=100)
    transit: int = Field(..., ge=0, le=100)
    interests: int = Field(..., ge=0, le=100)
    crowd_comfort: int = Field(..., ge=0, le=100)


class DestinationCompareInput(BaseModel):
    destinations: list[DestinationMetric] = Field(..., min_length=2, max_length=6)


class ItineraryDay(BaseModel):
    day: int = Field(..., ge=1, le=90)
    activities: int = Field(..., ge=0, le=20)
    activity_hours: float = Field(..., ge=0, le=24)
    travel_hours: float = Field(..., ge=0, le=24)
    meal_breaks: int = Field(default=2, ge=0, le=6)


class FeasibilityInput(BaseModel):
    days: list[ItineraryDay] = Field(..., min_length=1, max_length=90)


class BudgetRiskInput(BaseModel):
    categories: list[CostCategory] = Field(..., min_length=1, max_length=20)
    currency_shock_pct: float = Field(default=8, ge=0, le=50)
    contingency_pct: float = Field(default=10, ge=0, le=50)


class IntelligenceRequest(BaseModel):
    kind: Literal["readiness", "scenarios", "booking", "destinations", "feasibility", "risk"]
    payload: dict[str, Any]


def readiness(inp: ReadinessInput) -> dict:
    checks = [
        ("Flights", inp.flights_booked, 20), ("Hotel", inp.hotel_booked, 15),
        ("Visa", inp.visa_ready, 20), ("Budget", inp.budget_ready, 15),
        ("Itinerary", inp.itinerary_ready, 15), ("Insurance", inp.insurance_ready, 10),
    ]
    days_left = (inp.departure_date - date.today()).days
    weather_points = {"low": 5, "medium": 2, "high": 0}[inp.weather_risk]
    score = min(100, sum(weight for _, complete, weight in checks if complete) + weather_points)
    actions = [
        {"label": label, "urgency": "now" if days_left <= 14 or weight >= 20 else "soon"}
        for label, complete, weight in checks if not complete
    ]
    if inp.weather_risk == "high":
        actions.insert(0, {"label": "Review weather backup plans", "urgency": "now"})
    return {
        "score": score,
        "days_left": days_left,
        "status": "ready" if score >= 85 else "nearly-ready" if score >= 60 else "needs-attention",
        "dimensions": [{"label": label, "complete": complete, "weight": weight} for label, complete, weight in checks],
        "actions": actions,
    }


def scenarios(inp: ScenarioInput) -> dict:
    base = sum(category.amount for category in inp.categories)
    profiles = [("Lean", 0.82, "Trade convenience for savings"), ("Balanced", 1.0, "Keep the current plan"), ("Comfortable", 1.28, "Add flexibility and upgrades")]
    return {
        "base_total": round(base),
        "scenarios": [
            {
                "name": name,
                "expected": round(base * multiplier),
                "minimum": round(base * multiplier * 0.92),
                "maximum": round(base * multiplier * 1.12),
                "note": note,
                "categories": [
                    {"name": category.name, "amount": round(category.amount * multiplier)}
                    for category in inp.categories
                ],
            }
            for name, multiplier, note in profiles
        ],
    }


def booking_advice(inp: BookingAdviceInput) -> dict:
    output = []
    for item in inp.items:
        span = max(item.typical_high - item.typical_low, 1)
        position = (item.current_price - item.typical_low) / span
        urgent_window = 35 if item.kind == "flight" else 14
        if position <= 0.35 or item.days_until_trip <= urgent_window:
            action = "book"
        elif position >= 0.85 and item.days_until_trip > urgent_window * 2:
            action = "wait"
        else:
            action = "watch"
        output.append({
            **item.model_dump(),
            "price_position_pct": round(max(0, min(1, position)) * 100),
            "action": action,
            "confidence": 85 if position <= 0.2 or position >= 0.9 else 68,
            "deadline_days": min(item.days_until_trip, urgent_window),
        })
    return {"items": output}


def compare_destinations(inp: DestinationCompareInput) -> dict:
    cheapest = min(item.daily_cost for item in inp.destinations)
    scored = []
    for item in inp.destinations:
        affordability = min(100, round(cheapest / item.daily_cost * 100))
        score = round(
            affordability * 0.25 + item.weather * 0.18 + item.visa_ease * 0.15
            + item.transit * 0.14 + item.interests * 0.2 + item.crowd_comfort * 0.08
        )
        scored.append({**item.model_dump(), "affordability": affordability, "score": score})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return {"destinations": scored, "recommended": scored[0]["name"]}


def feasibility(inp: FeasibilityInput) -> dict:
    results = []
    for day in inp.days:
        score = 100
        issues = []
        if day.activities > 5:
            score -= (day.activities - 5) * 8
            issues.append("Too many separate activities")
        if day.activity_hours + day.travel_hours > 11:
            score -= round((day.activity_hours + day.travel_hours - 11) * 8)
            issues.append("The scheduled day is too long")
        if day.travel_hours > 3:
            score -= round((day.travel_hours - 3) * 10)
            issues.append("Travel consumes too much of the day")
        if day.meal_breaks < 2:
            score -= 12
            issues.append("Add a proper meal break")
        score = max(0, score)
        results.append({
            **day.model_dump(), "score": score, "issues": issues,
            "pace": "relaxed" if score >= 85 else "balanced" if score >= 65 else "intense",
        })
    average = round(sum(day["score"] for day in results) / len(results))
    return {"score": average, "days": results, "problem_days": [day["day"] for day in results if day["score"] < 65]}


def budget_risk(inp: BudgetRiskInput) -> dict:
    base = sum(category.amount for category in inp.categories)
    categories = []
    uncertainty_total = 0.0
    exchange_risk = 0.0
    for category in inp.categories:
        uncertainty = category.amount * category.uncertainty_pct / 100
        exchange = category.amount * inp.currency_shock_pct / 100 if category.exchange_exposed else 0
        uncertainty_total += uncertainty
        exchange_risk += exchange
        categories.append({
            **category.model_dump(),
            "low": round(max(0, category.amount - uncertainty)),
            "high": round(category.amount + uncertainty + exchange),
            "risk_amount": round(uncertainty + exchange),
        })
    contingency = base * inp.contingency_pct / 100
    categories.sort(key=lambda item: item["risk_amount"], reverse=True)
    return {
        "base": round(base),
        "likely_low": round(max(0, base - uncertainty_total * 0.6)),
        "likely_high": round(base + uncertainty_total + exchange_risk),
        "recommended_buffer": round(contingency + exchange_risk * 0.5),
        "categories": categories,
    }


def analyze(request: IntelligenceRequest) -> dict:
    handlers = {
        "readiness": (ReadinessInput, readiness),
        "scenarios": (ScenarioInput, scenarios),
        "booking": (BookingAdviceInput, booking_advice),
        "destinations": (DestinationCompareInput, compare_destinations),
        "feasibility": (FeasibilityInput, feasibility),
        "risk": (BudgetRiskInput, budget_risk),
    }
    model, handler = handlers[request.kind]
    return {"kind": request.kind, "result": handler(model.model_validate(request.payload))}

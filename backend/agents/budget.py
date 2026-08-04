from __future__ import annotations

import math
from pydantic import BaseModel, Field, field_validator
from typing import Literal

_CURRENCY_RE = r"^[A-Za-z]{2,4}$"
_MAX_MONEY   = 1e12   # sanity cap: no single item > 1 trillion INR


# ──────────────────────────────────────────────
# Input models — all monetary fields validated
# ──────────────────────────────────────────────

class ExchangeRate(BaseModel):
    currency:    str   = Field(..., min_length=2, max_length=4, pattern=_CURRENCY_RE)
    rate_to_inr: float = Field(..., gt=0, lt=_MAX_MONEY)   # BUG-001/002: must be positive finite


class FlightCost(BaseModel):
    route:      str   = Field(..., min_length=1, max_length=200)
    price_inr:  float = Field(..., ge=0, lt=_MAX_MONEY)    # BUG-007: no negatives
    per_person: bool  = True
    date:       str   = Field(default="", max_length=32)   # ISO travel date, optional


class AccommodationCost(BaseModel):
    destination:    str   = Field(..., min_length=1, max_length=100)
    total_cost_inr: float = Field(..., ge=0, lt=_MAX_MONEY)
    split_type: Literal["individual", "group"] = "group"


class ItemCost(BaseModel):
    name:        str   = Field(..., min_length=1, max_length=200)
    destination: str   = Field(default="", max_length=100)
    amount:      float = Field(..., ge=0, lt=_MAX_MONEY)
    currency:    str   = Field(default="INR", min_length=2, max_length=4, pattern=_CURRENCY_RE)


class CashConversion(BaseModel):
    currency:   str   = Field(..., min_length=2, max_length=4, pattern=_CURRENCY_RE)
    amount_inr: float = Field(..., ge=0, lt=_MAX_MONEY)


class BudgetInput(BaseModel):
    travelers:      int   = Field(default=1, ge=1, le=50)
    exchange_rates: list[ExchangeRate]    = Field(default=[], max_length=20)   # BUG-004
    flights:        list[FlightCost]      = Field(default=[], max_length=20)
    accommodations: list[AccommodationCost] = Field(default=[], max_length=20)
    sightseeing:    list[ItemCost]        = Field(default=[], max_length=30)
    extras:         list[ItemCost]        = Field(default=[], max_length=20)
    pocket_money_usd: float = Field(default=0.0, ge=0, lt=1_000_000)
    cash_conversions: list[CashConversion] = Field(default=[], max_length=15)


# ──────────────────────────────────────────────
# Calculator
# ──────────────────────────────────────────────

def calculate_budget(inp: BudgetInput) -> dict:
    # Build INR rate lookup  (always include INR = 1)
    rates: dict[str, float] = {r.currency: r.rate_to_inr for r in inp.exchange_rates}
    rates.setdefault("INR", 1.0)
    usd_rate = rates.get("USD", 83.0)

    def to_inr(amount: float, currency: str) -> float:
        rate = rates.get(currency, 1.0)
        if rate <= 0 or not math.isfinite(rate):   # BUG-001: guard zero/inf/nan
            rate = 1.0
        return amount * rate

    # ── 1. Flights ──────────────────────────────
    flight_items, total_flights = [], 0.0
    for f in inp.flights:
        flight_items.append({"route": f.route, "amount_inr": round(f.price_inr, 2), "date": f.date})
        total_flights += f.price_inr

    # ── 2. Accommodation ────────────────────────
    stay_items, total_stays = [], 0.0
    for s in inp.accommodations:
        if s.split_type == "individual":
            per_person = s.total_cost_inr
            label = "Individual"
        else:
            per_person = s.total_cost_inr / max(inp.travelers, 1)  # BUG-001: guard /0
            label = f"÷{inp.travelers}"
        stay_items.append({
            "destination": s.destination,
            "booking_total_inr": round(s.total_cost_inr, 2),
            "per_person_inr": round(per_person, 2),
            "split": label,
        })
        total_stays += per_person

    # ── 3. Sightseeing ──────────────────────────
    sight_items, total_sightseeing = [], 0.0
    for s in inp.sightseeing:
        inr = to_inr(s.amount, s.currency)
        sight_items.append({
            "destination": s.destination,
            "name": s.name,
            "original": f"{s.amount:,.0f} {s.currency}",
            "amount_inr": round(inr, 2),
        })
        total_sightseeing += inr

    # ── 4. Extras ───────────────────────────────
    extra_items, total_extras = [], 0.0
    for e in inp.extras:
        inr = to_inr(e.amount, e.currency)
        extra_items.append({
            "name": e.name,
            "destination": e.destination,
            "original": f"{e.amount:,.0f} {e.currency}",
            "amount_inr": round(inr, 2),
        })
        total_extras += inr

    total_fixed = total_flights + total_stays + total_sightseeing + total_extras

    # ── 5. Cash conversion ──────────────────────
    pocket_money_inr = inp.pocket_money_usd * usd_rate
    cash_items, total_cash_out = [], 0.0
    for c in inp.cash_conversions:
        rate = rates.get(c.currency, 1.0)
        if rate <= 0 or not math.isfinite(rate):   # BUG-001: guard zero rate
            rate = 1.0
        foreign = c.amount_inr / rate
        cash_items.append({
            "currency": c.currency,
            "inr_spent": round(c.amount_inr, 2),
            "foreign_amount": round(foreign, 0),
            "display": f"{foreign:,.0f} {c.currency}",
        })
        total_cash_out += c.amount_inr

    usd_remaining_inr = pocket_money_inr - total_cash_out
    usd_remaining = usd_remaining_inr / usd_rate if usd_rate else 0.0

    # ── 6. Grand total ──────────────────────────
    grand_inr = total_fixed + pocket_money_inr
    grand_usd = grand_inr / usd_rate if usd_rate else 0.0

    return {
        "travelers": inp.travelers,
        "fixed_costs": {
            "flights":     {"items": flight_items,  "total_inr": round(total_flights, 2)},
            "stays":       {"items": stay_items,    "total_inr": round(total_stays, 2)},
            "sightseeing": {"items": sight_items,   "total_inr": round(total_sightseeing, 2)},
            "extras":      {"items": extra_items,   "total_inr": round(total_extras, 2)},
            "total_inr": round(total_fixed, 2),
            "total_usd": round(total_fixed / usd_rate, 2) if usd_rate else 0.0,
        },
        "cash_conversion": {
            "pocket_money_usd":      inp.pocket_money_usd,
            "pocket_money_inr":      round(pocket_money_inr, 2),
            "allocations":           cash_items,
            "total_cash_out_inr":    round(total_cash_out, 2),
            "usd_forex_remaining_inr": round(usd_remaining_inr, 2),
            "usd_forex_remaining_usd": round(usd_remaining, 2),
        },
        "grand_total": {
            "inr": round(grand_inr, 2),
            "usd": round(grand_usd, 2),
        },
        "rates_used": {k: v for k, v in rates.items() if k != "INR"},
    }

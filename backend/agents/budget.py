from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Literal


# ──────────────────────────────────────────────
# Input models
# ──────────────────────────────────────────────

class ExchangeRate(BaseModel):
    currency: str          # "USD", "MYR", "VND", …
    rate_to_inr: float     # 1 <currency> = N INR


class FlightCost(BaseModel):
    route: str             # "BLR → SGN"
    price_inr: float
    per_person: bool = True


class AccommodationCost(BaseModel):
    destination: str
    total_cost_inr: float
    split_type: Literal["individual", "group"] = "group"


class ItemCost(BaseModel):
    name: str
    destination: str = ""
    amount: float
    currency: str = "INR"


class CashConversion(BaseModel):
    currency: str
    amount_inr: float   # INR taken from pocket money to convert


class BudgetInput(BaseModel):
    travelers: int = Field(default=1, ge=1, le=50)
    exchange_rates: list[ExchangeRate] = []
    flights: list[FlightCost] = []
    accommodations: list[AccommodationCost] = []
    sightseeing: list[ItemCost] = []
    extras: list[ItemCost] = []          # SIM, visa, insurance …
    pocket_money_usd: float = 0.0
    cash_conversions: list[CashConversion] = []


# ──────────────────────────────────────────────
# Calculator
# ──────────────────────────────────────────────

def calculate_budget(inp: BudgetInput) -> dict:
    # Build INR rate lookup  (always include INR = 1)
    rates: dict[str, float] = {r.currency: r.rate_to_inr for r in inp.exchange_rates}
    rates.setdefault("INR", 1.0)
    usd_rate = rates.get("USD", 83.0)

    def to_inr(amount: float, currency: str) -> float:
        return amount * rates.get(currency, 1.0)

    # ── 1. Flights ──────────────────────────────
    flight_items, total_flights = [], 0.0
    for f in inp.flights:
        flight_items.append({"route": f.route, "amount_inr": round(f.price_inr, 2)})
        total_flights += f.price_inr

    # ── 2. Accommodation ────────────────────────
    stay_items, total_stays = [], 0.0
    for s in inp.accommodations:
        if s.split_type == "individual":
            per_person = s.total_cost_inr
            label = "Individual"
        else:
            per_person = s.total_cost_inr / inp.travelers
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
            "original": f"{e.amount:,.0f} {e.currency}",
            "amount_inr": round(inr, 2),
        })
        total_extras += inr

    total_fixed = total_flights + total_stays + total_sightseeing + total_extras

    # ── 5. Cash conversion ──────────────────────
    pocket_money_inr = inp.pocket_money_usd * usd_rate
    cash_items, total_cash_out = [], 0.0
    for c in inp.cash_conversions:
        foreign = c.amount_inr / rates.get(c.currency, 1.0)
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

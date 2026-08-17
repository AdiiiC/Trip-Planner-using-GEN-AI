from __future__ import annotations

import math
import re
from datetime import date
from pydantic import BaseModel, Field, field_validator
from typing import Literal

_CURRENCY_RE = r"^[A-Za-z]{2,4}$"
_MAX_MONEY   = 1e12   # sanity cap: no single item > 1 trillion INR
_MAX_NIGHTS  = 365    # a "trip" longer than a year is a move, not a holiday

# Extras whose name implies you pay for them at home before flying — everything
# else is assumed paid on arrival out of pocket money. "card" is intentionally
# excluded so "SIM Card" isn't mistaken for a prepaid forex card.
_PREPAID_HINT = re.compile(r"visa|insurance|forex|booking|deposit|ticket", re.IGNORECASE)


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
    paid_by:    str   = Field(default="", max_length=40)   # group mode: who fronted it


class AccommodationCost(BaseModel):
    destination:    str   = Field(..., min_length=1, max_length=100)
    total_cost_inr: float = Field(..., ge=0, lt=_MAX_MONEY)
    split_type: Literal["individual", "group"] = "group"
    paid_by:        str   = Field(default="", max_length=40)


class ItemCost(BaseModel):
    name:        str   = Field(..., min_length=1, max_length=200)
    destination: str   = Field(default="", max_length=100)
    amount:      float = Field(..., ge=0, lt=_MAX_MONEY)
    currency:    str   = Field(default="INR", min_length=2, max_length=4, pattern=_CURRENCY_RE)
    prepaid:     bool | None = None   # None → infer from name; True/False overrides
    paid_by:     str   = Field(default="", max_length=40)


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

    # Trip length. Dates win when both are present and sane; `nights` is the
    # manual fallback. 0 nights means "not told" — per-day figures are then omitted
    # rather than guessed.
    start_date: str = Field(default="", max_length=32)
    end_date:   str = Field(default="", max_length=32)
    nights:     int = Field(default=0, ge=0, le=_MAX_NIGHTS)

    # Optional ceiling to measure the plan against.
    budget_target_inr: float = Field(default=0.0, ge=0, lt=_MAX_MONEY)

    # Group mode: who is on the trip. Below two members there is nothing to settle.
    party: list[str] = Field(default=[], max_length=20)

    @field_validator("party")
    @classmethod
    def _clean_party(cls, names: list[str]) -> list[str]:
        """Trim, cap length, drop blanks and case-insensitive duplicates."""
        seen: set[str] = set()
        out: list[str] = []
        for raw in names:
            name = (raw or "").strip()[:40]
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append(name)
        return out


# ──────────────────────────────────────────────
# Trip length, pacing, and the group ledger
# ──────────────────────────────────────────────

def _parse_date(raw: str) -> date | None:
    try:
        return date.fromisoformat((raw or "").strip()[:10])
    except ValueError:
        return None


def _resolve_nights(inp: BudgetInput) -> tuple[int, str, str]:
    """Nights from the date range when it makes sense, else the manual count."""
    start, end = _parse_date(inp.start_date), _parse_date(inp.end_date)
    if start and end and end > start:
        return min((end - start).days, _MAX_NIGHTS), start.isoformat(), end.isoformat()
    return inp.nights, start.isoformat() if start else "", end.isoformat() if end else ""


def _burn_down(days: int, prepaid: float, pocket: float, target: float) -> list[dict]:
    """Planned spend day by day.

    Day 0 is departure: the prepaid money is already gone before anyone lands.
    After that the pocket money drains at an even pace, which is the only honest
    curve when line items don't carry dates.
    """
    per_day = pocket / days if days else 0.0
    series = []
    for day in range(days + 1):
        spent_on_ground = per_day * day
        row = {
            "day": day,
            "label": "Departure" if day == 0 else f"Day {day}",
            "cumulative_inr": round(prepaid + spent_on_ground, 2),
            "cash_left_inr": round(pocket - spent_on_ground, 2),
        }
        if target > 0:
            row["target_left_inr"] = round(target - (prepaid + spent_on_ground), 2)
        series.append(row)
    return series


def _settle(members: list[str], charges: list[tuple[str, float, float]]) -> dict:
    """Turn "who fronted what" into the shortest list of who pays whom.

    `charges` is (payer, cost to the whole party, cost per member). A charge with
    no recognised payer means everyone paid their own way, so it creates no debt —
    it is only reported as the unattributed total.
    """
    lookup = {m.lower(): m for m in members}
    paid = {m: 0.0 for m in members}
    owed = {m: 0.0 for m in members}
    group_total = unattributed = 0.0

    for payer, group_cost, share in charges:
        name = lookup.get((payer or "").strip().lower())
        if name is None:
            unattributed += group_cost
            continue
        group_total += group_cost
        paid[name] += group_cost
        for m in members:
            owed[m] += share

    # Greedy largest-debtor-to-largest-creditor keeps the transfer count minimal
    # for the shapes real trips produce.
    creditors = sorted(((m, paid[m] - owed[m]) for m in members if paid[m] - owed[m] > 1), key=lambda x: -x[1])
    debtors = sorted(((m, owed[m] - paid[m]) for m in members if owed[m] - paid[m] > 1), key=lambda x: -x[1])
    transfers = []
    ci = di = 0
    credits = [[m, amt] for m, amt in creditors]
    debts = [[m, amt] for m, amt in debtors]
    while ci < len(credits) and di < len(debts):
        amount = min(credits[ci][1], debts[di][1])
        transfers.append({"from": debts[di][0], "to": credits[ci][0], "amount_inr": round(amount, 2)})
        credits[ci][1] -= amount
        debts[di][1] -= amount
        if credits[ci][1] <= 1:
            ci += 1
        if debts[di][1] <= 1:
            di += 1

    return {
        "party_size": len(members),
        "members": [
            {
                "name": m,
                "paid_inr": round(paid[m], 2),
                "share_inr": round(owed[m], 2),
                "net_inr": round(paid[m] - owed[m], 2),
            }
            for m in members
        ],
        "transfers": transfers,
        "group_total_inr": round(group_total, 2),
        "unattributed_inr": round(unattributed, 2),
    }


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

    # Group ledger: only worth tracking with a party of two or more. Each charge
    # records what the whole party owes and what one member's slice of it is.
    party = inp.party
    group_mode = len(party) >= 2
    charges: list[tuple[str, float, float]] = []

    def charge_each(payer: str, per_person: float) -> None:
        """A cost every traveller carries (tickets, entry fees)."""
        if group_mode:
            charges.append((payer, per_person * len(party), per_person))

    def charge_shared(payer: str, total: float) -> None:
        """One bill for the whole party (a room, a taxi)."""
        if group_mode:
            charges.append((payer, total, total / len(party)))

    # ── 1. Flights ──────────────────────────────
    flight_items, total_flights = [], 0.0
    for f in inp.flights:
        flight_items.append({"route": f.route, "amount_inr": round(f.price_inr, 2), "date": f.date})
        total_flights += f.price_inr
        (charge_each if f.per_person else charge_shared)(f.paid_by, f.price_inr)

    # ── 2. Accommodation ────────────────────────
    stay_items, total_stays = [], 0.0
    for s in inp.accommodations:
        if s.split_type == "individual":
            per_person = s.total_cost_inr
            label = "Individual"
            charge_each(s.paid_by, s.total_cost_inr)
        else:
            per_person = s.total_cost_inr / max(inp.travelers, 1)  # BUG-001: guard /0
            label = f"÷{inp.travelers}"
            charge_shared(s.paid_by, s.total_cost_inr)
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
        charge_each(s.paid_by, inr)

    # ── 4. Extras (prepaid at home vs paid on arrival) ─────────
    extra_items, total_extras = [], 0.0
    prepaid_extras, onground_extras = 0.0, 0.0
    for e in inp.extras:
        inr = to_inr(e.amount, e.currency)
        is_prepaid = e.prepaid if e.prepaid is not None else bool(_PREPAID_HINT.search(e.name))
        extra_items.append({
            "name": e.name,
            "destination": e.destination,
            "original": f"{e.amount:,.0f} {e.currency}",
            "amount_inr": round(inr, 2),
            "prepaid": is_prepaid,
        })
        total_extras += inr
        charge_each(e.paid_by, inr)
        if is_prepaid:
            prepaid_extras += inr
        else:
            onground_extras += inr

    total_fixed = total_flights + total_stays + total_sightseeing + total_extras

    # Prepaid = money that leaves before departure; sightseeing and on-arrival
    # extras are paid on the ground out of pocket money, so they must NOT be
    # added on top of it (that was the old double-count).
    prepaid_total = total_flights + total_stays + prepaid_extras
    committed_inr = total_sightseeing + onground_extras

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

    free_spend_inr = pocket_money_inr - committed_inr   # genuinely left after committed cash

    # ── 6. Grand total (true money to mobilize) ─
    # prepaid (flights + stays + prepaid extras) + cash carried, with no item
    # counted twice.
    grand_inr = prepaid_total + pocket_money_inr
    grand_usd = grand_inr / usd_rate if usd_rate else 0.0

    # ── 7. Trip length → pacing ─────────────────
    nights, start_iso, end_iso = _resolve_nights(inp)
    days = nights + 1 if nights else 0   # a 5-night trip spends money on 6 days
    trip = {
        "nights": nights,
        "days": days,
        "start_date": start_iso,
        "end_date": end_iso,
        "per_day_all_in_inr":   round(grand_inr / days, 2) if days else 0.0,
        "per_day_on_ground_inr": round(pocket_money_inr / days, 2) if days else 0.0,
        "per_day_free_inr":     round(free_spend_inr / days, 2) if days else 0.0,
        "per_night_stay_inr":   round(total_stays / nights, 2) if nights else 0.0,
        "burn_down":            _burn_down(days, prepaid_total, pocket_money_inr, inp.budget_target_inr),
    }

    # ── 8. Target ───────────────────────────────
    target_amount = inp.budget_target_inr
    if target_amount > 0:
        per_day_target = target_amount / days if days else 0.0
        over_by = grand_inr - target_amount
        # Which day the running total crosses the target (None if it never does).
        crossover = next(
            (row["day"] for row in trip["burn_down"] if row["cumulative_inr"] > target_amount), None
        )
        target = {
            "amount_inr":     round(target_amount, 2),
            "delta_inr":      round(over_by, 2),
            "pct_used":       round(grand_inr / target_amount * 100, 1),
            "status":         "over" if over_by > 0 else "under",
            "per_day_inr":    round(per_day_target, 2),
            "daily_delta_pct": (
                round((trip["per_day_all_in_inr"] / per_day_target - 1) * 100, 1) if per_day_target else 0.0
            ),
            "crossover_day":  crossover,
        }
    else:
        target = None

    return {
        "travelers": inp.travelers,
        "fixed_costs": {
            "flights":     {"items": flight_items,  "total_inr": round(total_flights, 2)},
            "stays":       {"items": stay_items,    "total_inr": round(total_stays, 2)},
            "sightseeing": {"items": sight_items,   "total_inr": round(total_sightseeing, 2)},
            "extras":      {"items": extra_items,   "total_inr": round(total_extras, 2)},
            "total_inr": round(total_fixed, 2),
            "total_usd": round(total_fixed / usd_rate, 2) if usd_rate else 0.0,
            "prepaid_total_inr":   round(prepaid_total, 2),
            "on_ground_total_inr": round(committed_inr, 2),
        },
        "cash_conversion": {
            "pocket_money_usd":      inp.pocket_money_usd,
            "pocket_money_inr":      round(pocket_money_inr, 2),
            "allocations":           cash_items,
            "total_cash_out_inr":    round(total_cash_out, 2),
            "usd_forex_remaining_inr": round(usd_remaining_inr, 2),
            "usd_forex_remaining_usd": round(usd_remaining, 2),
            "committed_inr":         round(committed_inr, 2),
            "free_spend_inr":        round(free_spend_inr, 2),
        },
        "grand_total": {
            "inr": round(grand_inr, 2),
            "usd": round(grand_usd, 2),
            "prepaid_inr":      round(prepaid_total, 2),
            "pocket_money_inr": round(pocket_money_inr, 2),
        },
        "trip": trip,
        "target": target,
        "settlement": _settle(party, charges) if group_mode else None,
        "rates_used": {k: v for k, v in rates.items() if k != "INR"},
    }

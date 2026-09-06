from __future__ import annotations

import math
import re
from datetime import date
from typing import Literal, NamedTuple

from pydantic import BaseModel, Field, field_validator

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
    paid = dict.fromkeys(members, 0.0)
    owed = dict.fromkeys(members, 0.0)
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

# ──────────────────────────────────────────────
# Currency
# ──────────────────────────────────────────────

class RateTable:
    """INR conversion rates, hardened against the values a form can actually send.

    A zero, negative, or non-finite rate is treated as 1.0 rather than allowed to
    poison every downstream total with an inf/nan.
    """

    _DEFAULT_USD_TO_INR = 83.0

    def __init__(self, rates: list[ExchangeRate]) -> None:
        self._rates = {r.currency: r.rate_to_inr for r in rates}
        self._rates.setdefault("INR", 1.0)

    def rate_for(self, currency: str) -> float:
        rate = self._rates.get(currency, 1.0)
        return rate if rate > 0 and math.isfinite(rate) else 1.0

    def to_inr(self, amount: float, currency: str) -> float:
        return amount * self.rate_for(currency)

    @property
    def usd_to_inr(self) -> float:
        return self._rates.get("USD", self._DEFAULT_USD_TO_INR)

    def to_usd(self, amount_inr: float) -> float:
        return amount_inr / self.usd_to_inr if self.usd_to_inr else 0.0

    def as_dict(self) -> dict[str, float]:
        """Rates actually applied, excluding the trivial INR→INR identity."""
        return {k: v for k, v in self._rates.items() if k != "INR"}


# ──────────────────────────────────────────────
# Group ledger
# ──────────────────────────────────────────────

class GroupLedger:
    """Records who fronted which bill while the costs are being totalled.

    Below two members there is nothing to settle, so the ledger quietly accepts
    every charge and reports itself as inactive. That lets the calculator record
    charges unconditionally instead of guarding each call site.
    """

    def __init__(self, party: list[str]) -> None:
        self._party = party
        self._charges: list[tuple[str, float, float]] = []

    @property
    def is_active(self) -> bool:
        return len(self._party) >= 2

    def add_per_person_charge(self, payer: str, per_person_inr: float) -> None:
        """A cost every traveller carries — tickets, entry fees."""
        if self.is_active:
            self._charges.append((payer, per_person_inr * len(self._party), per_person_inr))

    def add_shared_charge(self, payer: str, total_inr: float) -> None:
        """One bill for the whole party — a room, a taxi."""
        if self.is_active:
            self._charges.append((payer, total_inr, total_inr / len(self._party)))

    def settle(self) -> dict | None:
        return _settle(self._party, self._charges) if self.is_active else None


# ──────────────────────────────────────────────
# Cost categories — each returns (line items, total INR)
# ──────────────────────────────────────────────

def _total_flights(flights: list[FlightCost], ledger: GroupLedger) -> tuple[list[dict], float]:
    items, total = [], 0.0
    for f in flights:
        items.append({"route": f.route, "amount_inr": round(f.price_inr, 2), "date": f.date})
        total += f.price_inr
        record = ledger.add_per_person_charge if f.per_person else ledger.add_shared_charge
        record(f.paid_by, f.price_inr)
    return items, total


def _total_stays(
    stays: list[AccommodationCost], travelers: int, ledger: GroupLedger
) -> tuple[list[dict], float]:
    """Totals are per person: a group booking is divided by the head count."""
    items, total = [], 0.0
    for s in stays:
        if s.split_type == "individual":
            per_person, label = s.total_cost_inr, "Individual"
            ledger.add_per_person_charge(s.paid_by, s.total_cost_inr)
        else:
            per_person = s.total_cost_inr / max(travelers, 1)
            label = f"÷{travelers}"
            ledger.add_shared_charge(s.paid_by, s.total_cost_inr)
        items.append({
            "destination": s.destination,
            "booking_total_inr": round(s.total_cost_inr, 2),
            "per_person_inr": round(per_person, 2),
            "split": label,
        })
        total += per_person
    return items, total


def _total_sightseeing(
    sightseeing: list[ItemCost], rates: RateTable, ledger: GroupLedger
) -> tuple[list[dict], float]:
    items, total = [], 0.0
    for s in sightseeing:
        inr = rates.to_inr(s.amount, s.currency)
        items.append({
            "destination": s.destination,
            "name": s.name,
            "original": f"{s.amount:,.0f} {s.currency}",
            "amount_inr": round(inr, 2),
        })
        total += inr
        ledger.add_per_person_charge(s.paid_by, inr)
    return items, total


def _is_prepaid(extra: ItemCost) -> bool:
    """An explicit flag always wins; otherwise the name is the only signal we have."""
    if extra.prepaid is not None:
        return extra.prepaid
    return bool(_PREPAID_HINT.search(extra.name))


class ExtrasTotals(NamedTuple):
    items: list[dict]
    total_inr: float
    prepaid_inr: float
    on_ground_inr: float


def _total_extras(extras: list[ItemCost], rates: RateTable, ledger: GroupLedger) -> ExtrasTotals:
    """Extras split by *when* they are paid, which decides what pocket money must cover."""
    items: list[dict] = []
    total = prepaid = on_ground = 0.0
    for e in extras:
        inr = rates.to_inr(e.amount, e.currency)
        prepaid_here = _is_prepaid(e)
        items.append({
            "name": e.name,
            "destination": e.destination,
            "original": f"{e.amount:,.0f} {e.currency}",
            "amount_inr": round(inr, 2),
            "prepaid": prepaid_here,
        })
        total += inr
        ledger.add_per_person_charge(e.paid_by, inr)
        if prepaid_here:
            prepaid += inr
        else:
            on_ground += inr
    return ExtrasTotals(items, total, prepaid, on_ground)


def _allocate_cash(
    conversions: list[CashConversion], rates: RateTable
) -> tuple[list[dict], float]:
    items, total_inr = [], 0.0
    for c in conversions:
        foreign = c.amount_inr / rates.rate_for(c.currency)
        items.append({
            "currency": c.currency,
            "inr_spent": round(c.amount_inr, 2),
            "foreign_amount": round(foreign, 0),
            "display": f"{foreign:,.0f} {c.currency}",
        })
        total_inr += c.amount_inr
    return items, total_inr


# ──────────────────────────────────────────────
# Pacing and target
# ──────────────────────────────────────────────

def _build_pacing(
    inp: BudgetInput,
    *,
    grand_inr: float,
    prepaid_total: float,
    pocket_money_inr: float,
    free_spend_inr: float,
    total_stays: float,
) -> dict:
    nights, start_iso, end_iso = _resolve_nights(inp)
    days = nights + 1 if nights else 0   # a 5-night trip spends money on 6 days

    def per_day(amount: float) -> float:
        return round(amount / days, 2) if days else 0.0

    return {
        "nights": nights,
        "days": days,
        "start_date": start_iso,
        "end_date": end_iso,
        "per_day_all_in_inr": per_day(grand_inr),
        "per_day_on_ground_inr": per_day(pocket_money_inr),
        "per_day_free_inr": per_day(free_spend_inr),
        "per_night_stay_inr": round(total_stays / nights, 2) if nights else 0.0,
        "burn_down": _burn_down(days, prepaid_total, pocket_money_inr, inp.budget_target_inr),
    }


def _compare_to_target(target_inr: float, grand_inr: float, trip: dict) -> dict | None:
    """How the plan measures against a ceiling, or None when no ceiling was set."""
    if target_inr <= 0:
        return None

    days = trip["days"]
    per_day_target = target_inr / days if days else 0.0
    over_by = grand_inr - target_inr
    crossover = next(
        (row["day"] for row in trip["burn_down"] if row["cumulative_inr"] > target_inr), None
    )
    return {
        "amount_inr": round(target_inr, 2),
        "delta_inr": round(over_by, 2),
        "pct_used": round(grand_inr / target_inr * 100, 1),
        "status": "over" if over_by > 0 else "under",
        "per_day_inr": round(per_day_target, 2),
        "daily_delta_pct": (
            round((trip["per_day_all_in_inr"] / per_day_target - 1) * 100, 1)
            if per_day_target else 0.0
        ),
        "crossover_day": crossover,
    }


# ──────────────────────────────────────────────
# Calculator
# ──────────────────────────────────────────────

def calculate_budget(inp: BudgetInput) -> dict:
    """Total a trip, pace it across the days, and settle the group ledger.

    Reads as the arithmetic it is: total each category, work out what is spent
    before departure versus on the ground, then derive pacing and the target
    comparison from those two numbers.
    """
    rates = RateTable(inp.exchange_rates)
    ledger = GroupLedger(inp.party)

    flight_items, total_flights = _total_flights(inp.flights, ledger)
    stay_items, total_stays = _total_stays(inp.accommodations, inp.travelers, ledger)
    sight_items, total_sightseeing = _total_sightseeing(inp.sightseeing, rates, ledger)
    extras = _total_extras(inp.extras, rates, ledger)

    total_fixed = total_flights + total_stays + total_sightseeing + extras.total_inr

    # Prepaid = money that leaves before departure; sightseeing and on-arrival
    # extras are paid on the ground out of pocket money, so they must NOT be
    # added on top of it (that was the old double-count).
    prepaid_total = total_flights + total_stays + extras.prepaid_inr
    committed_inr = total_sightseeing + extras.on_ground_inr

    pocket_money_inr = inp.pocket_money_usd * rates.usd_to_inr
    cash_items, total_cash_out = _allocate_cash(inp.cash_conversions, rates)
    usd_remaining_inr = pocket_money_inr - total_cash_out
    free_spend_inr = pocket_money_inr - committed_inr   # genuinely left after committed cash

    # True money to mobilize: prepaid + cash carried, with no item counted twice.
    grand_inr = prepaid_total + pocket_money_inr

    trip = _build_pacing(
        inp,
        grand_inr=grand_inr,
        prepaid_total=prepaid_total,
        pocket_money_inr=pocket_money_inr,
        free_spend_inr=free_spend_inr,
        total_stays=total_stays,
    )

    return {
        "travelers": inp.travelers,
        "fixed_costs": {
            "flights":     {"items": flight_items,  "total_inr": round(total_flights, 2)},
            "stays":       {"items": stay_items,    "total_inr": round(total_stays, 2)},
            "sightseeing": {"items": sight_items,   "total_inr": round(total_sightseeing, 2)},
            "extras":      {"items": extras.items,  "total_inr": round(extras.total_inr, 2)},
            "total_inr": round(total_fixed, 2),
            "total_usd": round(rates.to_usd(total_fixed), 2),
            "prepaid_total_inr":   round(prepaid_total, 2),
            "on_ground_total_inr": round(committed_inr, 2),
        },
        "cash_conversion": {
            "pocket_money_usd":      inp.pocket_money_usd,
            "pocket_money_inr":      round(pocket_money_inr, 2),
            "allocations":           cash_items,
            "total_cash_out_inr":    round(total_cash_out, 2),
            "usd_forex_remaining_inr": round(usd_remaining_inr, 2),
            "usd_forex_remaining_usd": round(rates.to_usd(usd_remaining_inr), 2),
            "committed_inr":         round(committed_inr, 2),
            "free_spend_inr":        round(free_spend_inr, 2),
        },
        "grand_total": {
            "inr": round(grand_inr, 2),
            "usd": round(rates.to_usd(grand_inr), 2),
            "prepaid_inr":      round(prepaid_total, 2),
            "pocket_money_inr": round(pocket_money_inr, 2),
        },
        "trip": trip,
        "target": _compare_to_target(inp.budget_target_inr, grand_inr, trip),
        "settlement": ledger.settle(),
        "rates_used": rates.as_dict(),
    }

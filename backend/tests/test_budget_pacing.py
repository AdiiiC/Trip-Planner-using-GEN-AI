"""Trip pacing, budget target and the group settle-up ledger."""
from __future__ import annotations

import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from agents.budget import BudgetInput, calculate_budget  # noqa: E402


def _base(**overrides) -> BudgetInput:
    data = {
        "travelers": 2,
        "exchange_rates": [{"currency": "USD", "rate_to_inr": 100.0}],
        "flights": [{"route": "BLR → SGN", "price_inr": 10_000, "per_person": True}],
        "accommodations": [{"destination": "Hanoi", "total_cost_inr": 8_000, "split_type": "group"}],
        "sightseeing": [{"name": "Museum", "amount": 1_000, "currency": "INR"}],
        "extras": [{"name": "SIM Card", "amount": 500, "currency": "INR"}],
        "pocket_money_usd": 300,  # ₹30,000
    }
    data.update(overrides)
    return BudgetInput(**data)


# ── trip length ───────────────────────────────────────────────────────────────

def test_nights_come_from_dates_when_present():
    res = calculate_budget(_base(start_date="2026-11-01", end_date="2026-11-08", nights=3))
    assert res["trip"]["nights"] == 7        # dates win over the manual count
    assert res["trip"]["days"] == 8


def test_nights_fall_back_to_manual_count_when_dates_are_unusable():
    res = calculate_budget(_base(start_date="2026-11-08", end_date="2026-11-01", nights=5))
    assert res["trip"]["nights"] == 5
    res = calculate_budget(_base(start_date="not-a-date", nights=4))
    assert res["trip"]["nights"] == 4


def test_no_trip_length_means_no_per_day_guesses():
    trip = calculate_budget(_base())["trip"]
    assert trip["nights"] == 0 and trip["days"] == 0
    assert trip["per_day_all_in_inr"] == 0.0
    assert trip["burn_down"] == [
        {"day": 0, "label": "Departure", "cumulative_inr": trip["burn_down"][0]["cumulative_inr"],
         "cash_left_inr": trip["burn_down"][0]["cash_left_inr"]}
    ]


def test_per_day_figures_divide_the_right_totals():
    res = calculate_budget(_base(nights=4))          # 4 nights → 5 spending days
    trip, grand = res["trip"], res["grand_total"]
    assert trip["days"] == 5
    assert trip["per_day_all_in_inr"] == round(grand["inr"] / 5, 2)
    assert trip["per_day_on_ground_inr"] == round(30_000 / 5, 2)
    assert trip["per_night_stay_inr"] == round(res["fixed_costs"]["stays"]["total_inr"] / 4, 2)


def test_burn_down_starts_at_prepaid_and_ends_empty():
    res = calculate_budget(_base(nights=4))
    series = res["trip"]["burn_down"]
    assert len(series) == 6                                   # departure + 5 days
    assert series[0]["cumulative_inr"] == res["grand_total"]["prepaid_inr"]
    assert series[0]["cash_left_inr"] == 30_000
    assert series[-1]["cash_left_inr"] == 0
    assert series[-1]["cumulative_inr"] == res["grand_total"]["inr"]
    # Spend only ever accumulates and cash only ever drains.
    assert all(b["cumulative_inr"] >= a["cumulative_inr"] for a, b in zip(series, series[1:]))
    assert all(b["cash_left_inr"] <= a["cash_left_inr"] for a, b in zip(series, series[1:]))


# ── target ────────────────────────────────────────────────────────────────────

def test_target_is_absent_unless_asked_for():
    assert calculate_budget(_base(nights=4))["target"] is None


def test_target_reports_overspend_and_the_day_it_happens():
    res = calculate_budget(_base(nights=4, budget_target_inr=40_000))
    grand = res["grand_total"]["inr"]
    t = res["target"]
    assert t["status"] == "over"
    assert t["delta_inr"] == round(grand - 40_000, 2)
    assert t["pct_used"] == round(grand / 40_000 * 100, 1)
    assert t["crossover_day"] is not None
    # Prepaid alone is under target here, so the crossover is mid-trip.
    assert 0 < t["crossover_day"] <= res["trip"]["days"]


def test_target_with_room_to_spare_reads_under():
    res = calculate_budget(_base(nights=4, budget_target_inr=500_000))
    t = res["target"]
    assert t["status"] == "under" and t["delta_inr"] < 0
    assert t["crossover_day"] is None
    assert t["daily_delta_pct"] < 0        # pacing below the daily allowance


# ── group settle-up ───────────────────────────────────────────────────────────

def test_solo_trips_have_no_ledger():
    assert calculate_budget(_base(party=["Aadhi_123"]))["settlement"] is None
    assert calculate_budget(_base())["settlement"] is None


def test_one_payer_is_owed_by_everyone_else():
    res = calculate_budget(_base(
        travelers=2,
        party=["Aadhi_123", "Rahul"],
        flights=[{"route": "BLR → SGN", "price_inr": 10_000, "per_person": True, "paid_by": "Aadhi_123"}],
        accommodations=[],
        sightseeing=[],
        extras=[],
    ))
    s = res["settlement"]
    assert s["party_size"] == 2
    assert s["group_total_inr"] == 20_000            # two tickets fronted by one person
    by_name = {m["name"]: m for m in s["members"]}
    assert by_name["Aadhi_123"]["paid_inr"] == 20_000
    assert by_name["Aadhi_123"]["net_inr"] == 10_000
    assert by_name["Rahul"]["net_inr"] == -10_000
    assert s["transfers"] == [{"from": "Rahul", "to": "Aadhi_123", "amount_inr": 10_000.0}]


def test_shared_bill_splits_across_the_party_and_nets_off():
    res = calculate_budget(_base(
        travelers=3,
        party=["A", "B", "C"],
        flights=[],
        accommodations=[{"destination": "Hanoi", "total_cost_inr": 9_000, "split_type": "group", "paid_by": "A"}],
        sightseeing=[{"name": "Museum", "amount": 1_000, "currency": "INR", "paid_by": "B"}],
        extras=[],
    ))
    s = res["settlement"]
    by_name = {m["name"]: m for m in s["members"]}
    # A fronted the ₹9,000 room (₹3,000 a head); B fronted ₹1,000 of tickets each
    # (₹3,000). So everyone's share is ₹4,000 against ₹12,000 of group spend.
    assert s["group_total_inr"] == 12_000
    assert by_name["A"]["net_inr"] == 9_000 - 4_000
    assert by_name["B"]["net_inr"] == 3_000 - 4_000
    assert by_name["C"]["net_inr"] == -4_000
    assert sum(m["net_inr"] for m in s["members"]) == 0
    # Nobody sends money twice when one transfer clears the balance.
    assert len(s["transfers"]) <= len(s["members"]) - 1


def test_unnamed_and_unknown_payers_create_no_debt():
    res = calculate_budget(_base(
        party=["A", "B"],
        flights=[
            {"route": "BLR → SGN", "price_inr": 10_000, "per_person": True},                    # each their own
            {"route": "SGN → KUL", "price_inr": 4_000, "per_person": True, "paid_by": "Ghost"},  # not in the party
        ],
        accommodations=[], sightseeing=[], extras=[],
    ))
    s = res["settlement"]
    assert s["transfers"] == []
    assert s["group_total_inr"] == 0
    assert s["unattributed_inr"] == 28_000
    assert all(m["net_inr"] == 0 for m in s["members"])


def test_party_names_are_trimmed_and_deduplicated():
    res = calculate_budget(_base(party=["  Aadhi_123 ", "aadhi_123", "", "Rahul"]))
    assert [m["name"] for m in res["settlement"]["members"]] == ["Aadhi_123", "Rahul"]

"""
Regression tests for QA bugs fixed in the adversarial audit.
Run: cd backend && pytest tests/test_qa_regressions.py -v
"""
import math
import pytest
from pydantic import ValidationError

from agents.budget import (
    BudgetInput, ExchangeRate, FlightCost, CashConversion, calculate_budget,
)
from agents.planner import PlanInput, PackingInput, MultiCityInput, CityStop


class TestBUG001_ZeroDivisionError:
    """rate_to_inr=0 must be rejected."""

    def test_zero_rate_rejected(self):
        with pytest.raises(ValidationError):
            ExchangeRate(currency="VND", rate_to_inr=0.0)

    def test_negative_rate_rejected(self):
        with pytest.raises(ValidationError):
            ExchangeRate(currency="USD", rate_to_inr=-1.0)


class TestBUG002_InfinityNaN:
    """Inf and NaN must be rejected on monetary fields."""

    def test_inf_rate_rejected(self):
        with pytest.raises(ValidationError):
            ExchangeRate(currency="USD", rate_to_inr=float("inf"))

    def test_nan_rate_rejected(self):
        with pytest.raises(ValidationError):
            ExchangeRate(currency="USD", rate_to_inr=float("nan"))

    def test_inf_price_rejected(self):
        with pytest.raises(ValidationError):
            FlightCost(route="A→B", price_inr=float("inf"))


class TestBUG004_UnboundedLists:
    """Lists must have max_length constraints."""

    def test_too_many_exchange_rates(self):
        rates = [ExchangeRate(currency="USD", rate_to_inr=83.0)] * 21
        with pytest.raises(ValidationError):
            BudgetInput(exchange_rates=rates)

    def test_too_many_flights(self):
        flights = [FlightCost(route="X", price_inr=100)] * 21
        with pytest.raises(ValidationError):
            BudgetInput(flights=flights)


class TestBUG005_InterestItemLength:
    """Individual interest strings must be <= 200 chars."""

    def test_long_interest_rejected(self):
        with pytest.raises(ValidationError):
            PlanInput(city="Paris", interests=["A" * 201])

    def test_valid_interest_accepted(self):
        inp = PlanInput(city="Paris", interests=["temples", "food"])
        assert len(inp.interests) == 2


class TestBUG006_InvalidDate:
    """travel_date must be valid ISO format."""

    def test_invalid_month(self):
        with pytest.raises(ValidationError):
            PlanInput(city="Paris", travel_date="2024-13-01")

    def test_template_injection(self):
        with pytest.raises(ValidationError):
            PlanInput(city="Paris", travel_date="{{7*7}}")

    def test_valid_date(self):
        inp = PlanInput(city="Paris", travel_date="2025-06-15")
        assert inp.travel_date == "2025-06-15"


class TestBUG007_NegativeFloats:
    """Monetary fields must not be negative."""

    def test_negative_flight_price(self):
        with pytest.raises(ValidationError):
            FlightCost(route="X→Y", price_inr=-500)

    def test_negative_cash_conversion(self):
        with pytest.raises(ValidationError):
            CashConversion(currency="USD", amount_inr=-1000)


class TestBUG013_CurrencyValidation:
    """Currency must match ^[A-Za-z]{3}$."""

    def test_special_chars_rejected(self):
        with pytest.raises(ValidationError):
            PlanInput(city="Paris", currency="!@#")

    def test_empty_rejected(self):
        with pytest.raises(ValidationError):
            PlanInput(city="Paris", currency="")

    def test_valid_accepted(self):
        inp = PlanInput(city="Paris", currency="EUR")
        assert inp.currency == "EUR"


class TestBudgetCalculation:
    """Ensure calculate_budget handles edge cases gracefully."""

    def test_single_traveler_basic(self):
        result = calculate_budget(BudgetInput(
            travelers=1,
            exchange_rates=[ExchangeRate(currency="USD", rate_to_inr=83.0)],
            flights=[FlightCost(route="BLR→SGN", price_inr=15000)],
        ))
        assert result["grand_total"]["inr"] == 15000.0

    def test_currency_not_in_rates_fallback(self):
        """When a currency isn't in rates, to_inr uses rate=1.0 (documented behaviour)."""
        from agents.budget import ItemCost
        result = calculate_budget(BudgetInput(
            travelers=1,
            sightseeing=[ItemCost(name="Temple", amount=500, currency="JPY")],
        ))
        # No JPY rate → falls back to 1.0 → 500 * 1.0 = 500 INR
        assert result["fixed_costs"]["sightseeing"]["total_inr"] == 500.0


class TestMultiCityValidation:
    """MultiCityInput constraints."""

    def test_too_few_stops(self):
        with pytest.raises(ValidationError):
            MultiCityInput(stops=[CityStop(city="Paris")])

    def test_too_many_stops(self):
        stops = [CityStop(city=f"City{i}") for i in range(11)]
        with pytest.raises(ValidationError):
            MultiCityInput(stops=stops)

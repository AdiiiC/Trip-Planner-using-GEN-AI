"""Live INR forex rates.

Two providers behind one call. Orient Exchange publishes one page per currency
pair, so the primary path scrapes those concurrently; ExchangeRate-API is the
fallback and needs inverting because it quotes units-per-INR rather than
INR-per-unit.

Every rate returned by `fetch_inr_rates` is INR **per one unit** of the currency,
e.g. `{"USD": 96.64}` means 1 USD = ₹96.64.
"""

from __future__ import annotations

import asyncio
import re
from typing import NamedTuple

import httpx

# ── Provider: orientexchange.in ───────────────────────────────────────────────

_ORIENT_BASE_URL = "https://www.orientexchange.in"

_ORIENT_SLUGS: dict[str, str] = {
    "USD": "inr-usd",
    "EUR": "inr-eur",
    "GBP": "inr-gbp",
    "JPY": "inr-jpy",
    "SGD": "inr-sgd",
    "AUD": "inr-aud",
    "AED": "inr-aed",
    "CAD": "inr-cad",
    "THB": "inr-thb",
    "MYR": "inr-myr",
    "IDR": "inr-idr",
    "VND": "inr-vnd",
}

_ORIENT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}

_ORIENT_TIMEOUT_S = 7
# Below this many successful pages the scrape is treated as a failure and we
# fall back, rather than returning a half-populated table.
_ORIENT_MIN_RATES = 6

# ── Provider: exchangerate-api.com ────────────────────────────────────────────

_FALLBACK_URL = "https://api.exchangerate-api.com/v4/latest/INR"
_FALLBACK_TIMEOUT_S = 8

#: The subset `/api/forex` publishes. Other callers take the provider's full table.
HEADLINE_CURRENCIES: tuple[str, ...] = (
    "USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR",
    "SGD", "IDR", "AED", "AUD", "CAD", "CNY", "KRW",
)


class ForexRates(NamedTuple):
    rates: dict[str, float]
    provider: str


async def _fetch_orient_pair(
    client: httpx.AsyncClient, currency: str, slug: str
) -> tuple[str, float] | None:
    """Read one currency page and pull its INR rate out of the copy."""
    try:
        resp = await client.get(
            f"{_ORIENT_BASE_URL}/{slug}",
            headers=_ORIENT_HEADERS,
            follow_redirects=True,
            timeout=_ORIENT_TIMEOUT_S,
        )
    except httpx.HTTPError:
        return None

    # The page contains text like:  1 VND = 0.00386 INR
    match = re.search(
        rf"1\s+{re.escape(currency)}\s*=\s*([\d.]+)\s*INR", resp.text, re.IGNORECASE
    )
    return (currency, float(match.group(1))) if match else None


async def _scrape_orient_rates() -> dict[str, float] | None:
    """All currency pages at once. None when too few pages answered to be useful."""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(_fetch_orient_pair(client, cur, slug) for cur, slug in _ORIENT_SLUGS.items()),
            return_exceptions=True,
        )

    rates = {r[0]: r[1] for r in results if isinstance(r, tuple)}
    return rates if len(rates) >= _ORIENT_MIN_RATES else None


async def _fetch_fallback_rates(limit_to: tuple[str, ...] | None) -> dict[str, float]:
    """ExchangeRate-API quotes 1 INR = X foreign, so invert to get INR per unit."""
    async with httpx.AsyncClient(timeout=_FALLBACK_TIMEOUT_S) as client:
        resp = await client.get(_FALLBACK_URL)
        resp.raise_for_status()
        raw = resp.json().get("rates", {})

    codes = limit_to if limit_to is not None else tuple(raw)
    return {code: round(1 / raw[code], 6) for code in codes if raw.get(code)}


async def fetch_inr_rates(limit_to: tuple[str, ...] | None = None) -> ForexRates:
    """Live INR-per-unit rates, preferring Orient Exchange over the generic API.

    `limit_to` narrows the fallback provider's table to a known set of currencies;
    the scraper is already limited to the pairs Orient Exchange publishes.

    Raises `httpx.HTTPError` only when both providers are unreachable.
    """
    scraped = await _scrape_orient_rates()
    if scraped:
        return ForexRates(scraped, "orientexchange.in")
    return ForexRates(await _fetch_fallback_rates(limit_to), "exchangerate-api.com")

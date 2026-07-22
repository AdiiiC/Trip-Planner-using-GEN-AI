from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

from agents.budget import BudgetInput, calculate_budget
from agents.flights import FlightSearchInput, search_flights
from agents.hotels import HotelSearchInput, search_hotels
from agents.insurance import InsuranceInput, estimate_insurance
from agents.planner import (
    MultiCityInput,
    PackingInput,
    PlanInput,
    RefineInput,
    VisaInput,
    generate_itinerary,
    generate_multi_city,
    generate_packing_list,
    get_visa_info,
    refine_itinerary,
)
from agents.restaurants import RestaurantInput, find_restaurants
from agents.sightseeing import SightseeingInput, explore_sightseeing
from agents.visa_check import VisaCheckInput, check_visa
from agents.weather import WeatherInput, get_weather

app = FastAPI(title="Trip Planner API", version="2.0.0")

# Allow all origins — public API, no auth required
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ─────────────────────────────────────────────────────────────────

def _sse(stream: AsyncIterator[str]) -> StreamingResponse:
    async def _gen():
        async for chunk in stream:
            payload = json.dumps({"content": chunk})
            yield f"data: {payload}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream")


# ── endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/budget")
async def budget_endpoint(body: BudgetInput):
    try:
        return calculate_budget(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/plan")
async def plan_endpoint(body: PlanInput):
    return _sse(generate_itinerary(body))


@app.post("/api/refine")
async def refine_endpoint(body: RefineInput):
    return _sse(refine_itinerary(body))


@app.post("/api/packing")
async def packing_endpoint(body: PackingInput):
    return _sse(generate_packing_list(body))


@app.post("/api/visa")
async def visa_endpoint(body: VisaInput):
    return _sse(get_visa_info(body))


@app.post("/api/sightseeing")
async def sightseeing_endpoint(body: SightseeingInput):
    try:
        result = await explore_sightseeing(body)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/forex")
async def forex_endpoint(base: str = "INR"):
    """
    Returns live forex rates (INR base).
    Primary source: orientexchange.in (scraped concurrently per-currency page).
    Fallback: exchangerate-api.com.

    Response format: rates[currency] = how many INR buys 1 unit of that currency
    e.g. rates["USD"] = 96.64  →  1 USD = ₹96.64
    Note: this is INR-per-unit (NOT units-per-INR) — the frontend uses it directly.
    """
    rates = await _scrape_orient_rates()
    if rates:
        return {"base": "INR", "rates": rates, "provider": "orientexchange.in"}

    # ── Fallback: exchangerate-api.com (returns units-per-INR, so we invert) ──
    fallback_url = "https://api.exchangerate-api.com/v4/latest/INR"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(fallback_url)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("rates", {})
            wanted = ["USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR",
                      "SGD", "IDR", "AED", "AUD", "CAD", "CNY", "KRW"]
            # ExchangeRate-API gives 1 INR = X foreign, so invert to get INR per unit
            rates_inverted = {
                k: round(1 / raw[k], 6) for k in wanted if k in raw and raw[k]
            }
            return {"base": "INR", "rates": rates_inverted, "provider": "exchangerate-api.com"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Forex API unavailable: {exc}")


# ── orientexchange.in scraper ─────────────────────────────────────────────────

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

async def _fetch_orient_one(client: httpx.AsyncClient, currency: str, slug: str) -> tuple[str, float] | None:
    """Fetch a single currency page and extract its INR rate."""
    import re as _re
    url = f"https://www.orientexchange.in/{slug}"
    try:
        resp = await client.get(url, headers=_ORIENT_HEADERS, follow_redirects=True, timeout=7)
        # The page contains text like:  1 VND = 0.00386 INR
        match = _re.search(
            rf'1\s+{_re.escape(currency)}\s*=\s*([\d.]+)\s*INR',
            resp.text, _re.IGNORECASE
        )
        if match:
            return currency, float(match.group(1))
    except Exception:
        pass
    return None


async def _scrape_orient_rates() -> dict[str, float] | None:
    """Scrape all currency pages concurrently. Returns dict of {currency: INR_rate}."""
    import asyncio
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_fetch_orient_one(client, cur, slug) for cur, slug in _ORIENT_SLUGS.items()],
            return_exceptions=True,
        )
    rates: dict[str, float] = {}
    for r in results:
        if isinstance(r, tuple) and r:
            cur, rate = r
            rates[cur] = rate
    # Need at least 6 successful scrapes to be useful
    return rates if len(rates) >= 6 else None


# ── New feature endpoints ─────────────────────────────────────────────────────

@app.post("/api/flights")
async def flights_endpoint(body: FlightSearchInput):
    try:
        return await search_flights(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/hotels")
async def hotels_endpoint(body: HotelSearchInput):
    try:
        return await search_hotels(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/restaurants")
async def restaurants_endpoint(body: RestaurantInput):
    try:
        return await find_restaurants(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/insurance")
async def insurance_endpoint(body: InsuranceInput):
    return _sse(estimate_insurance(body))


@app.post("/api/weather")
async def weather_endpoint(body: WeatherInput):
    try:
        return await get_weather(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/multi-city")
async def multi_city_endpoint(body: MultiCityInput):
    return _sse(generate_multi_city(body))


@app.post("/api/visa-check")
async def visa_check_endpoint(body: VisaCheckInput):
    """
    Returns structured visa requirements + cost for an Indian passport holder
    travelling to the specified country.
    """
    try:
        return await check_visa(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

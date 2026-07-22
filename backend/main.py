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

# CORS: combine local dev origins with any production origins from env
_cors_origins: list[str] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_extra = os.getenv("ALLOWED_ORIGINS", "")  # comma-separated list
if _extra:
    _cors_origins += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
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
    Fetch live exchange rates from ExchangeRate-API (free tier, no key required for basic).
    Returns rates relative to the base currency.
    """
    url = f"https://api.exchangerate-api.com/v4/latest/{base}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            rates = data.get("rates", {})
            # Return a curated subset of common currencies
            wanted = ["USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR",
                      "SGD", "IDR", "AED", "AUD", "CAD", "CNY", "KRW"]
            return {
                "base": base,
                "rates": {k: rates[k] for k in wanted if k in rates},
                "provider": "exchangerate-api.com",
            }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Forex API unavailable: {exc}")


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

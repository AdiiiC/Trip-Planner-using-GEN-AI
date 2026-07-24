from __future__ import annotations

import json
import logging
import os
import uuid
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import sentry_sdk

load_dotenv()

# ── Sentry error monitoring ───────────────────────────────────────────────────
# Set SENTRY_DSN_BACKEND in Render environment variables.
# send_default_pii=False — we don't collect user IPs or personal data.
_sentry_dsn = os.getenv("SENTRY_DSN_BACKEND", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        send_default_pii=False,   # no IPs, no personal data collected
        traces_sample_rate=0.0,   # error-only, no performance tracing quota used
    )

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

# ── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── rate limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# ── app ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Trip Planner API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── security headers middleware ───────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Echoes or generates a X-Request-ID header for every response.
    Makes it easy to correlate client errors with Render/server logs."""
    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response


app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# ── CORS — configurable via ALLOWED_ORIGINS env var ──────────────────────────
# Production: set ALLOWED_ORIGINS=https://your-app.vercel.app in Render
# Development: defaults to * (all origins)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],       # OPTIONS preflight must be allowed
    allow_headers=["*"],
)

# ── debug mode (never enable in production) ───────────────────────────────────
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

def _safe_error(exc: Exception, context: str = "") -> str:
    """Return a safe error message — never leaks internals in production."""
    logger.error("%s: %s", context, exc, exc_info=True)
    if DEBUG:
        return str(exc)
    return "An error occurred. Please try again."


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
    """Returns service health + which integrations are configured.
    Used by Render health checks and UptimeRobot monitoring."""
    services = {
        "groq":     bool(os.getenv("GROQ_API_KEY")),
        "serper":   bool(os.getenv("SERPER_API_KEY")),
        "exa":      bool(os.getenv("EXA_API_KEY")),
        "rapidapi": bool(os.getenv("RAPIDAPI_KEY")),  # optional — falls back to Photon
    }
    return {
        "status":   "ok" if all(services.values()) else "degraded",
        "version":  "2.0.0",
        "services": services,
    }


@app.post("/api/budget")
@limiter.limit("30/minute")
async def budget_endpoint(request: Request, body: BudgetInput):
    try:
        return calculate_budget(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=_safe_error(exc, "budget"))


@app.post("/api/plan")
@limiter.limit("10/minute")
async def plan_endpoint(request: Request, body: PlanInput):
    return _sse(generate_itinerary(body))


@app.post("/api/refine")
@limiter.limit("10/minute")
async def refine_endpoint(request: Request, body: RefineInput):
    return _sse(refine_itinerary(body))


@app.post("/api/packing")
@limiter.limit("15/minute")
async def packing_endpoint(request: Request, body: PackingInput):
    return _sse(generate_packing_list(body))


@app.post("/api/visa")
@limiter.limit("15/minute")
async def visa_endpoint(request: Request, body: VisaInput):
    return _sse(get_visa_info(body))


@app.post("/api/sightseeing")
@limiter.limit("20/minute")
async def sightseeing_endpoint(request: Request, body: SightseeingInput):
    try:
        return await explore_sightseeing(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "sightseeing"))


@app.get("/api/forex")
@limiter.limit("30/minute")
async def forex_endpoint(request: Request, base: str = "INR"):
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
        raise HTTPException(status_code=503, detail=_safe_error(exc, "forex"))


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
@limiter.limit("20/minute")
async def flights_endpoint(request: Request, body: FlightSearchInput):
    try:
        return await search_flights(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "flights"))


@app.post("/api/hotels")
@limiter.limit("20/minute")
async def hotels_endpoint(request: Request, body: HotelSearchInput):
    try:
        return await search_hotels(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "hotels"))


@app.post("/api/restaurants")
@limiter.limit("20/minute")
async def restaurants_endpoint(request: Request, body: RestaurantInput):
    try:
        return await find_restaurants(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "restaurants"))


@app.post("/api/insurance")
@limiter.limit("10/minute")
async def insurance_endpoint(request: Request, body: InsuranceInput):
    return _sse(estimate_insurance(body))


@app.post("/api/weather")
@limiter.limit("30/minute")
async def weather_endpoint(request: Request, body: WeatherInput):
    try:
        return await get_weather(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "weather"))


@app.post("/api/multi-city")
@limiter.limit("10/minute")
async def multi_city_endpoint(request: Request, body: MultiCityInput):
    return _sse(generate_multi_city(body))


@app.get("/api/cities")
@limiter.limit("120/minute")
async def cities_endpoint(request: Request, q: str = "", k: int = 7):
    """
    City autocomplete proxy — keeps RAPIDAPI_KEY server-side (never sent to browser).
    Primary: GeoDB Cities API via RapidAPI (ranked by population).
    Fallback: Photon by Komoot (free, no key required).
    Results cached 1 hour — city names don't change.
    """
    from agents.cache import search_cache
    q = q.strip()
    if len(q) < 2:
        return []

    cache_key = search_cache.make_key("cities", q, str(k))
    if cached := search_cache.get(cache_key):
        return cached

    rapidapi_key = os.getenv("RAPIDAPI_KEY", "")

    # ── GeoDB (if key is configured) ─────────────────────────────────────────
    if rapidapi_key:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    "https://wft-geo-db.p.rapidapi.com/v1/geo/cities",
                    params={"namePrefix": q, "limit": k, "sort": "-population", "types": "CITY"},
                    headers={
                        "X-RapidAPI-Key": rapidapi_key,
                        "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com",
                    },
                )
                if resp.status_code == 200:
                    results = [
                        {"name": c["city"], "country": c["country"], "region": c.get("region", "")}
                        for c in resp.json().get("data", [])
                    ]
                    search_cache.set(cache_key, results)
                    return results
        except Exception:
            pass  # fall through to Photon

    # ── Photon fallback (free, no key) ────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://photon.komoot.io/api/",
                params={"q": q, "limit": k, "lang": "en"},
            )
            if resp.status_code == 200:
                results = [
                    {
                        "name": f["properties"]["name"],
                        "country": f["properties"].get("country", ""),
                        "region": f["properties"].get("state", ""),
                    }
                    for f in resp.json().get("features", [])
                    if f["properties"].get("type") in ("city", "town", "village")
                ][:k]
                search_cache.set(cache_key, results)
                return results
    except Exception:
        pass

    return []


@app.post("/api/visa-check")
@limiter.limit("20/minute")
async def visa_check_endpoint(request: Request, body: VisaCheckInput):
    """
    Returns structured visa requirements + cost for an Indian passport holder
    travelling to the specified country.
    """
    try:
        return await check_visa(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "visa-check"))

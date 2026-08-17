from __future__ import annotations

import json
import logging
import re
import uuid
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import sentry_sdk

load_dotenv()

from config import settings

# ── Sentry error monitoring ───────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        send_default_pii=False,
        traces_sample_rate=0.0,
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
from agents.currency import ConvertInput, convert_currency
from agents.extract_costs import ExtractCostsInput, extract_costs
from agents.route import OptimizeRouteInput, optimize_route
from agents.export import ExportInput, build_ics
from agents.best_time import BestTimeInput, best_time_to_visit
from agents.cash_predict import CashPredictInput, predict_cash
from agents.attraction_price import AttractionPriceInput, get_attraction_price

from db import init_db
from auth_routes import router as auth_router
from plans_routes import router as plans_router

# ── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── rate limiter ─────────────────────────────────────────────────────────────

from rate_limit import limiter

# ── app ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Trip Planner API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def _limit_body_size(request: Request, call_next):
    """BUG-003: handles both Content-Length and chunked transfer encoding."""
    max_bytes = settings.max_body_bytes

    # Fast path — Content-Length header present
    cl = request.headers.get("content-length")
    if cl and int(cl) > max_bytes:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=413, content={"detail": "Request body too large (max 1 MB)"})

    # Slow path — chunked encoding (no Content-Length); buffer and enforce limit
    if not cl and request.method in ("POST", "PUT", "PATCH"):
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > max_bytes:
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=413, content={"detail": "Request body too large (max 1 MB)"})
        # Cache the consumed body so route handlers can still read it
        async def _cached_receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request._receive = _cached_receive  # type: ignore[attr-defined]

    return await call_next(request)


# ── hCaptcha verification ─────────────────────────────────────────────────────
# Set HCAPTCHA_SECRET_KEY in Render to activate captcha on expensive LLM endpoints.
# Get your key at https://dashboard.hcaptcha.com — free tier available.
# When key is not set, captcha is skipped (graceful degradation).

_HCAPTCHA_SECRET = settings.hcaptcha_secret
_HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify"
_CAPTCHA_PATHS = {"/api/plan", "/api/multi-city", "/api/refine"}


async def _verify_captcha(token: str) -> bool:
    """Returns True if token is valid or captcha is not configured."""
    if not _HCAPTCHA_SECRET:
        return True  # captcha not configured — allow all
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                _HCAPTCHA_VERIFY_URL,
                data={"secret": _HCAPTCHA_SECRET, "response": token},
            )
            return resp.json().get("success", False)
    except Exception:
        return True  # network error — fail open (don't block legitimate users)
                     # BUG-009: determined attackers can bypass by blocking api.hcaptcha.com
                     # Mitigation: keep rate limiting as primary defence


@app.middleware("http")
async def _captcha_middleware(request: Request, call_next):
    if _HCAPTCHA_SECRET and request.url.path in _CAPTCHA_PATHS:
        token = request.headers.get("X-Captcha-Token", "")
        if not await _verify_captcha(token):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "Captcha verification failed."})
    return await call_next(request)

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

# ── CORS ─────────────────────────────────────────────────────────────────────
# allow_origins=["*"] — CORS origin restriction is a browser hint, not real security.
# Real protection is: rate limiting + server-side API keys + input validation.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── accounts: auth + saved-plan sync ─────────────────────────────────────────

@app.on_event("startup")
def _init_accounts_db() -> None:
    init_db()


app.include_router(auth_router)
app.include_router(plans_router)

# ── debug mode (never enable in production) ───────────────────────────────────
DEBUG = settings.debug

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
        "groq":     bool(settings.groq_api_key),
        "serper":   bool(settings.serper_api_key),
        "exa":      bool(settings.exa_api_key),
        "rapidapi": bool(settings.rapidapi_key),
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

    rapidapi_key = settings.rapidapi_key

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


# ── New feature endpoints ─────────────────────────────────────────────────────

@app.post("/api/currency-convert")
@limiter.limit("60/minute")
async def currency_convert_endpoint(request: Request, body: ConvertInput):
    """Convert an amount between two currencies using live Orient Exchange rates."""
    rates = await _scrape_orient_rates() or {}
    if not rates:
        # fall back to forex endpoint's inverted rates
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get("https://api.exchangerate-api.com/v4/latest/INR")
                raw = resp.json().get("rates", {})
                rates = {k: round(1 / v, 6) for k, v in raw.items() if v}
        except Exception:
            rates = {}
    try:
        return convert_currency(body, rates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "currency-convert"))


@app.post("/api/extract-costs")
@limiter.limit("15/minute")
async def extract_costs_endpoint(request: Request, body: ExtractCostsInput):
    """Extract structured cost line-items from an itinerary (itinerary -> budget)."""
    try:
        return await extract_costs(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "extract-costs"))


@app.post("/api/optimize-route")
@limiter.limit("30/minute")
async def optimize_route_endpoint(request: Request, body: OptimizeRouteInput):
    """Order multi-city stops to minimise total travel distance."""
    try:
        return optimize_route(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=_safe_error(exc, "optimize-route"))


@app.post("/api/best-time")
@limiter.limit("20/minute")
async def best_time_endpoint(request: Request, body: BestTimeInput):
    """Month-by-month best-time-to-visit scores for a destination."""
    from agents.cache import search_cache
    cache_key = search_cache.make_key("best-time", body.destination.lower())
    cached = search_cache.get(cache_key)
    if cached:
        return cached
    try:
        result = await best_time_to_visit(body)
        search_cache.set(cache_key, result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "best-time"))


@app.post("/api/cash-predict")
@limiter.limit("20/minute")
async def cash_predict_endpoint(request: Request, body: CashPredictInput):
    """Predict how much physical cash (USD) to carry for the whole trip."""
    try:
        return await predict_cash(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "cash-predict"))


@app.post("/api/attraction-price")
@limiter.limit("30/minute")
async def attraction_price_endpoint(request: Request, body: AttractionPriceInput):
    """Look up the entry fee for a specific attraction."""
    try:
        return await get_attraction_price(body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "attraction-price"))


@app.post("/api/export/ics")
@limiter.limit("30/minute")
async def export_ics_endpoint(request: Request, body: ExportInput):
    """Return an iCalendar (.ics) file for the trip events."""
    try:
        ics = build_ics(body)
        filename = f"{body.title.replace(' ', '-').lower()[:40] or 'trip'}.ics"
        return Response(
            content=ics,
            media_type="text/calendar",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_safe_error(exc, "export-ics"))



# ── city photography (free · Wikipedia lead image + Wikimedia thumbs) ──────
from agents.cache import search_cache as _photo_cache  # reuse

_PHOTO_CACHE_TTL = 60 * 60 * 24  # 24h


async def _wiki_lead_image(query: str) -> str | None:
    """Fetch a city hero image from Wikipedia's REST summary API. Free, no key."""
    q = query.strip().replace(" ", "_")
    if not q:
        return None
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{q}"
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Wayfare/2.0 (contact@wayfare.app)"})
            if r.status_code != 200:
                return None
            data = r.json()
            src = (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get("source")
            return src
    except Exception:
        return None


@app.get("/api/city-photo")
@limiter.limit("60/minute")
async def city_photo(request: Request, city: str, country: str | None = None):
    """
    Return a hot-linkable hero image URL for a city.
    Strategy: Wikipedia lead image (with country disambiguation), fallback Unsplash Source URL.
    """
    city_norm = (city or "").strip()
    if not city_norm:
        raise HTTPException(status_code=400, detail="city query param is required")

    cache_key = f"city-photo::{city_norm.lower()}::{(country or '').lower()}"
    cached = _photo_cache.get(cache_key)
    if cached:
        return cached

    # Try Wikipedia with country disambiguation first, then plain city
    src = None
    if country:
        src = await _wiki_lead_image(f"{city_norm}, {country}")
    if not src:
        src = await _wiki_lead_image(city_norm)

    # Fallback: Unsplash Source URL (deprecated but still redirects to a random photo)
    if not src:
        from urllib.parse import quote_plus
        src = f"https://source.unsplash.com/1600x900/?{quote_plus(city_norm)},travel,city"

    payload = {"city": city_norm, "url": src, "source": "wikipedia" if "wikipedia" in (src or "") or "wikimedia" in (src or "") else "unsplash"}
    _photo_cache.set(cache_key, payload)
    return payload


# ── share a trip (public read-only) ──────────────────────────────────────────
# Uses Redis for persistence (survives Render restarts) with JSON filesystem fallback.
import pathlib
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from agents.cache import search_cache as _share_cache

_SHARES_DIR = pathlib.Path(__file__).parent / "data"
_SHARES_DIR.mkdir(parents=True, exist_ok=True)
_SHARES_FILE = _SHARES_DIR / "shares.json"

_SHARE_TTL = 90 * 24 * 60 * 60  # 90 days in seconds


def _load_shares() -> dict:
    """Load from Redis first, fall back to local file."""
    # Try Redis
    if hasattr(_share_cache, '_available') and _share_cache._available:
        return {}  # Redis mode — each share is stored individually by key
    # Fallback — file mode
    if not _SHARES_FILE.exists():
        return {}
    try:
        return json.loads(_SHARES_FILE.read_text())
    except Exception:
        return {}


def _save_share(share_id: str, data: dict) -> None:
    """Persist a share to Redis (preferred) or file fallback."""
    cache_key = f"share::{share_id}"
    # Try Redis with long TTL
    if hasattr(_share_cache, '_client') and hasattr(_share_cache, '_available') and _share_cache._available:
        try:
            _share_cache._client.setex(cache_key, _SHARE_TTL, json.dumps(data))
            return
        except Exception:
            pass
    # Fallback — append to file
    try:
        shares = {}
        if _SHARES_FILE.exists():
            shares = json.loads(_SHARES_FILE.read_text())
        shares[share_id] = data
        _SHARES_FILE.write_text(json.dumps(shares))
    except Exception as exc:
        logger.warning("Failed to persist share: %s", exc)


def _get_share(share_id: str) -> dict | None:
    """Retrieve a share from Redis first, then file fallback."""
    cache_key = f"share::{share_id}"
    # Try Redis
    if hasattr(_share_cache, '_client') and hasattr(_share_cache, '_available') and _share_cache._available:
        try:
            raw = _share_cache._client.get(cache_key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    # Fallback — file
    shares = _load_shares()
    return shares.get(share_id)


class ShareInput(BaseModel):
    title: str = Field(default="Untitled Trip", min_length=1, max_length=140)
    city: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=80)
    days: int = Field(default=0, ge=0, le=60)
    markdown: str = Field(..., min_length=10, max_length=200_000)


def _share_author(authorization: str | None) -> str:
    """The handle to credit on a share, or "" to stay anonymous.

    Auth is optional here: sharing works logged out, and a logged-in user is only
    credited if they chose a handle. It deliberately never falls back to any part
    of the email address, since the share page is public.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return ""
    from auth_security import decode_token
    from db import SessionLocal
    import models

    user_id = decode_token(authorization.split(" ", 1)[1].strip(), expected_scope="access")
    if user_id is None:
        return ""
    db = SessionLocal()
    try:
        user = db.get(models.User, user_id)
        return user.username or "" if user else ""
    finally:
        db.close()


@app.post("/api/share")
@limiter.limit("10/minute")
async def create_share(request: Request, body: ShareInput, authorization: str | None = Header(default=None)):
    """Create a public, read-only shared trip. Returns a short id + url path."""
    share_id = uuid.uuid4().hex[:10]

    share_data = {
        "id":       share_id,
        "title":    body.title.strip() or "Untitled Trip",
        "city":     body.city.strip(),
        "country":  body.country.strip(),
        "days":     body.days,
        "markdown": body.markdown,
        "author":   _share_author(authorization),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_share(share_id, share_data)
    return {"id": share_id, "path": f"/share/{share_id}"}


@app.get("/api/share/{share_id}")
@limiter.limit("120/minute")
async def get_share(request: Request, share_id: str):
    if not re.fullmatch(r"[0-9a-f]{10}", share_id):
        raise HTTPException(status_code=404, detail="Shared trip not found")
    entry = _get_share(share_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Shared trip not found")
    return entry


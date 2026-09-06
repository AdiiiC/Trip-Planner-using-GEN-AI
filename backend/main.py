from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import quote, quote_plus

import httpx
import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

load_dotenv()

from config import settings

# ── Sentry error monitoring ───────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        send_default_pii=False,
        traces_sample_rate=0.0,
    )

from agents.attraction_price import AttractionPriceInput, get_attraction_price
from agents.best_time import BestTimeInput, best_time_to_visit
from agents.budget import BudgetInput, calculate_budget
from agents.cash_predict import CashPredictInput, predict_cash
from agents.currency import ConvertInput, convert_currency
from agents.export import ExportInput, build_ics
from agents.extract_costs import ExtractCostsInput, extract_costs
from agents.flights import FlightSearchInput, search_flights
from agents.forex import HEADLINE_CURRENCIES, fetch_inr_rates
from agents.geospatial import (
    DistanceMatrixInput,
    PlaceSearchInput,
    ReverseGeocodeInput,
    distance_matrix,
    reverse_geocode,
    search_places,
)
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
from agents.route import OptimizeRouteInput, optimize_route
from agents.sightseeing import SightseeingInput, explore_sightseeing
from agents.travel_intelligence import IntelligenceRequest, analyze
from agents.visa_check import VisaCheckInput, check_visa
from agents.weather import WeatherInput, get_weather
from auth_routes import router as auth_router
from auth_security import decode_token
from db import check_database, init_db
from observability import configure_logging, metrics, request_id_var, user_id_var
from plans_routes import router as plans_router

# ── logging ───────────────────────────────────────────────────────────

configure_logging(json_output=settings.log_format == "json")
logger = logging.getLogger(__name__)

# ── rate limiter ─────────────────────────────────────────────────────────────

from rate_limit import limiter

# ── app ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Fail fast rather than serving traffic with a forgeable JWT signing key.
    if settings.is_production:
        settings.assert_production_ready()
    else:
        for problem in settings.insecure_settings():
            logger.warning("insecure setting", extra={"problem": problem})
    # Not fatal: one instance with these settings is fine. Logged so that the
    # reason is already in the log when someone scales to two and things go odd.
    for constraint in settings.single_instance_constraints():
        logger.warning("single-instance constraint", extra={"constraint": constraint})
    init_db()
    yield


app = FastAPI(title="Trip Planner API", version="2.0.0", lifespan=lifespan)
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


class RequestContextMiddleware:
    """Correlates, times and records every request.

    The id was previously generated and returned to the client but never logged,
    so the X-Request-ID a user quotes from a failed response matched nothing on
    the server. It now goes into a ContextVar that the JSON formatter stamps onto
    every log line emitted while handling that request.

    Written as raw ASGI rather than BaseHTTPMiddleware on purpose. BaseHTTPMiddleware
    runs the endpoint in a separate anyio task, so a ContextVar set down in a
    dependency (`user_id_var` in `get_current_user`) is set in a *copy* of the
    context and is empty again by the time the middleware logs. Raw ASGI stays in
    one context, so the summary line below actually carries the user id.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_var.set(req_id)
        user_id_var.set(_log_user_id(request))
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = req_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            logger.exception(
                "request failed",
                extra={"method": request.method, "route": _route_label(scope),
                       "path": request.url.path, "status": 500,
                       "duration_ms": round(duration_ms, 1)},
            )
            metrics.record_request(_route_label(scope), 500, duration_ms)
            raise

        duration_ms = (time.perf_counter() - started) * 1000
        # The path template ("/api/share/{share_id}"), not the filled-in path, so
        # latency for one endpoint isn't split across unbounded distinct labels.
        label = _route_label(scope)
        metrics.record_request(label, status, duration_ms)
        logger.log(
            logging.WARNING if status >= 500 else logging.INFO,
            "request",
            extra={
                "method": request.method,
                "route": label,
                "path": request.url.path,
                "status": status,
                "duration_ms": round(duration_ms, 1),
            },
        )


def _route_label(scope: Scope) -> str:
    route = scope.get("route")
    return getattr(route, "path", None) or scope.get("path", "unknown")


def _log_user_id(request: Request) -> str:
    """Best-effort user id for log attribution only -- never for authorisation.

    Resolved here rather than in `get_current_user` because that dependency is a
    sync `def`, so FastAPI runs it in a threadpool with a *copy* of the context;
    a ContextVar set there is discarded and never reaches the handler or this
    middleware. Setting it at the top of the request puts it in the context that
    everything downstream is copied from.

    The signature is still verified (`decode_token` returns None otherwise), so a
    forged token cannot attribute log lines to someone else's account.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return ""
    user_id = decode_token(header[7:], "access")
    return str(user_id) if user_id else ""


app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Origins come from ALLOWED_ORIGINS (see config.cors_origins). A wildcard was
# used here previously; it let any site on the internet spend this deployment's
# metered LLM and search API quota from a visitor's browser, with the per-IP rate
# limit as the only brake.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# ── accounts: auth + saved-plan sync ─────────────────────────────────────────

app.include_router(auth_router)
app.include_router(plans_router)

# ── debug mode (never enable in production) ───────────────────────────────────
DEBUG = settings.debug

def _safe_error(exc: Exception, context: str = "") -> str:
    """Return a safe error message — never leaks internals in production.

    The request_id attached to this line is the same one echoed to the caller in
    X-Request-ID, so a user reporting "it failed" can be traced to this entry.
    """
    logger.error(
        "handler failed",
        extra={"context": context or "unknown", "error_type": type(exc).__name__},
        exc_info=True,
    )
    if DEBUG:
        return str(exc)
    return "An error occurred. Please try again."


# ── helpers ─────────────────────────────────────────────────────────────────

def _safe_filename(title: str, fallback: str = "trip") -> str:
    """A download name that can't break out of the Content-Disposition header.

    The title is user-supplied, so a quote or CRLF in it would otherwise let the
    caller terminate the filename early and append headers of their own.
    """
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", title.strip()).strip("-.")
    return cleaned.lower()[:40] or fallback


def _sse(stream: AsyncIterator[str]) -> StreamingResponse:
    async def _gen():
        try:
            async for chunk in stream:
                payload = json.dumps({"content": chunk})
                yield f"data: {payload}\n\n"
        except Exception as exc:
            logger.error(
            "streaming endpoint failed",
            extra={"error_type": type(exc).__name__},
            exc_info=True,
        )
            payload = json.dumps({"error": "The AI provider is unavailable. Please try again shortly."})
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


@app.get("/healthz")
async def liveness():
    """Liveness: is this process up? No dependencies, so a slow database never
    causes the orchestrator to kill an otherwise healthy container."""
    return {"status": "ok", "version": app.version}


@app.get("/readyz")
async def readiness(response: Response):
    """Readiness: can this process actually serve requests?

    Checks the one dependency that has no fallback — the database. The LLM and
    search providers are reported for visibility but deliberately do not fail
    the check, because every route that uses them already degrades gracefully.
    Returns 503 when unready so load balancers stop sending traffic.
    """
    db_ok, db_detail = check_database()
    checks = {
        "database": {"ok": db_ok, "detail": db_detail},
        "llm":      {"ok": settings.has_groq or settings.has_fallback, "required": False},
        "cache":    {"ok": bool(settings.redis_url), "required": False},
    }
    if not db_ok:
        response.status_code = 503
    return {"status": "ready" if db_ok else "unready", "version": app.version, "checks": checks}


@app.get("/metrics")
async def metrics_endpoint():
    """Request rate, error rate and latency percentiles for this process.

    Per-process, so with several workers or instances each reports only its own
    share. Enough to answer "is it slow / is it erroring" on a single instance;
    point a real collector at it before relying on it beyond that.
    """
    return metrics.snapshot()


@app.post("/api/budget")
@limiter.limit("30/minute")
def budget_endpoint(request: Request, body: BudgetInput):
    # Deliberately `def`, not `async def`: the body is synchronous CPU work, and on
    # the event loop it stalls every other request in the process until it returns.
    # FastAPI runs non-async handlers in a threadpool.
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


@app.post("/api/places/search")
@limiter.limit("60/minute")
async def places_search_endpoint(request: Request, body: PlaceSearchInput):
    try:
        return await search_places(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_safe_error(exc, "place search"))


@app.post("/api/places/reverse")
@limiter.limit("60/minute")
async def places_reverse_endpoint(request: Request, body: ReverseGeocodeInput):
    try:
        return await reverse_geocode(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_safe_error(exc, "reverse geocoding"))


@app.post("/api/places/distances")
@limiter.limit("60/minute")
async def places_distances_endpoint(request: Request, body: DistanceMatrixInput):
    return await distance_matrix(body)


@app.post("/api/intelligence")
@limiter.limit("120/minute")
def intelligence_endpoint(request: Request, body: IntelligenceRequest):
    try:
        return analyze(body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/api/forex")
@limiter.limit("30/minute")
async def forex_endpoint(request: Request, base: str = "INR"):
    """
    Returns live forex rates (INR base).

    Response format: rates[currency] = how many INR buys 1 unit of that currency
    e.g. rates["USD"] = 96.64  →  1 USD = ₹96.64
    Note: this is INR-per-unit (NOT units-per-INR) — the frontend uses it directly.
    """
    try:
        result = await fetch_inr_rates(HEADLINE_CURRENCIES)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc, "forex"))
    return {"base": "INR", "rates": result.rates, "provider": result.provider}


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
    try:
        rates = (await fetch_inr_rates()).rates
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
def optimize_route_endpoint(request: Request, body: OptimizeRouteInput):
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
def export_ics_endpoint(request: Request, body: ExportInput):
    """Return an iCalendar (.ics) file for the trip events."""
    try:
        ics = build_ics(body)
        return Response(
            content=ics,
            media_type="text/calendar",
            headers={"Content-Disposition": f'attachment; filename="{_safe_filename(body.title)}.ics"'},
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
    # quote() with no safe chars: an unescaped title can contain ../ and walk the
    # request onto a different Wikipedia API path.
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(q, safe='')}"
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
        src = f"https://source.unsplash.com/1600x900/?{quote_plus(city_norm)},travel,city"

    payload = {"city": city_norm, "url": src, "source": "wikipedia" if "wikipedia" in (src or "") or "wikimedia" in (src or "") else "unsplash"}
    _photo_cache.set(cache_key, payload)
    return payload


# ── share a trip (public read-only) ──────────────────────────────────────────
# Uses Redis for persistence (survives Render restarts) with JSON filesystem fallback.
import pathlib
from datetime import UTC, datetime

from agents.cache import search_cache as _share_cache
from pydantic import BaseModel, Field

_SHARES_DIR = pathlib.Path(__file__).parent / "data"
_SHARES_DIR.mkdir(parents=True, exist_ok=True)
_SHARES_FILE = _SHARES_DIR / "shares.json"

_SHARE_TTL = 90 * 24 * 60 * 60  # 90 days in seconds
_SHARES_LOCK = threading.Lock()


def _read_shares_file() -> dict:
    if not _SHARES_FILE.exists():
        return {}
    try:
        return json.loads(_SHARES_FILE.read_text())
    except Exception:
        return {}


def _load_shares() -> dict:
    """Load from Redis first, fall back to local file."""
    # Try Redis
    if hasattr(_share_cache, '_available') and _share_cache._available:
        return {}  # Redis mode — each share is stored individually by key
    return _read_shares_file()


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
    # Fallback — rewrite the file under a lock. Concurrent writers previously
    # read-modify-wrote the same dict and silently dropped each other's shares,
    # and a partial write left unparseable JSON that read back as "no shares".
    try:
        with _SHARES_LOCK:
            shares = _read_shares_file()
            shares[share_id] = data
            _prune_expired(shares)
            tmp = _SHARES_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(shares))
            tmp.replace(_SHARES_FILE)  # atomic on POSIX and Windows
    except Exception as exc:
        logger.warning(
            "share persistence failed, link will not survive restart",
            extra={"share_id": share_id, "error_type": type(exc).__name__},
        )


def _prune_expired(shares: dict) -> None:
    """Drop shares past _SHARE_TTL so the file doesn't grow without bound.

    Redis expires keys on its own; the file fallback never did, so every share
    ever created stayed on disk and was re-parsed on each read.
    """
    cutoff = datetime.now(UTC).timestamp() - _SHARE_TTL
    for key, entry in list(shares.items()):
        created = entry.get("created_at") if isinstance(entry, dict) else None
        if not created:
            continue
        try:
            if datetime.fromisoformat(created).timestamp() < cutoff:
                del shares[key]
        except ValueError:
            continue


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
    import models
    from auth_security import decode_token
    from db import SessionLocal

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
        "created_at": datetime.now(UTC).isoformat(),
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


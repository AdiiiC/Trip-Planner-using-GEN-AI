"""The app-wide rate limiter.

Lives in its own module so routers (auth, plans) can throttle their endpoints
without importing `main`, which imports them.
"""
from __future__ import annotations

import logging
import re

from config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """The caller's IP, or the proxy's if we have no reason to trust the headers.

    On Render/Fly/Heroku every request arrives from the load balancer, so keying
    on the socket address collapses all users into a single bucket: one busy
    client can exhaust the limit for everybody. X-Forwarded-For fixes that, but
    it is caller-supplied and trivially spoofed to get unlimited fresh buckets,
    so it is only honoured when TRUST_PROXY_HEADERS says a proxy really is in
    front of us and is overwriting the header.
    """
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# In-memory storage is per-process, so limits reset on every deploy and each
# uvicorn worker enforces its own quota. Redis gives one shared, durable counter.
_MEMORY = "memory://"


def _build_limiter(storage_uri: str) -> Limiter:
    return Limiter(
        key_func=client_ip,
        default_limits=[settings.rate_limit],
        storage_uri=storage_uri,
    )


def _resolve_storage_uri() -> str:
    if not settings.redis_url:
        logger.warning("rate limiter: no REDIS_URL, using per-process memory storage")
        return _MEMORY
    # A bare password is a common REDIS_URL mistake, and `limits` reports the
    # unusable value verbatim in its exception -- which puts the credential in
    # the crash log. Check the shape first and never echo the value.
    if not re.match(r"^[a-z][a-z0-9+.\-]*://", settings.redis_url, re.IGNORECASE):
        logger.error(
            "rate limiter: REDIS_URL has no URL scheme, falling back to per-process "
            "memory storage. Expected redis://:password@host:port/0 — a bare password "
            "is the usual cause. Value withheld from logs.",
        )
        return _MEMORY
    return settings.redis_url


def _storage_reachable(candidate: Limiter) -> bool:
    """`limits` connects lazily, so an unreachable Redis imports fine and then
    raises on the first throttled request -- turning every rate-limited route
    into a 500. Check once at startup instead."""
    try:
        return bool(candidate._storage.check())
    except Exception:
        return False


try:
    limiter = _build_limiter(_resolve_storage_uri())
    if not _storage_reachable(limiter):
        logger.error(
            "rate limiter: storage unreachable, falling back to per-process memory. "
            "Limits will be enforced per instance until the backend recovers.",
        )
        limiter = _build_limiter(_MEMORY)
except Exception as exc:
    # Rate limiting is a safeguard, not the service. A storage backend the app
    # cannot use must degrade it, not stop the process from starting at all.
    logger.error(
        "rate limiter: storage backend unusable, falling back to per-process memory",
        extra={"error_type": type(exc).__name__},
    )
    limiter = _build_limiter(_MEMORY)

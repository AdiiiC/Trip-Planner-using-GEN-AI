"""The app-wide rate limiter.

Lives in its own module so routers (auth, plans) can throttle their endpoints
without importing `main`, which imports them.
"""
from __future__ import annotations

import logging

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
_storage_uri = settings.redis_url or "memory://"
if not settings.redis_url:
    logger.warning("rate limiter: no REDIS_URL, using per-process memory storage")

limiter = Limiter(
    key_func=client_ip,
    default_limits=[settings.rate_limit],
    storage_uri=_storage_uri,
)

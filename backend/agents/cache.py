"""
Cache layer for search results.

Priority:
1. Redis (if REDIS_URL env var is set) — survives Render restarts and deployments
2. In-memory TTLCache (fallback) — resets on process restart but zero config needed

Set REDIS_URL in Render/local .env to activate Redis-backed caching:
  REDIS_URL=redis://default:password@host:6379
Free options: Upstash (10k req/day), Redis Cloud free tier (30MB)
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import time
from threading import Lock
from typing import Any

# ── In-memory fallback ────────────────────────────────────────────────────────

class TTLCache:
    """Simple LRU-evicting TTL cache. No external dependencies."""

    def __init__(self, maxsize: int = 200, ttl: int = 600) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, ts = entry
            if time.monotonic() - ts > self._ttl:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._store) >= self._maxsize:
                oldest = min(self._store, key=lambda k: self._store[k][1])
                del self._store[oldest]
            self._store[key] = (value, time.monotonic())

    def make_key(self, *parts: str) -> str:
        raw = ":".join(parts)
        return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── Redis-backed cache ────────────────────────────────────────────────────────

class RedisCache:
    """Redis-backed cache with automatic JSON serialisation.
    Falls back to no-op if Redis is unavailable at startup."""

    def __init__(self, url: str, ttl: int = 600) -> None:
        self._ttl = ttl
        self._available = False
        try:
            import redis as _redis
            self._client = _redis.from_url(url, decode_responses=True, socket_timeout=2)
            self._client.ping()
            self._available = True
        except Exception:
            pass  # Redis not reachable — TTLCache will be used instead

    def get(self, key: str) -> Any | None:
        if not self._available:
            return None
        try:
            raw = self._client.get(key)
            return json.loads(raw) if raw else None
        except Exception:
            return None

    def set(self, key: str, value: Any) -> None:
        if not self._available:
            return
        with contextlib.suppress(Exception):   # a cache write is never worth failing a request
            self._client.setex(key, self._ttl, json.dumps(value))

    def make_key(self, *parts: str) -> str:
        raw = ":".join(parts)
        return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── Export: Redis if configured, otherwise in-memory ─────────────────────────

_redis_url = os.getenv("REDIS_URL", "")
search_cache: TTLCache | RedisCache = (
    RedisCache(url=_redis_url, ttl=600) if _redis_url else TTLCache(maxsize=200, ttl=600)
)


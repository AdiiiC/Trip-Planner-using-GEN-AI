"""
In-memory TTL cache for search results.
Prevents identical queries from re-hitting Serper/Exa within the TTL window.
Thread-safe via threading.Lock.
"""
from __future__ import annotations

import hashlib
import time
from threading import Lock
from typing import Any


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
                # Evict the oldest entry
                oldest = min(self._store, key=lambda k: self._store[k][1])
                del self._store[oldest]
            self._store[key] = (value, time.monotonic())

    def make_key(self, *parts: str) -> str:
        raw = ":".join(parts)
        return hashlib.sha256(raw.encode()).hexdigest()[:32]


# Shared singletons — 10-minute TTL, 200 entries each
search_cache: TTLCache = TTLCache(maxsize=200, ttl=600)

"""The app-wide rate limiter.

Lives in its own module so routers (auth, plans) can throttle their endpoints
without importing `main`, which imports them.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

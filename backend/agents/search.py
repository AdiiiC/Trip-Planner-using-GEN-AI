"""
Unified search helpers.

- serper_search()  →  Google results via Serper.dev
                      Best for: prices, booking availability, official visa pages
- exa_search()     →  Neural semantic search via Exa
                      Best for: rich destination content, restaurant guides, attraction info

Both return list[dict] with 'content' and 'url' keys.
Results are cached in-memory for 10 minutes to avoid redundant API calls.
Tenacity retries on transient HTTP/timeout errors (3 attempts, exponential backoff).
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from agents.cache import search_cache

SERPER_KEY = os.getenv("SERPER_API_KEY", "")
EXA_KEY    = os.getenv("EXA_API_KEY", "")

# Module-level Exa singleton — created once, reused across requests
_exa_client: object | None = None


def _get_exa():
    global _exa_client
    if _exa_client is None:
        from exa_py import Exa
        _exa_client = Exa(api_key=EXA_KEY)
    return _exa_client


# ── Serper ───────────────────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
    reraise=True,
)
async def _serper_fetch(query: str, k: int) -> list[dict[str, Any]]:
    """Inner fetch — retried on HTTP errors/timeouts."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": SERPER_KEY,
                "Content-Type": "application/json",
            },
            json={"q": query, "num": k, "gl": "in", "hl": "en"},
        )
        resp.raise_for_status()
        data = resp.json()

    results: list[dict[str, Any]] = []

    if ab := data.get("answerBox"):
        snippet = ab.get("answer") or ab.get("snippet") or ""
        if snippet:
            results.append({"content": snippet, "url": ab.get("link", "")})

    for item in data.get("organic", [])[:k]:
        content = item.get("snippet", "")
        for sl in (item.get("sitelinks") or [])[:3]:
            if sl.get("snippet"):
                content += " " + sl["snippet"]
        results.append({"content": content.strip(), "url": item.get("link", "")})

    return results[:k]


async def serper_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """
    Google search via Serper.dev. Results cached 10 min.
    Returns [] silently if SERPER_API_KEY is not set.
    """
    if not SERPER_KEY:
        return []

    cache_key = search_cache.make_key("serper", query, str(k))
    if cached := search_cache.get(cache_key):
        return cached  # type: ignore[return-value]

    results = await _serper_fetch(query, k)
    search_cache.set(cache_key, results)
    return results


# ── Exa ──────────────────────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
def _exa_fetch_sync(query: str, k: int) -> list[dict[str, Any]]:
    """Inner sync fetch — retried on any error."""
    exa = _get_exa()
    response = exa.search_and_contents(
        query,
        num_results=k,
        text={"max_characters": 900},
    )
    return [
        {
            "content": (r.text or r.title or "").strip(),
            "url": r.url or "",
        }
        for r in (response.results or [])
        if r.text or r.title
    ]


async def exa_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """
    Neural semantic search via Exa. Results cached 10 min.
    Returns [] silently if EXA_API_KEY is not set.
    """
    if not EXA_KEY:
        return []

    cache_key = search_cache.make_key("exa", query, str(k))
    if cached := search_cache.get(cache_key):
        return cached  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, lambda: _exa_fetch_sync(query, k))
    search_cache.set(cache_key, results)
    return results

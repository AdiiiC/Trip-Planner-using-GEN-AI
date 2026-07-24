"""
Unified search helpers.

- serper_search()  →  Google results via Serper.dev
                      Best for: prices, booking availability, official visa pages
- exa_search()     →  Neural semantic search via Exa
                      Best for: rich destination content, restaurant guides, attraction info

Both return list[dict] with 'content' and 'url' keys —
drop-in compatible with the old TavilySearchResults shape.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

SERPER_KEY = os.getenv("SERPER_API_KEY", "")
EXA_KEY    = os.getenv("EXA_API_KEY", "")

# Module-level singleton — created once, reused across requests (no per-call overhead)
_exa_client: object | None = None

def _get_exa():
    global _exa_client
    if _exa_client is None:
        from exa_py import Exa
        _exa_client = Exa(api_key=EXA_KEY)
    return _exa_client


async def serper_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """
    Google search via Serper.dev.
    Returns up to k results as [{"content": str, "url": str}].
    Returns [] silently if SERPER_API_KEY is not set.
    """
    if not SERPER_KEY:
        return []

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

    # Google's rich answer box at the top
    if ab := data.get("answerBox"):
        snippet = ab.get("answer") or ab.get("snippet") or ""
        if snippet:
            results.append({"content": snippet, "url": ab.get("link", "")})

    # Organic results
    for item in data.get("organic", [])[:k]:
        content = item.get("snippet", "")
        # Append any sitelink snippets for richer context
        for sl in (item.get("sitelinks") or [])[:3]:
            if sl.get("snippet"):
                content += " " + sl["snippet"]
        results.append({"content": content.strip(), "url": item.get("link", "")})

    return results[:k]


async def exa_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """
    Neural semantic search via Exa (exa.ai).
    Returns up to k results as [{"content": str, "url": str}].
    Returns [] silently if EXA_API_KEY is not set.
    """
    if not EXA_KEY:
        return []

    from exa_py import Exa  # noqa: F401 — type hint only
    exa = _get_exa()

    # exa_py is sync; run in thread pool to avoid blocking the event loop
    loop = asyncio.get_running_loop()  # get_event_loop() is deprecated in 3.10+
    response = await loop.run_in_executor(
        None,
        lambda: exa.search_and_contents(
            query,
            num_results=k,
            text={"max_characters": 900},
        ),
    )

    return [
        {
            "content": (r.text or r.title or "").strip(),
            "url": r.url or "",
        }
        for r in (response.results or [])
        if r.text or r.title
    ]

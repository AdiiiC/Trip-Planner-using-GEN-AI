"""
Attraction entry-fee lookup.

Given an attraction name (and optional city), searches for its entry fee
and returns a structured price with currency and amount, ready to paste
into the Budget Calculator's Sightseeing section.
"""
from __future__ import annotations

import json
import re

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback


class AttractionPriceInput(BaseModel):
    attraction: str = Field(..., min_length=1, max_length=200)
    city: str = Field(default="", max_length=100)


_SCHEMA = """{
  "name": "Full official name of the attraction",
  "free": false,
  "entry_cost_str": "e.g. 40,000 VND / ₹500 / Free",
  "amount": 0,
  "currency": "USD",
  "notes": "any caveats (e.g. free for children under 5)"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel pricing expert. Extract the entry fee for an attraction "
     "and return ONLY valid JSON — no markdown fences. Schema:\n"
     + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "• amount is a plain number in the currency given (e.g. 40000 for 40,000 VND).\n"
     "• currency: 3-letter ISO code (VND, MYR, THB, USD, INR, SGD, IDR, AED, EUR, GBP…).\n"
     "• If the attraction is free, set free=true, amount=0.\n"
     "• If unsure of exact price, give a realistic typical range mid-point.\n"
     "• Use the search data provided; fall back to your training knowledge if absent."),
    ("human",
     "Attraction: {attraction}\n"
     "City: {city}\n\n"
     "Search data:\n{search_text}\n\n"
     "Return only the JSON object."),
])


async def get_attraction_price(inp: AttractionPriceInput) -> dict:
    search_text = ""

    try:
        from agents.cache import search_cache
        cache_key = search_cache.make_key("attr-price", inp.attraction.lower(), inp.city.lower())
        cached = search_cache.get(cache_key)
        if cached:
            return cached
    except Exception:
        cache_key = None
        search_cache = None

    try:
        from agents.search import serper_search
        loc = f"{inp.city} " if inp.city else ""
        results = await serper_search(
            f"{loc}{inp.attraction} entry fee ticket price 2025",
            k=4,
        )
        search_text = "\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:3000]
    except Exception:
        search_text = "No search results available — use training knowledge."

    msgs = _prompt.format_messages(
        attraction=inp.attraction,
        city=inp.city or "unknown",
        search_text=search_text,
    )
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.0)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group()) if m else {
            "name": inp.attraction, "free": False, "amount": 0, "currency": "USD",
            "entry_cost_str": "Unknown", "notes": "Could not retrieve price."
        }

    try:
        if cache_key and search_cache:
            search_cache.set(cache_key, data)
    except Exception:
        pass

    return data

"""
Hotel price finder — Booking.com / MakeMyTrip via Tavily web search.
"""
from __future__ import annotations

import json

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from agents.llm import get_llm


class HotelSearchInput(BaseModel):
    city:        str = Field(..., min_length=1, max_length=100)
    check_in:    str = Field(..., max_length=10)
    check_out:   str = Field(..., max_length=10)
    guests:      int = Field(default=1, ge=1, le=20)
    rooms:       int = Field(default=1, ge=1, le=10)
    budget_tier: str = Field(default="any", max_length=20)


_SCHEMA = """{
  "city": "string",
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "nights": 0,
  "guests": 0,
  "results": [
    {
      "name": "string",
      "stars": 3,
      "area": "district / neighbourhood",
      "price_per_night_inr": 0,
      "total_inr": 0,
      "rating": "8.5 / 10",
      "highlights": ["free breakfast", "pool"],
      "source": "Booking.com",
      "url": "string or null"
    }
  ],
  "cheapest_per_night_inr": 0,
  "note": "Prices are indicative; verify on booking sites"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a hotel-price extraction agent. Parse web search data and return ONLY valid JSON — "
     "no markdown fences. Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules: rank cheapest first, compute total_inr = price_per_night_inr × nights. "
     "If exact prices unavailable, use realistic estimates for the city and budget tier."),
    ("human",
     "City: {city}\n"
     "Dates: {check_in} → {check_out} ({nights} night(s))\n"
     "Guests: {guests}, Rooms: {rooms}\n"
     "Budget tier: {budget_tier}\n\n"
     "Search data:\n{text}\n\n"
     "Return only the JSON object."),
])


async def search_hotels(inp: HotelSearchInput) -> dict:
    from datetime import date as dt
    try:
        nights = (dt.fromisoformat(inp.check_out) - dt.fromisoformat(inp.check_in)).days
    except ValueError:
        nights = 1

    raw_text = ""
    sources: list[str] = []

    try:
        from agents.search import serper_search

        tier_kw = "" if inp.budget_tier == "any" else inp.budget_tier
        q = (
            f"{tier_kw} hotel {inp.city} {inp.check_in} to {inp.check_out} "
            f"{inp.guests} guest price INR per night "
            f"site:booking.com OR site:agoda.com OR site:makemytrip.com"
        )
        results = await serper_search(q, k=5)

        raw_text = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:4000]
        sources = [r.get("url", "") for r in results if isinstance(r, dict) and r.get("url")][:5]

    except Exception:
        raw_text = "Use your trained knowledge of typical hotel prices in this city."

    llm = get_llm(temperature=0.1, json_mode=True)
    response = llm.invoke(
        _prompt.format_messages(
            city=inp.city,
            check_in=inp.check_in,
            check_out=inp.check_out,
            nights=nights,
            guests=inp.guests,
            rooms=inp.rooms,
            budget_tier=inp.budget_tier,
            text=raw_text,
        )
    )

    # JSON mode guarantees valid JSON — no regex fallback needed
    try:
        data = json.loads(response.content)
    except (json.JSONDecodeError, AttributeError):
        data = {"results": [], "note": "Could not parse hotel data."}

    data["sources"] = sources
    return data

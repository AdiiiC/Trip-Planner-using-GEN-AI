"""
Hotel price finder — Booking.com / MakeMyTrip via Tavily web search.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


class HotelSearchInput(BaseModel):
    city: str
    check_in: str   # "YYYY-MM-DD"
    check_out: str  # "YYYY-MM-DD"
    guests: int = 1
    rooms: int = 1
    budget_tier: str = "any"   # "budget" / "mid-range" / "luxury" / "any"


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
        from langchain_community.tools.tavily_search import TavilySearchResults

        search = TavilySearchResults(
            max_results=5,
            include_domains=["booking.com", "makemytrip.com", "hotels.com", "agoda.com"],
        )
        tier_kw = "" if inp.budget_tier == "any" else inp.budget_tier
        q = (
            f"{tier_kw} hotel {inp.city} {inp.check_in} to {inp.check_out} "
            f"{inp.guests} guest price INR per night"
        )
        results = await search.ainvoke(q)

        raw_text = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:4000]
        sources = [r.get("url", "") for r in results if isinstance(r, dict) and r.get("url")][:5]

    except Exception:
        raw_text = "Use your trained knowledge of typical hotel prices in this city."

    llm = ChatGroq(temperature=0.1, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60)
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

    raw = re.sub(r"```[a-z]*\n?", "", response.content.strip()).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        try:
            data = json.loads(m.group()) if m else {}
        except Exception:
            data = {"results": [], "note": "Could not parse hotel data."}

    data["sources"] = sources
    return data

"""
Flight price tracker — targets Skyscanner.co.in via Tavily web search.
Filters: one-way · check-in baggage included.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


class FlightSearchInput(BaseModel):
    origin: str        # "Bengaluru" / "BLR"
    destination: str   # "Ho Chi Minh City" / "SGN"
    date: str          # "YYYY-MM-DD"
    passengers: int = 1


_SCHEMA = """{
  "route": "Origin → Destination",
  "date": "YYYY-MM-DD",
  "type": "one-way",
  "baggage_filter": "check-in baggage included",
  "results": [
    {
      "airline": "string",
      "flight_number": "string or null",
      "departure": "HH:MM or null",
      "arrival": "HH:MM or null",
      "duration": "e.g. 3h 20m or null",
      "stops": "Direct / 1 stop",
      "price_inr": 0,
      "is_estimate": true,
      "baggage": "check-in included / hand baggage only",
      "source": "Skyscanner"
    }
  ],
  "cheapest_inr": 0,
  "note": "Prices are indicative estimates from web search; verify live on skyscanner.co.in"
}"""

_structuring_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a flight-price extraction agent. Parse search data and return ONLY valid JSON — "
     "no markdown fences, no commentary. Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "• Return EXACTLY 3 results: cheapest, a mid-range option, and a premium option — all with check-in baggage.\n"
     "• Order results cheapest first (lowest price_inr first).\n"
     "• Set is_estimate=true on ALL results — prices come from web search, not a live booking API.\n"
     "• departure/arrival/duration: include if clearly stated in search data; set null if not found.\n"
     "• If fewer than 3 distinct fares found in search data, use your knowledge of airlines\n"
     "  on this route to fill remaining slots with realistic price ranges (is_estimate=true).\n"
     "• Only include fares that include check-in baggage.\n"
     "• flight_number may be null if not found."),
    ("human",
     "Search params:\n"
     "  Route: {origin} → {destination}\n"
     "  Date: {date}\n"
     "  Passengers: {passengers}\n"
     "  Type: one-way\n"
     "  Baggage filter: check-in baggage included\n\n"
     "Web search data from Skyscanner.co.in:\n{text}\n\n"
     "Return only the JSON object."),
])


async def search_flights(inp: FlightSearchInput) -> dict:
    raw_text = ""
    sources: list[str] = []

    try:
        from agents.search import serper_search

        # Primary: Skyscanner-targeted Google search
        q1 = (
            f"site:skyscanner.co.in OR site:skyscanner.net "
            f"one way flight {inp.origin} to {inp.destination} "
            f"{inp.date} {inp.passengers} passenger check-in baggage price INR"
        )
        r1 = await serper_search(q1, k=5)

        # Supplementary: broader Google search for more fare data
        q2 = (
            f"{inp.origin} to {inp.destination} one way flight {inp.date} "
            f"check-in baggage included cheapest fare INR"
        )
        r2 = await serper_search(q2, k=4)

        all_results = r1 + r2
        raw_text = "\n\n".join(
            r.get("content", "") for r in all_results if isinstance(r, dict)
        )[:4500]
        sources = [
            r.get("url", "")
            for r in all_results
            if isinstance(r, dict) and r.get("url")
        ][:6]

    except Exception:
        raw_text = (
            "Search unavailable. "
            "Use your trained knowledge of typical flight prices for this route."
        )

    llm = ChatGroq(temperature=0.1, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60)
    response = llm.invoke(
        _structuring_prompt.format_messages(
            origin=inp.origin,
            destination=inp.destination,
            date=inp.date,
            passengers=inp.passengers,
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
            data = {"results": [], "note": "Could not parse flight data."}

    data["sources"] = sources
    return data

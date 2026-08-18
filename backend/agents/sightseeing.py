from __future__ import annotations

import asyncio
import json
import re

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from agents.llm import get_llm
from agents.geospatial import geocode_attractions


class SightseeingInput(BaseModel):
    city:    str = Field(..., min_length=1, max_length=100)
    country: str = Field(default="", max_length=100)


async def explore_sightseeing(inp: SightseeingInput) -> dict:
    location = f"{inp.city}, {inp.country}".strip(", ")
    llm = get_llm(temperature=0.1, json_mode=True)

    # Try Tavily search first; fall back to LLM knowledge if unavailable
    attractions_text = ""
    nearby_text = ""
    sources: list[str] = []

    try:
        from agents.search import exa_search, serper_search

        # Three concurrent searches: Exa for rich content, Serper for live pricing
        att_results, nb_results, price_results = await asyncio.gather(
            exa_search(
                f"{location} top tourist attractions things to do guide",
                k=5,
            ),
            exa_search(
                f"best day trips near {location} within 2 hours worth visiting",
                k=4,
            ),
            serper_search(
                f"{location} tourist attractions entry fee ticket price 2025 site:tripadvisor.com OR site:getyourguide.com OR site:lonelyplanet.com OR site:timeout.com",
                k=6,
            ),
        )

        attractions_text = "\n".join(
            r.get("content", "") for r in att_results if isinstance(r, dict)
        )
        # Merge Serper pricing data into attractions text
        pricing_text = "\n".join(
            r.get("content", "") for r in price_results if isinstance(r, dict)
        )
        attractions_text = f"{attractions_text}\n\n--- ENTRY FEE DATA ---\n{pricing_text}"

        nearby_text = "\n".join(
            r.get("content", "") for r in nb_results if isinstance(r, dict)
        )
        sources = [
            r.get("url", "")
            for r in (att_results + nb_results + price_results)
            if isinstance(r, dict) and r.get("url")
        ][:6]

    except Exception:
        # Search unavailable – rely on LLM knowledge
        attractions_text = f"Use your trained knowledge about {location}."
        nearby_text = f"Use your trained knowledge about places near {location}."

    structuring_prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a travel data analyst. Extract structured tourist data and return ONLY valid JSON — "
         "no markdown fences, no extra text. Use this exact schema:\n"
         "{{\n"
         '  "attractions": [\n'
         "    {{\n"
         '      "name": "string",\n'
         '      "description": "1–2 sentences",\n'
         '      "category": "heritage|nature|food|adventure|culture|beach|museum|theme-park|religious",\n'
         '      "entry_cost": "Free / e.g. 150,000 VND / ₹500",\n'
         '      "entry_cost_usd": 0.0,\n'
         '      "time_needed": "e.g. 1–2 hours",\n'
         '      "location": "district or area",\n'
         '      "tips": "one practical tip"\n'
         "    }}\n"
         "  ],\n"
         '  "nearby_places": [\n'
         "    {{\n"
         '      "name": "string",\n'
         '      "distance_km": "e.g. 30 km",\n'
         '      "travel_time": "e.g. 45 minutes",\n'
         '      "highlights": "2–3 highlights",\n'
         '      "entry_cost": "Free / price",\n'
         '      "how_to_get": "bus / taxi / train"\n'
         "    }}\n"
         "  ]\n"
         "}}\n"
         "Include 8–12 main attractions and 4–6 nearby places.\n"
         "For entry_cost: use prices from the search data above. If not in search data, "
         "use your trained knowledge — never write 'Check locally'. "
         "Always provide a specific price or 'Free'. "
         "For entry_cost_usd: convert to approximate USD (use 0.0 only if genuinely free).\n"
         "For nearby_places entry_cost: same rule — use knowledge if not in data, never 'Check locally'."),
        ("human",
         "City: {city}\n\n"
         "Attractions search data:\n{att}\n\n"
         "Nearby places search data:\n{nb}\n\n"
         "Return only the JSON object."),
    ])

    response = llm.invoke(
        structuring_prompt.format_messages(
            city=location,
            att=attractions_text[:5000],
            nb=nearby_text[:2500],
        )
    )

    # JSON mode guarantees valid JSON — regex fallback kept as safety net
    raw = response.content.strip()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, AttributeError):
        data = {}

    attractions = await geocode_attractions(location, data.get("attractions", []))
    return {
        "city": location,
        "attractions": attractions,
        "nearby_places": data.get("nearby_places", []),
        "sources": sources,
    }

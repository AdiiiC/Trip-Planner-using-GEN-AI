"""
Cash-on-hand predictor — per-city, driven by free-text spending descriptions.

For each city the user describes spending plans in plain English.
We concurrently fetch REAL attraction entry fees from the sightseeing agent
so the LLM can use actual prices instead of guessing them.
"""
from __future__ import annotations

import asyncio
import json
import re

from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback
from langchain_core.prompts import ChatPromptTemplate


class CityEntry(BaseModel):
    city:  str = Field(..., min_length=1, max_length=100)
    days:  int = Field(default=2, ge=1, le=180)
    notes: str = Field(default="", max_length=1000)


class CashPredictInput(BaseModel):
    cities:       list[CityEntry] = Field(..., min_length=1, max_length=15)
    travelers:    int   = Field(default=1, ge=1, le=50)
    travel_style: str   = Field(default="balanced", max_length=40)
    prepaid_usd:  float = Field(default=0.0, ge=0, le=1_000_000)


# ── Real entry-fee lookup ─────────────────────────────────────────────────────

async def _sightseeing_context(city_raw: str) -> str:
    """
    Fetch real attraction entry fees for a city from the sightseeing agent.
    Returns a compact text block the LLM can use as ground truth.
    Cached for 30 min; gracefully returns "" on any failure/timeout.
    """
    try:
        from agents.cache import search_cache
        from agents.sightseeing import SightseeingInput, explore_sightseeing

        # Parse "Da Nang, Vietnam" → city="Da Nang", country="Vietnam"
        parts = [p.strip() for p in city_raw.split(",", 1)]
        city_name = parts[0]
        country   = parts[1] if len(parts) > 1 else ""

        cache_key = search_cache.make_key("cash-sight", city_name.lower())
        cached = search_cache.get(cache_key)
        if cached:
            return cached

        result = await asyncio.wait_for(
            explore_sightseeing(SightseeingInput(city=city_name, country=country)),
            timeout=15.0,
        )

        lines = []
        for att in result.get("attractions", [])[:20]:
            name = att.get("name", "")
            cost = att.get("entry_cost", "")
            if name and cost and cost.lower() not in ("", "check locally", "none"):
                lines.append(f"  • {name}: {cost}")

        text = "\n".join(lines)
        if text:
            search_cache.set(cache_key, text)  # 30-min TTL from cache config
        return text

    except Exception:
        return ""   # fail silently — LLM falls back to its own knowledge


# ── Prompt ────────────────────────────────────────────────────────────────────

_SCHEMA = """{
  "cities": [
    {
      "city": "Da Nang",
      "days": 3,
      "interpretation": "1-2 sentences summarising how you read the spending notes",
      "recommended_usd": 0,
      "range_low_usd": 0,
      "range_high_usd": 0,
      "per_day_usd": 0,
      "cost_level": "low",
      "cash_tip": "one cash-specific practical tip for this city",
      "breakdown": [
        {"category": "Food & drink",         "usd": 0, "reasoning": "derived from notes"},
        {"category": "Local transport",      "usd": 0, "reasoning": "derived from notes"},
        {"category": "Attractions & entry",  "usd": 0, "reasoning": "actual fees from sightseeing data where matched"},
        {"category": "Nightlife & drinks",   "usd": 0, "reasoning": "derived from notes"},
        {"category": "Shopping & souvenirs", "usd": 0, "reasoning": "derived from notes"},
        {"category": "Tips & misc",          "usd": 0, "reasoning": "small rounding buffer"},
        {"category": "Emergency buffer",     "usd": 0, "reasoning": "10-15% safety buffer"}
      ]
    }
  ],
  "total_recommended_usd": 0,
  "total_range_low_usd": 0,
  "total_range_high_usd": 0,
  "card_vs_cash": "1-2 sentences on card acceptance across the whole trip",
  "tips": ["practical cash tip 1", "practical cash tip 2"],
  "summary": "2-3 sentence overall recommendation"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel budgeting expert. Return ONLY valid JSON — no markdown fences.\n"
     "Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "• Read the spending notes carefully and reflect them in the amounts:\n"
     "  - 'street food only' → low food cost\n"
     "  - 'split Grab/taxi with N people' → divide transport by N\n"
     "  - 'some nightlife' → realistic bar/drinks budget\n"
     "  - 'no shopping' → $0 or near-zero shopping\n"
     "  - specific attractions listed → use ENTRY FEE DATA provided; if not found there, use LLM knowledge\n"
     "• For Attractions & entry: sum the actual fees for each place the user mentions. "
     "  Match by name (fuzzy OK). If a place has no known fee, mark it free.\n"
     "• interpretation: 1-2 sentences on what you understood from the notes.\n"
     "• reasoning per category: brief note on how notes/data informed the amount.\n"
     "• All USD amounts = TOTALS for ALL travellers combined.\n"
     "• recommended_usd per city = sum of its breakdown items.\n"
     "• total_recommended_usd = sum of all cities.\n"
     "• cost_level: 'low' | 'medium' | 'high' relative to global average.\n"
     "• EXCLUDE prepaid costs — only day-to-day cash spending."),
    ("human", "{cities_text}\n\nReturn only the JSON object."),
])


# ── Main function ─────────────────────────────────────────────────────────────

async def predict_cash(inp: CashPredictInput) -> dict:
    # Fetch real attraction entry fees for all cities concurrently
    sight_contexts = await asyncio.gather(
        *[_sightseeing_context(c.city) for c in inp.cities],
        return_exceptions=True,
    )

    # Build the combined prompt text
    blocks = [
        f"Global: {inp.travelers} traveller(s) · {inp.travel_style} style · "
        f"${inp.prepaid_usd:.0f} prepaid (exclude)\n"
    ]

    for c, ctx in zip(inp.cities, sight_contexts):
        block = [f"── {c.city} ({c.days} day{'s' if c.days != 1 else ''}) ──"]
        block.append(
            f"Spending notes: \"{c.notes.strip()}\"" if c.notes.strip()
            else "Spending notes: (none — use balanced defaults)"
        )
        if isinstance(ctx, str) and ctx.strip():
            block.append(f"Real entry-fee data for this city (use these prices for any matched attractions):\n{ctx}")
        else:
            block.append("Real entry-fee data: (unavailable — use best knowledge)")
        blocks.append("\n".join(block))

    cities_text = "\n\n".join(blocks)

    msgs = _prompt.format_messages(cities_text=cities_text)
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.2)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(m.group()) if m else {
            "cities": [], "total_recommended_usd": 0, "summary": "Could not estimate."
        }

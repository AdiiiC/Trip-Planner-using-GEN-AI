"""
Cash-on-hand predictor — per-city breakdown with adjustable categories.
Returns structured JSON with one entry per city so the frontend can
show sliders per city and recalculate totals interactively.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback
from langchain_core.prompts import ChatPromptTemplate


class CityEntry(BaseModel):
    city: str = Field(..., min_length=1, max_length=100)
    days: int = Field(default=2, ge=1, le=180)


class CashPredictInput(BaseModel):
    cities:       list[CityEntry] = Field(..., min_length=1, max_length=15)
    travelers:    int   = Field(default=1, ge=1, le=50)
    travel_style: str   = Field(default="balanced", max_length=40)
    prepaid_usd:  float = Field(default=0.0, ge=0, le=1_000_000)


_SCHEMA = """{
  "cities": [
    {
      "city": "Da Nang",
      "days": 3,
      "recommended_usd": 0,
      "range_low_usd": 0,
      "range_high_usd": 0,
      "per_day_usd": 0,
      "cost_level": "low",
      "cash_tip": "Vietnam is mostly cash — always carry small bills",
      "breakdown": [
        {"category": "Food & drink",         "usd": 0, "note": "street food + local restaurants"},
        {"category": "Local transport",      "usd": 0, "note": "grab, taxis, motorbike"},
        {"category": "Attractions & entry",  "usd": 0, "note": "tickets, guided tours"},
        {"category": "Shopping & souvenirs", "usd": 0, "note": "markets, gifts"},
        {"category": "Tips & misc",          "usd": 0, "note": "tipping, tips, incidentals"},
        {"category": "Emergency buffer",     "usd": 0, "note": "10-15% buffer"}
      ]
    }
  ],
  "total_recommended_usd": 0,
  "total_range_low_usd": 0,
  "total_range_high_usd": 0,
  "card_vs_cash": "1-2 sentences on card acceptance across the itinerary",
  "tips": ["practical tip 1", "practical tip 2"],
  "summary": "2-3 sentence overall recommendation"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel budgeting expert. Return ONLY valid JSON — no markdown fences. "
     "Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "• Return one entry per city in the cities array.\n"
     "• Base estimates on the actual cost of living in each city.\n"
     "• EXCLUDE prepaid costs — only day-to-day physical cash spending.\n"
     "• recommended_usd for each city = sum of its breakdown items.\n"
     "• total_recommended_usd = sum of all city recommended_usd values.\n"
     "• Include a 10-15% emergency buffer in each city's breakdown.\n"
     "• cost_level: 'low' | 'medium' | 'high' (relative to global average).\n"
     "• cash_tip: one sentence specific to that city's cash norms.\n"
     "• All USD amounts are TOTALS for ALL travellers combined."),
    ("human",
     "Cities:\n{cities_text}\n"
     "Travellers: {travelers}\n"
     "Travel style: {travel_style}\n"
     "Already prepaid (exclude): ${prepaid_usd} USD\n\n"
     "Return only the JSON object."),
])


async def predict_cash(inp: CashPredictInput) -> dict:
    cities_text = "\n".join(
        f"  - {c.city} ({c.days} day{'s' if c.days != 1 else ''})"
        for c in inp.cities
    )
    msgs = _prompt.format_messages(
        cities_text=cities_text,
        travelers=inp.travelers,
        travel_style=inp.travel_style,
        prepaid_usd=round(inp.prepaid_usd, 2),
    )
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.2)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(m.group()) if m else {
            "cities": [], "total_recommended_usd": 0, "summary": "Could not estimate."
        }

"""
Cash-on-hand predictor — estimates how much physical cash (in USD) a traveller
should carry for a trip, based on destinations, duration, travel style, and
what's already prepaid. LLM-powered, returns structured JSON.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback
from langchain_core.prompts import ChatPromptTemplate


class CashPredictInput(BaseModel):
    destinations:  list[str] = Field(..., min_length=1, max_length=15)
    duration_days: int   = Field(..., ge=1, le=365)
    travelers:     int   = Field(default=1, ge=1, le=50)
    travel_style:  str   = Field(default="balanced", max_length=40)
    prepaid_usd:   float = Field(default=0.0, ge=0, le=1_000_000)   # flights/stays already booked
    daily_budget_hint_usd: float = Field(default=0.0, ge=0, le=100_000)  # optional user hint


_SCHEMA = """{
  "recommended_cash_usd": 0,
  "range_low_usd": 0,
  "range_high_usd": 0,
  "per_person_usd": 0,
  "per_day_usd": 0,
  "breakdown": [
    {"category": "Food & drink", "usd": 0, "note": "short reason"},
    {"category": "Local transport", "usd": 0, "note": "short reason"},
    {"category": "Attractions & tickets", "usd": 0, "note": "short reason"},
    {"category": "Shopping & souvenirs", "usd": 0, "note": "short reason"},
    {"category": "Tips & misc", "usd": 0, "note": "short reason"},
    {"category": "Emergency buffer", "usd": 0, "note": "short reason"}
  ],
  "card_vs_cash": "1-2 sentences on how card-friendly the destinations are",
  "tips": ["practical cash tip", "practical cash tip"],
  "summary": "2-3 sentence recommendation"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a seasoned travel budgeting expert. Estimate how much PHYSICAL CASH "
     "(in USD) a traveller should carry in hand for a trip. Return ONLY valid JSON — "
     "no markdown fences. Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "- Base estimates on real cost-of-living for the destinations given.\n"
     "- EXCLUDE prepaid costs (flights/hotels already booked) — only day-to-day cash spend.\n"
     "- recommended_cash_usd is the TOTAL for all travellers combined.\n"
     "- Provide a sensible low/high range (roughly ±20%).\n"
     "- Consider how card-friendly each destination is (cash-heavy places need more).\n"
     "- Include a 10-15% emergency buffer.\n"
     "- breakdown values are TOTALS for the whole trip (all travellers), summing to recommended_cash_usd.\n"
     "- Keep notes short and practical."),
    ("human",
     "Destinations: {destinations}\n"
     "Duration: {duration_days} days\n"
     "Travellers: {travelers}\n"
     "Travel style: {travel_style}\n"
     "Already prepaid (exclude): ${prepaid_usd} USD\n"
     "User daily-budget hint (0 = none): ${daily_hint} USD\n\n"
     "Return only the JSON object."),
])


async def predict_cash(inp: CashPredictInput) -> dict:
    msgs = _prompt.format_messages(
        destinations=", ".join(inp.destinations),
        duration_days=inp.duration_days,
        travelers=inp.travelers,
        travel_style=inp.travel_style,
        prepaid_usd=round(inp.prepaid_usd, 2),
        daily_hint=round(inp.daily_budget_hint_usd, 2),
    )
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.2)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(m.group()) if m else {
            "recommended_cash_usd": 0, "breakdown": [], "summary": "Could not estimate."
        }

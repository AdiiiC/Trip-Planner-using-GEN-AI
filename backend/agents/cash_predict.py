"""
Cash-on-hand predictor — per-city, driven by free-text spending descriptions.

The user writes a few sentences per city describing how they plan to spend
(e.g. "only street food, splitting Grab rides, visiting 3 temples, some nightlife").
The LLM reads those notes, derives realistic spend amounts for each category,
and returns a per-city breakdown with its interpretation of the notes.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback
from langchain_core.prompts import ChatPromptTemplate


class CityEntry(BaseModel):
    city:  str = Field(..., min_length=1, max_length=100)
    days:  int = Field(default=2, ge=1, le=180)
    notes: str = Field(default="", max_length=1000)   # free-text spending description


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
      "interpretation": "1-2 sentences summarising how you read the traveller's notes",
      "recommended_usd": 0,
      "range_low_usd": 0,
      "range_high_usd": 0,
      "per_day_usd": 0,
      "cost_level": "low",
      "cash_tip": "one cash-specific practical tip for this city",
      "breakdown": [
        {"category": "Food & drink",         "usd": 0, "reasoning": "derived from notes"},
        {"category": "Local transport",      "usd": 0, "reasoning": "derived from notes"},
        {"category": "Attractions & entry",  "usd": 0, "reasoning": "derived from notes"},
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
     "You are a travel budgeting expert who reads travellers' plain-English spending "
     "plans and converts them into accurate per-city cash estimates. "
     "Return ONLY valid JSON — no markdown fences.\nSchema:\n"
     + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "• Read the spending notes carefully and reflect them in the amounts.\n"
     "  - 'street food only' → low food cost\n"
     "  - 'split Grab/taxi with N people' → divide transport accordingly\n"
     "  - 'some nightlife' → add a realistic nightlife entry\n"
     "  - 'no shopping' → $0 or minimal shopping\n"
     "  - specific attractions listed → price each entry fee, sum them\n"
     "• interpretation: summarise what you understood from the notes in 1-2 sentences.\n"
     "• reasoning per category: a very short note on how the notes informed the amount.\n"
     "• All USD amounts are TOTALS for ALL travellers combined (not per person).\n"
     "• Include a 10-15% emergency buffer as a separate breakdown line.\n"
     "• recommended_usd per city = sum of its breakdown items.\n"
     "• total_recommended_usd = sum of all city recommended_usd values.\n"
     "• cost_level: 'low' | 'medium' | 'high' relative to global average.\n"
     "• EXCLUDE prepaid costs — only day-to-day spending cash."),
    ("human",
     "Travellers: {travelers}  |  Travel style: {travel_style}  |  "
     "Prepaid (exclude): ${prepaid_usd} USD\n\n"
     "Cities:\n{cities_text}\n\n"
     "Return only the JSON object."),
])


async def predict_cash(inp: CashPredictInput) -> dict:
    lines = []
    for c in inp.cities:
        lines.append(f"• {c.city} ({c.days} day{'s' if c.days != 1 else ''})")
        if c.notes.strip():
            lines.append(f"  Spending plans: \"{c.notes.strip()}\"")
        else:
            lines.append("  Spending plans: (not specified — use balanced defaults)")

    msgs = _prompt.format_messages(
        travelers=inp.travelers,
        travel_style=inp.travel_style,
        prepaid_usd=round(inp.prepaid_usd, 2),
        cities_text="\n".join(lines),
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

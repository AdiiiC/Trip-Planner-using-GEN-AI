"""
Extract structured cost line-items from a generated itinerary (Markdown).
Connects the Planner to the Budget Calculator (itinerary -> budget autofill).
"""
from __future__ import annotations

import json
import re

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback


class ExtractCostsInput(BaseModel):
    itinerary: str = Field(..., min_length=10, max_length=40_000)
    currency: str = Field(default="USD", max_length=3)


_SCHEMA = """{
  "items": [
    {"name": "string", "category": "flight|stay|sightseeing|food|transport|extra", "amount": 0, "currency": "USD"}
  ],
  "total_estimate": 0,
  "currency": "USD"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You extract cost line-items from a travel itinerary and return ONLY valid JSON — "
     "no markdown fences. Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "- Parse every cost mentioned (activities, meals, transport, tickets).\n"
     "- Categorise each into flight/stay/sightseeing/food/transport/extra.\n"
     "- Use the numeric amount and its currency as written.\n"
     "- total_estimate = sum of all items in {currency}.\n"
     "- If no costs found, return empty items array."),
    ("human", "Currency preference: {currency}\n\nItinerary:\n{itinerary}\n\nReturn only JSON."),
])


async def extract_costs(inp: ExtractCostsInput) -> dict:
    msgs = _prompt.format_messages(itinerary=inp.itinerary[:20_000], currency=inp.currency)
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.0)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group()) if m else {"items": [], "total_estimate": 0, "currency": inp.currency}
    return data

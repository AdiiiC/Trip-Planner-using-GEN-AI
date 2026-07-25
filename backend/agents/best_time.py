"""
Best-time-to-visit — LLM-powered seasonal guide returning a month-by-month
score plus a concise recommendation. Cached via the shared search_cache.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from agents.llm import ainvoke_with_fallback
from langchain_core.prompts import ChatPromptTemplate


class BestTimeInput(BaseModel):
    destination: str = Field(..., min_length=1, max_length=100)


_SCHEMA = """{
  "destination": "string",
  "months": [
    {"month": "January", "score": 0, "weather": "short summary", "crowds": "low|medium|high", "note": "one line"}
  ],
  "best_months": ["Month", "Month"],
  "avoid_months": ["Month"],
  "summary": "2-3 sentence recommendation"
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel seasonality expert. Return ONLY valid JSON — no markdown fences. "
     "Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Rules:\n"
     "- Provide all 12 months.\n"
     "- score is 0-100 (100 = ideal time to visit), based on weather + crowds + value.\n"
     "- best_months = top 2-4 months; avoid_months = worst 1-3 months."),
    ("human", "Destination: {destination}\n\nReturn only JSON."),
])


async def best_time_to_visit(inp: BestTimeInput) -> dict:
    msgs = _prompt.format_messages(destination=inp.destination)
    resp = await ainvoke_with_fallback(msgs, json_mode=True, temperature=0.1)
    raw = re.sub(r"```[a-z]*\n?", "", resp.content.strip()).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(m.group()) if m else {"destination": inp.destination, "months": [], "summary": ""}

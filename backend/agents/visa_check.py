"""
Visa cost checker for Indian passport holders.

Visa types (for Indian citizens travelling abroad):
  visa_free          – No visa / stamp required (e.g., Nepal, Bhutan)
  arrival_card       – Free entry but must complete a digital arrival card (e.g., Thailand TDAC)
  evisa              – Electronic visa, paid, applied online before travel (e.g., Vietnam, Turkey)
  voa                – Visa on Arrival at the airport/port, paid there (e.g., Maldives, Indonesia)
  evisa_or_voa       – Either evisa or VOA available (e.g., Cambodia, Egypt)
  consulate          – Must apply at embassy/consulate before travel (e.g., USA, UK, Schengen)
  unknown            – Couldn't determine; verify manually
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


class VisaCheckInput(BaseModel):
    country:              str = Field(..., min_length=1, max_length=100)
    passport_nationality: str = Field(default="Indian", max_length=50)


_SCHEMA = r"""{
  "country": "string",
  "passport_nationality": "Indian",
  "visa_type": "visa_free | arrival_card | evisa | voa | evisa_or_voa | consulate | unknown",
  "is_free": true,
  "cost_usd": 0.0,
  "cost_inr_approx": 0,
  "processing_time": "e.g. Instant / 3-5 business days / 2-4 months",
  "validity": "e.g. 30 days / 90 days / 10 years",
  "max_stay_days": 0,
  "apply_url": "official URL or null",
  "required_documents": ["list of key documents"],
  "arrival_card_info": "e.g. Fill Thailand Digital Arrival Card online at least 3 days before arrival — or null",
  "step_by_step": ["ordered list of steps the traveller must follow"],
  "important_notes": "any critical conditions, restrictions or fees",
  "budget_line_item": "string shown in the budget e.g. Vietnam e-Visa — or empty if free",
  "verified_note": "Always verify current requirements with the official embassy or consulate before travel."
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel visa expert specialising in Indian passport holders. "
     "Return ONLY valid JSON (no markdown fences, no commentary) following this schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n\n"
     "Rules:\n"
     "• Answer ONLY for an Indian citizen (Indian passport) travelling TO the requested country.\n"
     "• is_free = true only when cost_usd is exactly 0.\n"
     "• cost_usd: total approximate cost in USD for one person to get the visa "
     "  (application fee + any service fees). Use 0 if genuinely free.\n"
     "• cost_inr_approx: cost_usd * 83 (rough INR estimate).\n"
     "• apply_url: the official government portal, not a third-party agent.\n"
     "• For Thailand: visa_type = 'arrival_card', is_free = true, "
     "  arrival_card_info must mention Thailand Digital Arrival Card (TDAC).\n"
     "• For Vietnam: visa_type = 'evisa', cost_usd = 25, "
     "  apply_url = 'https://evisa.xuatnhapcanh.gov.vn'.\n"
     "• For USA: visa_type = 'consulate', cost_usd = 185 (B1/B2 MRV fee).\n"
     "• For UK: visa_type = 'consulate', cost_usd ≈ 130.\n"
     "• For Schengen countries: visa_type = 'consulate', cost_usd ≈ 90.\n"
     "• If genuinely unsure, use visa_type = 'unknown'.\n"
     "• Use your trained knowledge first; if unsure, acknowledge in important_notes."),
    ("human",
     "Destination country: {country}\n"
     "Passport: {passport_nationality}\n\n"
     "Web search data (may be empty):\n{search_text}\n\n"
     "Return only the JSON object."),
])


async def check_visa(inp: VisaCheckInput) -> dict:
    search_text = ""
    sources: list[str] = []

    try:
        from agents.search import serper_search

        q = (
            f"Indian passport {inp.country} visa requirements 2025 "
            f"e-visa fee cost arrival card official"
        )
        results = await serper_search(q, k=4)
        search_text = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:3500]
        sources = [r.get("url", "") for r in results if isinstance(r, dict) and r.get("url")][:4]

    except Exception:
        search_text = "No search results — use your trained knowledge."

    llm = ChatGroq(temperature=0.1, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60,
                    model_kwargs={"response_format": {"type": "json_object"}})
    response = llm.invoke(
        _prompt.format_messages(
            country=inp.country,
            passport_nationality=inp.passport_nationality,
            search_text=search_text,
        )
    )

    # JSON mode guarantees valid JSON — no regex fallback needed
    try:
        data = json.loads(response.content)
    except (json.JSONDecodeError, AttributeError):
        data = {"visa_type": "unknown", "is_free": False, "cost_usd": 0}

    data["sources"] = sources
    return data

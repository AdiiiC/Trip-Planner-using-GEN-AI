"""
Travel insurance estimator — LLM-powered, streaming.
"""
from __future__ import annotations

from typing import AsyncIterator

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from agents.llm import get_llm


class InsuranceInput(BaseModel):
    destination:   str   = Field(..., min_length=1, max_length=200)
    trip_cost_usd: float = Field(..., ge=0, le=1_000_000)
    duration_days: int   = Field(..., ge=1, le=365)
    travelers:     int   = Field(default=1, ge=1, le=20)
    traveler_age:  int   = Field(default=30, ge=1, le=120)


_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a travel insurance specialist. Provide clear, actionable advice. "
     "Always include a disclaimer to compare actual policies from insurers."),
    ("human",
     "Estimate travel insurance for this trip:\n"
     "- Destination: {destination}\n"
     "- Trip cost: ${trip_cost_usd} USD total\n"
     "- Duration: {duration_days} day(s)\n"
     "- Travellers: {travelers} (avg age ~{traveler_age})\n\n"
     "Please provide in Markdown:\n"
     "1. **Recommended Coverage Types** — with why each is relevant for this destination\n"
     "2. **Estimated Premium Range** — per person and total (in USD and INR ≈)\n"
     "3. **Key Things to Check** — exclusions, pre-existing conditions, adventure sports\n"
     "4. **Top Providers to Compare** — (Indian + international options)\n"
     "5. **Claim Tips** — how to maximise a successful claim\n\n"
     "_Disclaimer: Estimates only. Always compare actual policies._"),
])


def _llm():
    return get_llm(temperature=0.3)


async def estimate_insurance(inp: InsuranceInput) -> AsyncIterator[str]:
    llm = _llm()
    msgs = _prompt.format_messages(
        destination=inp.destination,
        trip_cost_usd=inp.trip_cost_usd,
        duration_days=inp.duration_days,
        travelers=inp.travelers,
        traveler_age=inp.traveler_age,
    )
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text

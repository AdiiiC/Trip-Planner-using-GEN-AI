"""
Travel insurance estimator — LLM-powered, streaming.
"""
from __future__ import annotations

from typing import AsyncIterator

from pydantic import BaseModel
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


class InsuranceInput(BaseModel):
    destination: str
    trip_cost_usd: float
    duration_days: int
    travelers: int = 1
    traveler_age: int = 30


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


def _llm() -> ChatGroq:
    return ChatGroq(temperature=0.3, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60)


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

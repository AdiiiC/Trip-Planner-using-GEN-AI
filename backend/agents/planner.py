from __future__ import annotations

import os
from datetime import date
from typing import AsyncIterator

from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


SYSTEM_PROMPT = (
    "You are an expert travel concierge. You create detailed, realistic, time-blocked itineraries. "
    "Always respect the user's budget, travel style, dietary needs and number of days. "
    "For each activity include: time slot, place name, short description, estimated cost in "
    "local currency AND USD, and one practical tip. Group activities into walkable clusters "
    "to minimise transit. End every itinerary with a '## Logistics & Packing Tips' section."
)

_itinerary_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human",
     "Plan a {days}-day trip to **{city}**.\n"
     "- Travel date: {travel_date}\n"
     "- Interests: {interests}\n"
     "- Budget level: {budget}\n"
     "- Travel style: {travel_style}\n"
     "- Dietary preferences: {dietary}\n"
     "- Show costs in {currency} and local currency.\n\n"
     "Return the full itinerary in Markdown, one `## Day N – Theme` section per day."),
])

_refine_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human",
     "Current itinerary:\n\n{itinerary}\n\n"
     "User feedback: \"{feedback}\"\n\n"
     "Revise the itinerary addressing the feedback. Keep everything that already works. "
     "Return the complete updated Markdown itinerary."),
])

_packing_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a seasoned travel packing expert."),
    ("human",
     "Generate a concise, categorised packing checklist for a {days}-day trip to {city} "
     "in {month}. Travel style: {travel_style}. Activities: {interests}. "
     "Use Markdown checkboxes (- [ ] item). Group by: Clothing, Electronics, Documents, "
     "Health & Safety, Misc."),
])

_visa_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a travel visa expert. Provide accurate, up-to-date information."),
    ("human",
     "What are the visa requirements for an Indian passport holder travelling to {destination}? "
     "Include: visa type, cost, processing time, required documents, and any on-arrival options. "
     "Format as Markdown. Add a disclaimer to verify with the official embassy."),
])


def _llm() -> ChatGroq:
    return ChatGroq(temperature=0.3, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60)


class PlanInput(BaseModel):
    city:         str = Field(..., min_length=1, max_length=100)
    days:         int = Field(default=2, ge=1, le=14)
    interests:    list[str] = Field(default=[], max_length=30)
    budget:       str = Field(default="medium", pattern="^(low|medium|luxury)$")
    travel_style: str = Field(default="balanced", pattern="^(relaxed|balanced|adventurous|family-friendly)$")
    dietary:      str = Field(default="none", max_length=200)
    travel_date:  str = Field(default=str(date.today()), max_length=10)
    currency:     str = Field(default="USD", max_length=3)


class RefineInput(BaseModel):
    itinerary: str = Field(..., min_length=1, max_length=50_000)
    feedback:  str = Field(..., min_length=1, max_length=2_000)


class PackingInput(BaseModel):
    city:         str = Field(..., min_length=1, max_length=100)
    days:         int = Field(..., ge=1, le=14)
    travel_style: str = Field(default="balanced", max_length=50)
    interests:    list[str] = Field(default=[], max_length=30)
    travel_date:  str = Field(default=str(date.today()), max_length=10)


class VisaInput(BaseModel):
    destination: str = Field(..., min_length=1, max_length=100)


async def generate_itinerary(inp: PlanInput) -> AsyncIterator[str]:
    llm = _llm()
    msgs = _itinerary_prompt.format_messages(
        city=inp.city,
        days=inp.days,
        travel_date=inp.travel_date,
        interests=", ".join(inp.interests) if inp.interests else "general sightseeing",
        budget=inp.budget,
        travel_style=inp.travel_style,
        dietary=inp.dietary,
        currency=inp.currency,
    )
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text


async def refine_itinerary(inp: RefineInput) -> AsyncIterator[str]:
    llm = _llm()
    msgs = _refine_prompt.format_messages(itinerary=inp.itinerary, feedback=inp.feedback)
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text


async def generate_packing_list(inp: PackingInput) -> AsyncIterator[str]:
    llm = _llm()
    from datetime import datetime
    try:
        month = datetime.fromisoformat(inp.travel_date).strftime("%B")
    except ValueError:
        month = "the travel month"
    msgs = _packing_prompt.format_messages(
        city=inp.city,
        days=inp.days,
        month=month,
        travel_style=inp.travel_style,
        interests=", ".join(inp.interests) if inp.interests else "general sightseeing",
    )
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text


async def get_visa_info(inp: VisaInput) -> AsyncIterator[str]:
    llm = _llm()
    msgs = _visa_prompt.format_messages(destination=inp.destination)
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text


# ── Multi-city ────────────────────────────────────────────────────────────────

class CityStop(BaseModel):
    city:  str = Field(..., min_length=1, max_length=100)
    days:  int = Field(default=2, ge=1, le=14)
    date:  str = Field(default=str(date.today()), max_length=10)
    notes: str = Field(default="", max_length=500)


class MultiCityInput(BaseModel):
    stops:        list[CityStop] = Field(..., min_length=2, max_length=10)
    interests:    list[str] = Field(default=[], max_length=30)
    budget:       str = Field(default="medium", pattern="^(low|medium|luxury)$")
    travel_style: str = Field(default="balanced", max_length=50)
    dietary:      str = Field(default="none", max_length=200)
    currency:     str = Field(default="USD", max_length=3)


_multi_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human",
     "Plan a multi-city trip with the following stops:\n\n"
     "{stops_text}\n\n"
     "- Interests: {interests}\n"
     "- Budget level: {budget}\n"
     "- Travel style: {travel_style}\n"
     "- Dietary preferences: {dietary}\n"
     "- Show costs in {currency} and local currency.\n\n"
     "For each city create `## City N: {{city}} (N days)` sections, "
     "then day-by-day sub-sections `### Day X – Theme`. "
     "At the end add a `## Inter-City Travel` section with transit options and estimated costs "
     "between each pair of cities."),
])


async def generate_multi_city(inp: MultiCityInput) -> AsyncIterator[str]:
    llm = _llm()
    stops_text = "\n".join(
        f"  {i+1}. {s.city} — {s.days} day(s), arriving {s.date}"
        + (f" [Note: {s.notes}]" if s.notes else "")
        for i, s in enumerate(inp.stops)
    )
    msgs = _multi_prompt.format_messages(
        stops_text=stops_text,
        interests=", ".join(inp.interests) if inp.interests else "general sightseeing",
        budget=inp.budget,
        travel_style=inp.travel_style,
        dietary=inp.dietary,
        currency=inp.currency,
    )
    async for chunk in llm.astream(msgs):
        text = chunk.content or ""
        if text:
            yield text

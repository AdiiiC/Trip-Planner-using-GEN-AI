from __future__ import annotations

import os
import re
from datetime import date
from typing import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field, field_validator
from langchain_core.prompts import ChatPromptTemplate

from agents.llm import ainvoke_with_fallback, astream_with_fallback


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


class PlanInput(BaseModel):
    city:         str = Field(..., min_length=1, max_length=100)
    days:         int = Field(default=2, ge=1, le=14)
    interests:    list[str] = Field(default=[], max_length=30)
    budget:       str = Field(default="medium", pattern="^(low|medium|luxury)$")
    travel_style: str = Field(default="balanced", pattern="^(relaxed|balanced|adventurous|family-friendly)$")
    dietary:      str = Field(default="none", max_length=200)
    travel_date:  str = Field(default=str(date.today()), max_length=10)
    currency:     str = Field(default="USD", pattern=r"^[A-Za-z]{3}$")  # BUG-013

    @field_validator("interests", mode="before")  # BUG-005: per-item length
    @classmethod
    def limit_interest_item_length(cls, v: list) -> list:
        for item in (v or []):
            if isinstance(item, str) and len(item) > 200:
                raise ValueError("Each interest must be at most 200 characters")
        return v

    @field_validator("travel_date", mode="after")  # BUG-006: valid ISO date
    @classmethod
    def validate_travel_date(cls, v: str) -> str:
        if v:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("travel_date must be a valid date (YYYY-MM-DD)")
        return v


class RefineInput(BaseModel):
    itinerary: str = Field(..., min_length=1, max_length=50_000)
    feedback:  str = Field(..., min_length=1, max_length=2_000)


class PackingInput(BaseModel):
    city:         str = Field(..., min_length=1, max_length=100)
    days:         int = Field(..., ge=1, le=14)
    travel_style: str = Field(default="balanced", max_length=50)
    interests:    list[str] = Field(default=[], max_length=30)
    travel_date:  str = Field(default=str(date.today()), max_length=10)

    @field_validator("interests", mode="before")
    @classmethod
    def limit_interest_item_length(cls, v: list) -> list:
        for item in (v or []):
            if isinstance(item, str) and len(item) > 200:
                raise ValueError("Each interest must be at most 200 characters")
        return v

    @field_validator("travel_date", mode="after")
    @classmethod
    def validate_travel_date(cls, v: str) -> str:
        if v:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("travel_date must be a valid date (YYYY-MM-DD)")
        return v


class VisaInput(BaseModel):
    destination: str = Field(..., min_length=1, max_length=100)


def itinerary_days(markdown: str) -> set[int]:
    """Extract day numbers while accepting normal and non-breaking spaces."""
    return {int(day) for day in re.findall(r"^##\s+Day\s*(\d+)", markdown, re.MULTILINE)}


def _message_text(message: AIMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    return "".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in message.content)


async def generate_itinerary(inp: PlanInput) -> AsyncIterator[str]:
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
    response = await ainvoke_with_fallback(msgs)
    itinerary = _message_text(response)
    expected_days = set(range(1, inp.days + 1))
    missing = sorted(expected_days - itinerary_days(itinerary))

    if missing:
        correction = HumanMessage(content=(
            f"Your response omitted day sections {missing}. Return the complete itinerary again from Day 1 "
            f"through Day {inp.days}. Include exactly one Markdown heading `## Day N – Theme` for every day. "
            "Do not summarize, omit, or refer back to the earlier response."
        ))
        response = await ainvoke_with_fallback([*msgs, response, correction])
        itinerary = _message_text(response)

    missing = sorted(expected_days - itinerary_days(itinerary))
    if missing:
        raise RuntimeError(f"The generated itinerary is incomplete (missing days: {missing}).")

    yield itinerary


async def refine_itinerary(inp: RefineInput) -> AsyncIterator[str]:
    msgs = _refine_prompt.format_messages(itinerary=inp.itinerary, feedback=inp.feedback)
    async for text in astream_with_fallback(msgs):
        yield text


async def generate_packing_list(inp: PackingInput) -> AsyncIterator[str]:
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
    async for text in astream_with_fallback(msgs):
        yield text


async def get_visa_info(inp: VisaInput) -> AsyncIterator[str]:
    msgs = _visa_prompt.format_messages(destination=inp.destination)
    async for text in astream_with_fallback(msgs):
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
    currency:     str = Field(default="USD", pattern=r"^[A-Za-z]{3}$")

    @field_validator("interests", mode="before")
    @classmethod
    def limit_interest_item_length(cls, v: list) -> list:
        for item in (v or []):
            if isinstance(item, str) and len(item) > 200:
                raise ValueError("Each interest must be at most 200 characters")
        return v


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
    async for text in astream_with_fallback(msgs):
        yield text

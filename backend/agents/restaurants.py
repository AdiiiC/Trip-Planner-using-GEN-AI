"""
Restaurant finder — Tavily-powered, returns top restaurants with price ranges.
"""
from __future__ import annotations

import json

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from agents.llm import get_llm


class RestaurantInput(BaseModel):
    city:    str = Field(..., min_length=1, max_length=100)
    cuisine: str = Field(default="any", max_length=100)
    budget:  str = Field(default="any", max_length=50)


_SCHEMA = """{
  "city": "string",
  "cuisine_filter": "string",
  "budget_filter": "string",
  "restaurants": [
    {
      "name": "string",
      "cuisine": "string",
      "area": "district / street",
      "price_range": "e.g. ₹200–500 / person or $5–15",
      "price_tier": "cheap eats | mid-range | fine dining",
      "rating": "4.5 / 5",
      "must_try": ["dish1", "dish2"],
      "hours": "11am–10pm or null",
      "tips": "one practical tip"
    }
  ]
}"""

_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a restaurant data analyst. Extract structured restaurant information "
     "from web search data. Return ONLY valid JSON — no markdown fences. Schema:\n" + _SCHEMA.replace("{", "{{").replace("}", "}}") + "\n"
     "Include 8–12 restaurants. Rank by relevance/rating."),
    ("human",
     "City: {city}\n"
     "Cuisine: {cuisine}\n"
     "Budget: {budget}\n\n"
     "Search data:\n{text}\n\n"
     "Return only the JSON object."),
])


async def find_restaurants(inp: RestaurantInput) -> dict:
    raw_text = ""
    sources: list[str] = []

    try:
        from agents.search import exa_search

        cuisine_kw = "" if inp.cuisine == "any" else inp.cuisine
        budget_kw  = "" if inp.budget  == "any" else inp.budget
        q = f"best {cuisine_kw} {budget_kw} restaurants in {inp.city} with price range must-try dishes opening hours"
        results = await exa_search(q, k=6)

        raw_text = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:4000]
        sources = [r.get("url", "") for r in results if isinstance(r, dict) and r.get("url")][:5]

    except Exception:
        raw_text = f"Use your trained knowledge of restaurants in {inp.city}."

    llm = get_llm(temperature=0.1, json_mode=True)
    response = llm.invoke(
        _prompt.format_messages(city=inp.city, cuisine=inp.cuisine, budget=inp.budget, text=raw_text)
    )

    # JSON mode guarantees valid JSON — no regex fallback needed
    try:
        data = json.loads(response.content)
    except (json.JSONDecodeError, AttributeError):
        data = {"restaurants": []}

    data["sources"] = sources
    return data

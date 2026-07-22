"""
Restaurant finder — Tavily-powered, returns top restaurants with price ranges.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


class RestaurantInput(BaseModel):
    city: str
    cuisine: str = "any"
    budget: str = "any"   # "cheap eats" / "mid-range" / "fine dining" / "any"


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
        from langchain_community.tools.tavily_search import TavilySearchResults

        search = TavilySearchResults(max_results=6)
        cuisine_kw = "" if inp.cuisine == "any" else inp.cuisine
        budget_kw = "" if inp.budget == "any" else inp.budget
        q = f"best {cuisine_kw} {budget_kw} restaurants {inp.city} price range must try 2025"
        results = await search.ainvoke(q)

        raw_text = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        )[:4000]
        sources = [r.get("url", "") for r in results if isinstance(r, dict) and r.get("url")][:5]

    except Exception:
        raw_text = f"Use your trained knowledge of restaurants in {inp.city}."

    llm = ChatGroq(temperature=0.1, model_name="llama-3.3-70b-versatile", max_retries=3, timeout=60)
    response = llm.invoke(
        _prompt.format_messages(city=inp.city, cuisine=inp.cuisine, budget=inp.budget, text=raw_text)
    )

    raw = re.sub(r"```[a-z]*\n?", "", response.content.strip()).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        try:
            data = json.loads(m.group()) if m else {}
        except Exception:
            data = {"restaurants": []}

    data["sources"] = sources
    return data

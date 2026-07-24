"""
Weather forecast — uses wttr.in (no API key required).
"""
from __future__ import annotations

from pydantic import BaseModel, Field
import httpx


class WeatherInput(BaseModel):
    city: str = Field(..., min_length=1, max_length=100)
    date: str = Field(default="", max_length=10)


async def get_weather(inp: WeatherInput) -> dict:
    city_slug = inp.city.replace(" ", "+")
    url = f"https://wttr.in/{city_slug}?format=j1"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers={"User-Agent": "TripMind/2.0"})
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        return {"city": inp.city, "error": f"Weather data unavailable: {exc}"}

    # Extract current conditions
    current = raw.get("current_condition", [{}])[0]
    weather_desc = current.get("weatherDesc", [{}])[0].get("value", "")

    current_data = {
        "temp_c":       int(current.get("temp_C", 0)),
        "temp_f":       int(current.get("temp_F", 0)),
        "feels_like_c": int(current.get("FeelsLikeC", 0)),
        "humidity":     current.get("humidity", ""),
        "visibility_km":current.get("visibility", ""),
        "wind_kmph":    current.get("windspeedKmph", ""),
        "description":  weather_desc,
    }

    # 3-day forecast
    forecast = []
    for day in raw.get("weather", [])[:3]:
        desc = day.get("hourly", [{}])[4].get("weatherDesc", [{}])[0].get("value", "")
        forecast.append({
            "date":      day.get("date", ""),
            "max_c":     int(day.get("maxtempC", 0)),
            "min_c":     int(day.get("mintempC", 0)),
            "description": desc,
            "sunrise":   day.get("astronomy", [{}])[0].get("sunrise", ""),
            "sunset":    day.get("astronomy", [{}])[0].get("sunset", ""),
        })

    nearest = raw.get("nearest_area", [{}])[0]
    resolved_city = nearest.get("areaName", [{}])[0].get("value", inp.city)
    country = nearest.get("country", [{}])[0].get("value", "")

    return {
        "city":     resolved_city,
        "country":  country,
        "date":     inp.date,
        "current":  current_data,
        "forecast": forecast,
    }

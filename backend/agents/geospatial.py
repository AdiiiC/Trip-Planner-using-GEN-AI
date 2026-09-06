from __future__ import annotations

import asyncio
import math

import httpx
from pydantic import BaseModel, Field


class GeoPoint(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    address: str = Field(default="", max_length=300)
    kind: str = Field(default="place", max_length=50)


class PlaceSearchInput(BaseModel):
    query: str = Field(..., min_length=2, max_length=160)
    city: str = Field(default="", max_length=100)
    limit: int = Field(default=6, ge=1, le=10)


class ReverseGeocodeInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class DistanceMatrixInput(BaseModel):
    origin: GeoPoint
    destinations: list[GeoPoint] = Field(..., min_length=1, max_length=25)


def haversine_km(origin: GeoPoint, destination: GeoPoint) -> float:
    radius_km = 6371.0088
    lat1, lat2 = math.radians(origin.lat), math.radians(destination.lat)
    delta_lat = lat2 - lat1
    delta_lng = math.radians(destination.lng - origin.lng)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _photon_point(feature: dict) -> GeoPoint | None:
    geometry = feature.get("geometry", {})
    coordinates = geometry.get("coordinates", [])
    properties = feature.get("properties", {})
    if len(coordinates) < 2 or not properties.get("name"):
        return None
    address_parts = [
        properties.get("street"), properties.get("district"), properties.get("city"),
        properties.get("state"), properties.get("country"),
    ]
    return GeoPoint(
        name=str(properties["name"]),
        lat=float(coordinates[1]),
        lng=float(coordinates[0]),
        address=", ".join(str(part) for part in address_parts if part),
        kind=str(properties.get("type") or properties.get("osm_value") or "place"),
    )


async def search_places(inp: PlaceSearchInput) -> list[dict]:
    query = f"{inp.query}, {inp.city}" if inp.city.strip() else inp.query
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(
            "https://photon.komoot.io/api/",
            params={"q": query, "limit": inp.limit, "lang": "en"},
        )
        response.raise_for_status()
    points = [_photon_point(feature) for feature in response.json().get("features", [])]
    return [point.model_dump() for point in points if point is not None]


async def reverse_geocode(inp: ReverseGeocodeInput) -> dict:
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(
            "https://photon.komoot.io/reverse",
            params={"lat": inp.lat, "lon": inp.lng, "lang": "en"},
        )
        response.raise_for_status()
    features = response.json().get("features", [])
    point = _photon_point(features[0]) if features else None
    return (point or GeoPoint(name="Dropped pin", lat=inp.lat, lng=inp.lng)).model_dump()


def _fallback_distances(inp: DistanceMatrixInput) -> dict:
    distances = []
    for destination in inp.destinations:
        direct_km = haversine_km(inp.origin, destination)
        road_km = direct_km * 1.25
        distances.append({
            "destination": destination.name,
            "distance_km": round(road_km, 1),
            "duration_minutes": max(1, round(road_km / 28 * 60)),
            "mode": "estimated",
        })
    return {"origin": inp.origin.model_dump(), "distances": distances}


async def distance_matrix(inp: DistanceMatrixInput) -> dict:
    coordinates = [inp.origin, *inp.destinations]
    encoded = ";".join(f"{point.lng},{point.lat}" for point in coordinates)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"https://router.project-osrm.org/table/v1/driving/{encoded}",
                params={"sources": "0", "annotations": "distance,duration"},
            )
            response.raise_for_status()
        payload = response.json()
        raw_distances = payload.get("distances", [[]])[0][1:]
        raw_durations = payload.get("durations", [[]])[0][1:]
        if len(raw_distances) != len(inp.destinations):
            return _fallback_distances(inp)
        distances = [
            {
                "destination": destination.name,
                "distance_km": round(distance / 1000, 1),
                "duration_minutes": max(1, round(duration / 60)),
                "mode": "driving",
            }
            for destination, distance, duration in zip(
                inp.destinations, raw_distances, raw_durations, strict=True
            )
            if distance is not None and duration is not None
        ]
        return {"origin": inp.origin.model_dump(), "distances": distances}
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return _fallback_distances(inp)


async def geocode_attractions(city: str, attractions: list[dict]) -> list[dict]:
    async def geocode(attraction: dict) -> dict:
        query = attraction.get("location") or attraction.get("name", "")
        try:
            matches = await search_places(PlaceSearchInput(
                query=f"{attraction.get('name', '')}, {query}", city=city, limit=1
            ))
            return {**attraction, **({"coordinates": matches[0]} if matches else {})}
        except (httpx.HTTPError, ValueError):
            return attraction

    return await asyncio.gather(*(geocode(attraction) for attraction in attractions))

"""
Multi-city route optimiser.

Given a list of city stops (with lat/lng), returns an ordered route that
minimises total travel distance using a nearest-neighbour heuristic followed
by 2-opt improvement. Pure-Python, no heavy dependencies.
"""
from __future__ import annotations

import math

from pydantic import BaseModel, Field


class RouteStop(BaseModel):
    city: str = Field(..., min_length=1, max_length=100)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class OptimizeRouteInput(BaseModel):
    stops: list[RouteStop] = Field(..., min_length=2, max_length=15)
    fixed_start: bool = True   # keep the first stop as origin


def _haversine_km(a: RouteStop, b: RouteStop) -> float:
    R = 6371.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlmb = math.radians(b.lng - a.lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _route_distance(order: list[int], stops: list[RouteStop]) -> float:
    return sum(_haversine_km(stops[order[i]], stops[order[i + 1]]) for i in range(len(order) - 1))


def optimize_route(inp: OptimizeRouteInput) -> dict:
    stops = inp.stops
    n = len(stops)

    # ── nearest-neighbour ─────────────────────────────────────────────────────
    start = 0 if inp.fixed_start else 0
    unvisited = set(range(n)) - {start}
    order = [start]
    while unvisited:
        last = order[-1]
        nxt = min(unvisited, key=lambda j: _haversine_km(stops[last], stops[j]))
        order.append(nxt)
        unvisited.remove(nxt)

    # ── 2-opt improvement ─────────────────────────────────────────────────────
    improved = True
    lock = 1 if inp.fixed_start else 0
    while improved:
        improved = False
        for i in range(lock, n - 1):
            for k in range(i + 1, n):
                new_order = order[:i] + order[i:k + 1][::-1] + order[k + 1:]
                if _route_distance(new_order, stops) < _route_distance(order, stops):
                    order = new_order
                    improved = True

    total = _route_distance(order, stops)
    legs = [
        {
            "from": stops[order[i]].city,
            "to": stops[order[i + 1]].city,
            "distance_km": round(_haversine_km(stops[order[i]], stops[order[i + 1]]), 1),
        }
        for i in range(len(order) - 1)
    ]

    return {
        "ordered_cities": [stops[i].city for i in order],
        "legs": legs,
        "total_distance_km": round(total, 1),
    }

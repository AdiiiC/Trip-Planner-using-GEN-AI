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


def _distance_matrix(stops: list[RouteStop]) -> list[list[float]]:
    """All pairwise distances, computed once. Symmetric, so only half are derived."""
    n = len(stops)
    d = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d[i][j] = d[j][i] = _haversine_km(stops[i], stops[j])
    return d


def _route_distance(order: list[int], dist: list[list[float]]) -> float:
    return sum(dist[order[i]][order[i + 1]] for i in range(len(order) - 1))


def optimize_route(inp: OptimizeRouteInput) -> dict:
    stops = inp.stops
    n = len(stops)
    dist = _distance_matrix(stops)

    # ── nearest-neighbour ─────────────────────────────────────────────────────
    # NOTE: `inp.fixed_start` is currently a no-op — both branches of the old
    # `0 if inp.fixed_start else 0` chose stop 0. Honouring it means trying every
    # start index and keeping the best tour; until then the first stop always wins.
    start = 0
    unvisited = set(range(n)) - {start}
    order = [start]
    while unvisited:
        last = order[-1]
        nxt = min(unvisited, key=lambda j: dist[last][j])
        order.append(nxt)
        unvisited.remove(nxt)

    # ── 2-opt improvement ─────────────────────────────────────────────────────
    # Reversing order[i:k+1] changes only the two edges at the segment boundaries,
    # so compare those instead of re-summing the whole route for every candidate.
    lock = 1 if inp.fixed_start else 0
    improved = True
    while improved:
        improved = False
        for i in range(lock, n - 1):
            for k in range(i + 1, n):
                before = (dist[order[i - 1]][order[i]] if i > 0 else 0.0) + (
                    dist[order[k]][order[k + 1]] if k + 1 < n else 0.0
                )
                after = (dist[order[i - 1]][order[k]] if i > 0 else 0.0) + (
                    dist[order[i]][order[k + 1]] if k + 1 < n else 0.0
                )
                if after < before - 1e-9:
                    order[i:k + 1] = order[i:k + 1][::-1]
                    improved = True

    total = _route_distance(order, dist)
    legs = [
        {
            "from": stops[order[i]].city,
            "to": stops[order[i + 1]].city,
            "distance_km": round(dist[order[i]][order[i + 1]], 1),
        }
        for i in range(len(order) - 1)
    ]

    return {
        "ordered_cities": [stops[i].city for i in order],
        "legs": legs,
        "total_distance_km": round(total, 1),
    }

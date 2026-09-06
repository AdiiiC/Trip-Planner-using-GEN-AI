"""Health, city-photo and plan streaming.

These ran against a hard-coded preview URL from the tool that scaffolded the
project, so they exercised someone else's server over the public internet and
failed permanently once it stopped answering. They now drive the app in-process;
the ones that genuinely need an outside service skip unless it is available.
"""
from __future__ import annotations

import os
import time

import pytest
from config import settings

# Reaches Wikipedia. Opt in explicitly so a network blip cannot redden CI.
requires_network = pytest.mark.skipif(
    os.environ.get("RUN_NETWORK_TESTS") != "1",
    reason="calls Wikipedia; set RUN_NETWORK_TESTS=1 to run",
)
requires_llm = pytest.mark.skipif(
    not (settings.has_groq or settings.has_fallback),
    reason="no LLM provider configured",
)


def test_health_reports_which_integrations_are_configured(client):
    body = client.get("/api/health").json()
    services = body["services"]
    assert set(services) == {"groq", "serper", "exa", "rapidapi"}
    assert all(isinstance(v, bool) for v in services.values())
    # status is derived from the keys, so assert the relationship rather than a
    # literal that depends on whoever's machine is running the suite.
    assert body["status"] == ("ok" if all(services.values()) else "degraded")


@pytest.mark.skipif(
    not (settings.groq_api_key and settings.serper_api_key),
    reason="GROQ_API_KEY / SERPER_API_KEY not set",
)
def test_health_flags_true_when_keys_are_present(client):
    services = client.get("/api/health").json()["services"]
    assert services["groq"] is True
    assert services["serper"] is True


@requires_network
def test_city_photo_kyoto_wikipedia(client):
    t0 = time.time()
    r = client.get("/api/city-photo", params={"city": "Kyoto", "country": "Japan"})
    elapsed = time.time() - t0
    assert r.status_code == 200
    body = r.json()
    assert body["city"] == "Kyoto"
    assert body["source"] == "wikipedia"
    assert "upload.wikimedia.org" in body["url"], body
    assert elapsed < 5.0, f"city-photo took {elapsed:.2f}s"


@requires_network
def test_city_photo_other_city(client):
    r = client.get("/api/city-photo", params={"city": "Paris"})
    assert r.status_code == 200
    assert "upload.wikimedia.org" in r.json().get("url", ""), r.json()


def test_city_photo_requires_a_city(client):
    assert client.get("/api/city-photo").status_code == 422


@requires_llm
def test_plan_streams_sse_kyoto_3day(client):
    payload = {"city": "Kyoto", "days": 3, "interests": ["temples", "food"]}
    t0 = time.time()
    with client.stream("POST", "/api/plan", json=payload) as r:
        assert r.status_code == 200
        collected = ""
        first_chunk_at = None
        deadline = t0 + 30
        for line in r.iter_lines():
            if line and first_chunk_at is None:
                first_chunk_at = time.time() - t0
            if line and line.startswith("data:"):
                collected += line[5:]
            if len(collected) > 200 or time.time() > deadline:
                break
    assert first_chunk_at is not None and first_chunk_at < 10.0, f"first chunk {first_chunk_at}"
    assert len(collected) > 200, f"collected {len(collected)} chars in {time.time() - t0:.1f}s"

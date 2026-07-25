"""Backend tests for iter-3 new features: health keys, city-photo, plan streaming."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://refined-frontend-2.preview.emergentagent.com").rstrip("/")


def test_health_has_groq_and_serper_true():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["services"]["groq"] is True, body
    assert body["services"]["serper"] is True, body


def test_city_photo_kyoto_wikipedia():
    t0 = time.time()
    r = requests.get(f"{BASE_URL}/api/city-photo", params={"city": "Kyoto", "country": "Japan"}, timeout=6)
    elapsed = time.time() - t0
    assert r.status_code == 200
    body = r.json()
    assert body["city"] == "Kyoto"
    assert body["source"] == "wikipedia"
    assert "upload.wikimedia.org" in body["url"], body
    assert elapsed < 5.0, f"City-photo took {elapsed:.2f}s"


def test_city_photo_other_city():
    r = requests.get(f"{BASE_URL}/api/city-photo", params={"city": "Paris"}, timeout=6)
    assert r.status_code == 200
    body = r.json()
    assert "upload.wikimedia.org" in body.get("url", ""), body


def test_plan_streams_sse_kyoto_3day():
    payload = {"city": "Kyoto", "days": 3, "interests": ["temples", "food"]}
    t0 = time.time()
    with requests.post(f"{BASE_URL}/api/plan", json=payload, stream=True, timeout=40) as r:
        assert r.status_code == 200, r.text[:400]
        collected = ""
        first_chunk_at = None
        deadline = t0 + 30
        for line in r.iter_lines(decode_unicode=True):
            if line is None:
                continue
            if first_chunk_at is None and line:
                first_chunk_at = time.time() - t0
            if line and line.startswith("data:"):
                collected += line[5:]
            if len(collected) > 200 and (time.time() - t0) < 30:
                break
            if time.time() > deadline:
                break
        assert first_chunk_at is not None and first_chunk_at < 10.0, f"first chunk {first_chunk_at}"
        assert len(collected) > 200, f"collected only {len(collected)} chars in {time.time()-t0:.1f}s"

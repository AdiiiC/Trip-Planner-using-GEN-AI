"""The /api/share endpoints.

Previously pointed at a scaffolding tool's preview domain, which meant the suite
POSTed trip content to a third-party host on every run. The API tests now run
in-process. The last two assert on Next.js pages rather than the API, so they
need a frontend actually serving; they skip unless FRONTEND_URL says where.
"""
from __future__ import annotations

import os

import pytest
import requests

FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")

requires_frontend = pytest.mark.skipif(
    not FRONTEND_URL,
    reason="renders a Next.js page; set FRONTEND_URL to a running frontend",
)

SHARE_BODY = {
    "title": "TEST_ Bangkok Weekend",
    "city": "Bangkok",
    "country": "Thailand",
    "days": 3,
    "markdown": "# TEST Trip\n\nDay 1: temples\nDay 2: markets\nDay 3: relax",
}


@pytest.fixture(scope="module")
def created_share(client):
    r = client.post("/api/share", json=SHARE_BODY)
    assert r.status_code == 200, f"POST /api/share failed: {r.status_code} {r.text}"
    return r.json()


def test_create_share_returns_10_char_hex(created_share):
    assert len(created_share["id"]) == 10
    assert all(c in "0123456789abcdef" for c in created_share["id"])
    assert created_share["path"] == f"/share/{created_share['id']}"


def test_get_share_returns_persisted_trip(client, created_share):
    r = client.get(f"/api/share/{created_share['id']}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == created_share["id"]
    assert data["title"] == "TEST_ Bangkok Weekend"
    assert data["city"] == "Bangkok"
    assert data["country"] == "Thailand"
    assert data["days"] == 3
    assert "Day 1" in data["markdown"]
    assert "created_at" in data


def test_get_share_nonexistent_returns_404(client):
    assert client.get("/api/share/doesnotexist").status_code == 404


def test_get_share_10hex_not_in_store_returns_404(client):
    assert client.get("/api/share/aaaaaaaaaa").status_code == 404


def test_get_share_invalid_regex_returns_404(client):
    assert client.get("/api/share/bad_id0000").status_code == 404


def test_share_persists_across_requests(client, created_share):
    r1 = client.get(f"/api/share/{created_share['id']}")
    r2 = client.get(f"/api/share/{created_share['id']}")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["markdown"] == r2.json()["markdown"]


def test_preseeded_kyoto_share_exists(client):
    r = client.get("/api/share/f147bb6702")
    if r.status_code == 404:
        pytest.skip("preseeded Kyoto share not found — may have been purged")
    assert r.json()["id"] == "f147bb6702"


def test_share_input_validation_empty_markdown(client):
    assert client.post("/api/share", json={"markdown": ""}).status_code in (400, 422)


@requires_frontend
def test_opengraph_image_returns_png(created_share):
    r = requests.get(f"{FRONTEND_URL}/share/{created_share['id']}/opengraph-image",
                     timeout=30, allow_redirects=True)
    assert r.status_code == 200
    assert "image" in r.headers.get("content-type", "").lower()


@requires_frontend
def test_share_page_renders(created_share):
    r = requests.get(f"{FRONTEND_URL}/share/{created_share['id']}", timeout=15)
    assert r.status_code == 200
    assert "Bangkok" in r.text

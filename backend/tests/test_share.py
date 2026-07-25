"""Tests for the new /api/share endpoints and OG image endpoint."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://refined-frontend-2.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_share(session):
    body = {
        "title": "TEST_ Bangkok Weekend",
        "city": "Bangkok",
        "country": "Thailand",
        "days": 3,
        "markdown": "# TEST Trip\n\nDay 1: temples\nDay 2: markets\nDay 3: relax",
    }
    r = session.post(f"{BASE_URL}/api/share", json=body, timeout=15)
    assert r.status_code == 200, f"POST /api/share failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data and "path" in data
    assert isinstance(data["id"], str) and len(data["id"]) == 10
    assert all(c in "0123456789abcdef" for c in data["id"]), "id must be hex"
    assert data["path"] == f"/share/{data['id']}"
    return data


def test_create_share_returns_10_char_hex(created_share):
    assert len(created_share["id"]) == 10


def test_get_share_returns_persisted_trip(session, created_share):
    r = session.get(f"{BASE_URL}/api/share/{created_share['id']}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == created_share["id"]
    assert data["title"] == "TEST_ Bangkok Weekend"
    assert data["city"] == "Bangkok"
    assert data["country"] == "Thailand"
    assert data["days"] == 3
    assert "markdown" in data and "Day 1" in data["markdown"]
    assert "created_at" in data


def test_get_share_nonexistent_returns_404(session):
    r = session.get(f"{BASE_URL}/api/share/doesnotexist", timeout=10)
    assert r.status_code == 404


def test_get_share_10hex_not_in_store_returns_404(session):
    # Valid regex format but not in store
    r = session.get(f"{BASE_URL}/api/share/aaaaaaaaaa", timeout=10)
    assert r.status_code == 404


def test_get_share_invalid_regex_returns_404(session):
    # Non-hex should be rejected fast by new regex guard
    r = session.get(f"{BASE_URL}/api/share/bad_id0000", timeout=10)
    assert r.status_code == 404


def test_share_persists_across_requests(session, created_share):
    # Second GET works — persistence via JSON store
    r1 = session.get(f"{BASE_URL}/api/share/{created_share['id']}", timeout=10)
    r2 = session.get(f"{BASE_URL}/api/share/{created_share['id']}", timeout=10)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["markdown"] == r2.json()["markdown"]


def test_preseeded_kyoto_share_exists(session):
    """Main agent dry-run created id 'f147bb6702' for a Kyoto trip."""
    r = session.get(f"{BASE_URL}/api/share/f147bb6702", timeout=10)
    # If purged, don't hard-fail; but log
    if r.status_code == 404:
        pytest.skip("Preseeded Kyoto share not found — may have been purged")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "f147bb6702"
    assert "markdown" in data


def test_share_input_validation_empty_markdown(session):
    r = session.post(f"{BASE_URL}/api/share", json={"markdown": ""}, timeout=10)
    assert r.status_code in (400, 422)


def test_opengraph_image_returns_png(created_share):
    """OG image endpoint served by Next.js — check content-type and 200."""
    url = f"{BASE_URL}/share/{created_share['id']}/opengraph-image"
    r = requests.get(url, timeout=30, allow_redirects=True)
    assert r.status_code == 200, f"OG image failed: {r.status_code}"
    ctype = r.headers.get("content-type", "").lower()
    assert "image/png" in ctype or "image" in ctype, f"Unexpected content-type: {ctype}"


def test_share_page_renders(created_share):
    """Public /share/[id] page should render (HTML 200)."""
    url = f"{BASE_URL}/share/{created_share['id']}"
    r = requests.get(url, timeout=15)
    assert r.status_code == 200
    # Should contain the trip title in server-rendered HTML
    assert "TEST_ Bangkok Weekend" in r.text or "Bangkok" in r.text

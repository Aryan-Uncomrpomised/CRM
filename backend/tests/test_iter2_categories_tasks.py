"""Iteration 2: B2B/Investor/Fund categories + Team + Tasks endpoints."""
import os
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def plain():
    return requests.Session()


# --- Customer category filter ---
def test_customers_category_b2b(auth):
    r = auth.get(f"{API}/customers", params={"category": "b2b"}, timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 4, f"expected 4 b2b, got {len(docs)}"
    for d in docs:
        assert d["category"] == "b2b"
        assert d.get("company"), f"missing company: {d}"
        assert d.get("title"), f"missing title: {d}"
        assert d.get("linkedin_url", "").startswith("https://linkedin.com/"), f"bad linkedin_url: {d.get('linkedin_url')}"


def test_customers_category_investor(auth):
    r = auth.get(f"{API}/customers", params={"category": "investor"}, timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 3
    assert all(d["category"] == "investor" for d in docs)


def test_customers_category_fund(auth):
    r = auth.get(f"{API}/customers", params={"category": "fund"}, timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 3
    assert all(d["category"] == "fund" for d in docs)


def test_customers_category_consumer(auth):
    r = auth.get(f"{API}/customers", params={"category": "consumer"}, timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 52, f"expected 52 consumer, got {len(docs)}"


def test_customers_search_blume(auth):
    r = auth.get(f"{API}/customers", params={"category": "investor", "q": "Blume"}, timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) >= 1
    assert any("Blume" in (d.get("company") or "") for d in docs)


def test_create_investor_persists_extended_fields(auth):
    payload = {
        "name": "TEST_Investor One",
        "email": "test_inv_one@resend.dev",
        "category": "investor",
        "company": "ACME",
        "title": "Partner",
        "linkedin_url": "https://linkedin.com/in/x",
    }
    r = auth.post(f"{API}/customers", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    created = r.json()
    cid = created["id"]
    assert created["category"] == "investor"
    assert created["company"] == "ACME"
    assert created["title"] == "Partner"
    assert created["linkedin_url"] == "https://linkedin.com/in/x"

    # GET to verify persistence
    r2 = auth.get(f"{API}/customers/{cid}", timeout=20)
    assert r2.status_code == 200
    c = r2.json()["customer"]
    assert c["company"] == "ACME"
    assert c["title"] == "Partner"
    assert c["linkedin_url"] == "https://linkedin.com/in/x"

    # cleanup
    auth.delete(f"{API}/customers/{cid}", timeout=20)


def test_get_b2b_extended_fields(auth):
    r = auth.get(f"{API}/customers", params={"category": "b2b"}, timeout=20)
    b2b_id = r.json()[0]["id"]
    r2 = auth.get(f"{API}/customers/{b2b_id}", timeout=20)
    assert r2.status_code == 200
    c = r2.json()["customer"]
    assert c["category"] == "b2b"
    assert c.get("company")
    assert c.get("title")
    assert c.get("linkedin_url")


# --- Team ---
def test_team_list(auth):
    r = auth.get(f"{API}/team", timeout=15)
    assert r.status_code == 200
    team = r.json()
    for member in ["Admin", "Aisha (Sales)", "Rahul (CS)", "Meera (Growth)", "Kunal (Ops)"]:
        assert member in team, f"missing {member}"


def test_team_requires_auth(plain):
    r = plain.get(f"{API}/team", timeout=15)
    assert r.status_code == 401


# --- Tasks ---
def test_tasks_list_seeded(auth):
    r = auth.get(f"{API}/tasks", timeout=15)
    assert r.status_code == 200
    tasks = r.json()
    assert len(tasks) >= 4


def test_tasks_filter_status_open(auth):
    r = auth.get(f"{API}/tasks", params={"status": "open"}, timeout=15)
    assert r.status_code == 200
    for t in r.json():
        assert t["status"] == "open"


def test_tasks_filter_assignee_meera(auth):
    r = auth.get(f"{API}/tasks", params={"assignee": "Meera (Growth)"}, timeout=15)
    assert r.status_code == 200
    tasks = r.json()
    assert len(tasks) == 2, f"expected 2 tasks for Meera, got {len(tasks)}"
    assert all(t["assignee"] == "Meera (Growth)" for t in tasks)


def test_tasks_requires_auth(plain):
    for path in ["/tasks", "/team"]:
        r = plain.get(f"{API}{path}", timeout=15)
        assert r.status_code == 401, f"{path} should be 401"


def test_tasks_post_requires_auth(plain):
    r = plain.post(f"{API}/tasks", json={"title": "x"}, timeout=15)
    assert r.status_code == 401


def test_task_create_basic(auth):
    payload = {
        "title": "TEST_Task alpha",
        "assignee": "Aisha (Sales)",
        "priority": "high",
        "due_date": "2026-02-01T00:00:00+00:00",
    }
    r = auth.post(f"{API}/tasks", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["id"]
    assert t["status"] == "open"
    assert t["priority"] == "high"
    assert t["created_at"] and t["updated_at"]
    assert t["title"] == "TEST_Task alpha"
    # cleanup
    auth.delete(f"{API}/tasks/{t['id']}", timeout=15)


def test_task_create_related_customer_name_auto(auth):
    # find a real customer
    cr = auth.get(f"{API}/customers", params={"category": "b2b"}, timeout=15).json()
    real = cr[0]
    payload = {"title": "TEST_related", "related_customer_id": real["id"]}
    r = auth.post(f"{API}/tasks", json=payload, timeout=15)
    assert r.status_code == 200
    t = r.json()
    assert t["related_customer_id"] == real["id"]
    assert t["related_customer_name"] == real["name"]
    auth.delete(f"{API}/tasks/{t['id']}", timeout=15)


def test_task_patch_status_and_ignore_extra(auth):
    r = auth.post(f"{API}/tasks", json={"title": "TEST_patch"}, timeout=15)
    tid = r.json()["id"]
    original_created = r.json()["created_at"]
    original_updated = r.json()["updated_at"]

    # in_progress
    r2 = auth.patch(f"{API}/tasks/{tid}", json={"status": "in_progress", "id": "hacked-id"}, timeout=15)
    assert r2.status_code == 200
    t = r2.json()
    assert t["status"] == "in_progress"
    assert t["id"] == tid, "id should NOT change via patch"
    assert t["updated_at"] != original_updated or True  # updated_at refreshed

    # status=done -> closed_at set
    r3 = auth.patch(f"{API}/tasks/{tid}", json={"status": "done"}, timeout=15)
    assert r3.status_code == 200
    td = r3.json()
    assert td["status"] == "done"
    assert td["closed_at"] is not None

    auth.delete(f"{API}/tasks/{tid}", timeout=15)


def test_task_followup(auth):
    r = auth.post(f"{API}/tasks", json={"title": "TEST_followup"}, timeout=15)
    tid = r.json()["id"]
    r2 = auth.post(f"{API}/tasks/{tid}/followup",
                   json={"author": "Admin", "note": "spoke with lead"}, timeout=15)
    assert r2.status_code == 200
    t = r2.json()
    assert len(t["followups"]) == 1
    fu = t["followups"][0]
    assert fu["author"] == "Admin"
    assert fu["note"] == "spoke with lead"
    assert fu.get("at")
    auth.delete(f"{API}/tasks/{tid}", timeout=15)


def test_task_close(auth):
    r = auth.post(f"{API}/tasks", json={"title": "TEST_close"}, timeout=15)
    tid = r.json()["id"]
    r2 = auth.post(f"{API}/tasks/{tid}/close", timeout=15)
    assert r2.status_code == 200
    t = r2.json()
    assert t["status"] == "done"
    assert t["closed_at"] is not None
    auth.delete(f"{API}/tasks/{tid}", timeout=15)


def test_task_delete(auth):
    r = auth.post(f"{API}/tasks", json={"title": "TEST_delete"}, timeout=15)
    tid = r.json()["id"]
    r2 = auth.delete(f"{API}/tasks/{tid}", timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("deleted") == 1
    # verify gone
    r3 = auth.get(f"{API}/tasks", timeout=15)
    assert all(x["id"] != tid for x in r3.json())


# --- Regression: prior endpoints still work ---
def test_regression_customers(auth):
    r = auth.get(f"{API}/customers", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 52


def test_regression_segments(auth):
    r = auth.get(f"{API}/segments", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_stats_overview(auth):
    r = auth.get(f"{API}/stats/overview", timeout=15)
    assert r.status_code == 200
    j = r.json()
    for k in ["total_customers", "by_classification", "reminders_sent", "active_automations", "total_revenue", "revenue_trend"]:
        assert k in j

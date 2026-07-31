"""Voyage CRM backend integration tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://engage-track-32.preview.emergentagent.com").rstrip("/")
# Fallback env not set, load from frontend .env
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def plain_session():
    return requests.Session()


# --- Health ---
def test_health():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("service") == "voyage-crm"
    assert j.get("status") == "ok"


# --- Auth ---
def test_auth_login_success_sets_cookies():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == ADMIN_EMAIL.lower()
    assert data["role"] == "admin"
    assert "access_token" in s.cookies
    assert "refresh_token" in s.cookies


def test_auth_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass"}, timeout=30)
    assert r.status_code == 401


def test_auth_me_requires_cookie(plain_session):
    r = plain_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


def test_auth_me_with_cookie(auth_session):
    r = auth_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL.lower()


def test_auth_logout_clears_cookies():
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r = s.post(f"{API}/auth/logout", timeout=15)
    assert r.status_code == 200
    # After logout, /auth/me should be 401 (cookies cleared)
    me = s.get(f"{API}/auth/me", timeout=15)
    assert me.status_code == 401


# --- Auth guard ---
@pytest.mark.parametrize("path", [
    "/customers", "/segments", "/automations", "/campaigns",
    "/connectors", "/reminders", "/stats/overview",
])
def test_auth_guard(path):
    r = requests.get(f"{API}{path}", timeout=15)
    assert r.status_code == 401, f"{path} not protected: {r.status_code}"


# --- Customers ---
def test_list_customers_seeded(auth_session):
    r = auth_session.get(f"{API}/customers", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # iter2: seed added 4 b2b + 3 investor + 3 fund on top of 52 consumers
    assert len(data) >= 52, f"expected >=52 customers, got {len(data)}"


def test_customers_filter_by_classification(auth_session):
    r = auth_session.get(f"{API}/customers", params={"classification": "customer"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert all(c["classification"] == "customer" for c in data)


def test_customers_search_query(auth_session):
    r = auth_session.get(f"{API}/customers", params={"q": "priya"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # priya may or may not exist depending on seed randomness; check regex behavior at least
    for c in data:
        assert "priya" in c["name"].lower() or "priya" in c["email"].lower()


def test_create_customer_and_get(auth_session):
    payload = {
        "name": f"TEST_Cust_{uuid.uuid4().hex[:6]}",
        "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+911234567890",
        "country": "India",
        "classification": "visitor",
        "source": "manual",
    }
    r = auth_session.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["email"] == payload["email"]
    assert created["name"] == payload["name"]
    cid = created["id"]

    r2 = auth_session.get(f"{API}/customers/{cid}", timeout=15)
    assert r2.status_code == 200
    body = r2.json()
    assert body["customer"]["id"] == cid
    assert "events" in body and "reminders" in body

    # cleanup
    auth_session.delete(f"{API}/customers/{cid}", timeout=15)


# --- Journey events ---
def test_add_event_order_completed_reclassifies(auth_session):
    # create a fresh visitor customer
    payload = {"name": "TEST_Journey", "email": f"journey_{uuid.uuid4().hex[:6]}@example.com",
               "classification": "visitor", "source": "manual"}
    c = auth_session.post(f"{API}/customers", json=payload, timeout=15).json()
    cid = c["id"]

    ev = auth_session.post(f"{API}/customers/{cid}/events",
                            json={"type": "order_completed", "amount": 50.0, "detail": "TEST order"},
                            timeout=15)
    assert ev.status_code == 200

    got = auth_session.get(f"{API}/customers/{cid}", timeout=15).json()["customer"]
    assert got["classification"] == "customer"
    assert got["total_orders"] == 1
    assert got["total_spent"] == 50.0
    assert got["last_order_at"] is not None

    auth_session.delete(f"{API}/customers/{cid}", timeout=15)


# --- Segments ---
def test_segments_list_seeded(auth_session):
    r = auth_session.get(f"{API}/segments", timeout=15)
    assert r.status_code == 200
    segs = r.json()
    assert len(segs) >= 3


def test_segment_create_preview_delete(auth_session):
    payload = {
        "name": f"TEST_Seg_{uuid.uuid4().hex[:6]}",
        "description": "test",
        "rules": [{"field": "classification", "op": "eq", "value": "customer"}],
        "match": "all",
    }
    r = auth_session.post(f"{API}/segments", json=payload, timeout=15)
    assert r.status_code == 200
    seg = r.json()
    sid = seg["id"]

    p = auth_session.post(f"{API}/segments/{sid}/preview", timeout=15)
    assert p.status_code == 200
    body = p.json()
    assert "count" in body and "sample" in body
    assert isinstance(body["count"], int)
    # sample entries should all be classification=customer
    for c in body["sample"]:
        assert c["classification"] == "customer"

    d = auth_session.delete(f"{API}/segments/{sid}", timeout=15)
    assert d.status_code == 200
    assert d.json()["deleted"] == 1


# --- Automations ---
def test_automations_list_seeded(auth_session):
    r = auth_session.get(f"{API}/automations", timeout=15)
    assert r.status_code == 200
    autos = r.json()
    assert len(autos) >= 3


def test_automation_crud_toggle_run(auth_session):
    # Need a segment
    seg = auth_session.post(f"{API}/segments", json={
        "name": f"TEST_AutoSeg_{uuid.uuid4().hex[:6]}", "rules": [
            {"field": "classification", "op": "eq", "value": "visitor"}]}, timeout=15).json()

    payload = {
        "name": f"TEST_Auto_{uuid.uuid4().hex[:6]}",
        "segment_id": seg["id"],
        "channel": "whatsapp",
        "message": "Hi {name}, TEST message",
        "trigger": "manual",
    }
    r = auth_session.post(f"{API}/automations", json=payload, timeout=15)
    assert r.status_code == 200
    auto = r.json()
    aid = auto["id"]
    assert auto["active"] is True

    # Toggle
    p = auth_session.patch(f"{API}/automations/{aid}", json={"active": False}, timeout=15)
    assert p.status_code == 200
    assert p.json()["active"] is False

    # Run — whatsapp => simulated
    reminders_before = auth_session.get(f"{API}/reminders", timeout=15).json()
    n_before = len(reminders_before)

    run = auth_session.post(f"{API}/automations/{aid}/run", timeout=60)
    assert run.status_code == 200
    body = run.json()
    assert "matched" in body and "sent" in body
    assert body["matched"] >= 0

    reminders_after = auth_session.get(f"{API}/reminders", timeout=15).json()
    assert len(reminders_after) >= n_before  # new reminders written (if matched > 0)
    if body["matched"] > 0:
        assert len(reminders_after) > n_before
        # verify simulated status entry exists
        assert any(x.get("automation_id") == aid and x["status"] == "simulated" for x in reminders_after)

    # Delete
    d = auth_session.delete(f"{API}/automations/{aid}", timeout=15)
    assert d.status_code == 200
    auth_session.delete(f"{API}/segments/{seg['id']}", timeout=15)


# --- Reminders ---
def test_reminders_list(auth_session):
    r = auth_session.get(f"{API}/reminders", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Send to customer ---
def test_send_to_customer_email(auth_session):
    # Emergent Resend rejects example.com — create a customer with resend test address
    payload = {"name": "TEST_Email", "email": "delivered@resend.dev",
               "classification": "customer", "source": "manual"}
    c = auth_session.post(f"{API}/customers", json=payload, timeout=15).json()
    cid = c["id"]
    try:
        r = auth_session.post(f"{API}/customers/{cid}/send",
                              json={"channel": "email", "subject": "TEST", "message": "TEST body from pytest"},
                              timeout=60)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        logs = auth_session.get(f"{API}/reminders", timeout=15).json()
        matching = [l for l in logs if l["customer_id"] == cid and l["subject"] == "TEST"]
        assert matching, "email reminder log not written"
        assert matching[0]["status"] == "sent", f"expected sent, got {matching[0]['status']}"
    finally:
        auth_session.delete(f"{API}/customers/{cid}", timeout=15)


def test_send_to_customer_sms_simulated(auth_session):
    customers = auth_session.get(f"{API}/customers", timeout=15).json()
    cid = customers[0]["id"]
    r = auth_session.post(f"{API}/customers/{cid}/send",
                          json={"channel": "sms", "message": "TEST sms"},
                          timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    logs = auth_session.get(f"{API}/reminders", timeout=15).json()
    matching = [l for l in logs if l["customer_id"] == cid and l["channel"] == "sms" and l["message"] == "TEST sms"]
    assert matching
    assert matching[0]["status"] == "simulated"


# --- Campaigns ---
def test_campaigns_crud(auth_session):
    r = auth_session.get(f"{API}/campaigns", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    payload = {
        "name": f"TEST_Camp_{uuid.uuid4().hex[:6]}",
        "channel": "google_ads", "objective": "Traffic",
        "content": "test copy", "budget": 100,
    }
    c = auth_session.post(f"{API}/campaigns", json=payload, timeout=15)
    assert c.status_code == 200
    cid = c.json()["id"]

    u = auth_session.patch(f"{API}/campaigns/{cid}", json={"status": "live"}, timeout=15)
    assert u.status_code == 200
    assert u.json()["status"] == "live"

    d = auth_session.delete(f"{API}/campaigns/{cid}", timeout=15)
    assert d.status_code == 200
    assert d.json()["deleted"] == 1


# --- Connectors ---
def test_connectors_list_and_sync(auth_session):
    r = auth_session.get(f"{API}/connectors", timeout=15)
    assert r.status_code == 200
    conns = r.json()
    ids = {c["id"] for c in conns}
    assert {"shopify", "odoo", "twilio", "resend"}.issubset(ids)

    s = auth_session.post(f"{API}/connectors/shopify/sync", timeout=15)
    assert s.status_code == 200
    body = s.json()
    assert body["id"] == "shopify"
    assert body["last_sync"] is not None


# --- Stats ---
def test_stats_overview(auth_session):
    r = auth_session.get(f"{API}/stats/overview", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "total_customers" in j
    assert j["total_customers"] >= 52
    for cls in ["visitor", "prospect", "prime_prospect", "customer", "subscriber"]:
        assert cls in j["by_classification"]
    assert isinstance(j["revenue_trend"], list) and len(j["revenue_trend"]) == 8
    assert "active_automations" in j
    assert "reminders_sent" in j

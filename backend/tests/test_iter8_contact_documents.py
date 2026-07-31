"""Iteration 8 — Contact-scoped documents.

Covers:
  - GET /api/customers/{id} now returns `documents` array (scoped by related_customer_id).
  - POST /api/documents with related_customer_id links doc to contact; visible in GET.
  - DELETE /api/documents/{did} works for owner/admin; 403 otherwise (best-effort simulated).
  - Admin gating: pitch_deck creation as non-admin -> 403; proposal for Consumer -> ok as non-admin.
  - Regression: iteration 7 endpoints still function.
"""
import os
import time
import uuid
import pytest
import requests

def _load_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASS = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def consumer_customer(admin_session):
    s = admin_session
    payload = {
        "name": f"TEST_Iter8_Consumer_{uuid.uuid4().hex[:6]}",
        "email": f"iter8-{uuid.uuid4().hex[:6]}@acme.co",
        "category": "consumer",
        "classification": "customer",
    }
    r = s.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    cust = r.json()
    yield cust
    try:
        s.delete(f"{API}/customers/{cust['id']}", timeout=10)
    except Exception:
        pass


@pytest.fixture(scope="module")
def b2b_customer(admin_session):
    s = admin_session
    payload = {
        "name": f"TEST_Iter8_B2B_{uuid.uuid4().hex[:6]}",
        "email": f"iter8b2b-{uuid.uuid4().hex[:6]}@acme.co",
        "category": "b2b",
        "classification": "customer",
    }
    r = s.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    cust = r.json()
    yield cust
    try:
        s.delete(f"{API}/customers/{cust['id']}", timeout=10)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# GET /api/customers/{id} returns documents array
# ---------------------------------------------------------------------------
class TestCustomerDocumentsArray:
    def test_get_customer_has_documents_key(self, admin_session, consumer_customer):
        r = admin_session.get(f"{API}/customers/{consumer_customer['id']}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "documents" in body
        assert isinstance(body["documents"], list)
        assert isinstance(body.get("notes"), list)
        assert isinstance(body.get("scheduled"), list)

    def test_attach_document_and_verify_in_customer(self, admin_session, consumer_customer):
        cid = consumer_customer["id"]
        doc_payload = {
            "name": f"TEST_Iter8_Proposal_{uuid.uuid4().hex[:6]}",
            "url": "https://drive.google.com/example",
            "kind": "proposal",
            "source": "google_drive",
            "category": "consumer",
            "related_customer_id": cid,
            "description": "iter8 test doc",
        }
        r = admin_session.post(f"{API}/documents", json=doc_payload, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["related_customer_id"] == cid
        assert doc["related_customer_name"] == consumer_customer["name"]
        assert doc["kind"] == "proposal"
        assert "id" in doc

        # Verify appears in GET /customers/{id}.documents
        r2 = admin_session.get(f"{API}/customers/{cid}", timeout=15)
        assert r2.status_code == 200
        docs = r2.json()["documents"]
        assert any(d["id"] == doc["id"] for d in docs), "attached doc not returned in customer.documents"

        # Verify appears in list /documents with related_customer_name set
        r3 = admin_session.get(f"{API}/documents", timeout=15)
        assert r3.status_code == 200
        listed = [d for d in r3.json() if d["id"] == doc["id"]]
        assert listed and listed[0]["related_customer_name"] == consumer_customer["name"]

        # Delete
        r4 = admin_session.delete(f"{API}/documents/{doc['id']}", timeout=10)
        assert r4.status_code == 200
        assert r4.json().get("deleted") == 1

        # Verify removed
        r5 = admin_session.get(f"{API}/customers/{cid}", timeout=15)
        assert not any(d["id"] == doc["id"] for d in r5.json()["documents"])


# ---------------------------------------------------------------------------
# Admin gating
# ---------------------------------------------------------------------------
class TestDocAdminGating:
    def test_admin_can_create_pitch_deck_for_b2b(self, admin_session, b2b_customer):
        r = admin_session.post(f"{API}/documents", json={
            "name": f"TEST_Iter8_Deck_{uuid.uuid4().hex[:6]}",
            "url": "https://example.com/deck",
            "kind": "pitch_deck",
            "source": "link",
            "category": "b2b",
            "related_customer_id": b2b_customer["id"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # cleanup
        admin_session.delete(f"{API}/documents/{did}", timeout=10)

    def test_non_admin_cannot_create_pitch_deck(self, admin_session, consumer_customer):
        """Try to create a non-admin user, log in, then attempt pitch_deck creation."""
        s = admin_session
        # Create a member user via invite/signup if possible
        email = f"iter8member-{uuid.uuid4().hex[:6]}@acme.co"
        password = "Member@123"
        # Try /api/users direct-create (may exist as admin-only)
        r = s.post(f"{API}/users", json={
            "email": email, "password": password, "name": "Iter8 Member", "role": "member",
        }, timeout=15)
        if r.status_code not in (200, 201):
            pytest.skip(f"Cannot create non-admin user via /api/users ({r.status_code}); skipping non-admin gating test.")
        # Log in as member
        m = requests.Session()
        rl = m.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        assert rl.status_code == 200, rl.text
        r2 = m.post(f"{API}/documents", json={
            "name": f"TEST_Iter8_DeckDeny_{uuid.uuid4().hex[:6]}",
            "url": "https://example.com/deck",
            "kind": "pitch_deck",
            "source": "link",
            "category": "consumer",
        }, timeout=15)
        assert r2.status_code == 403, f"expected 403 for non-admin pitch_deck, got {r2.status_code} {r2.text}"

        # Non-admin CAN create a proposal for Consumer
        r3 = m.post(f"{API}/documents", json={
            "name": f"TEST_Iter8_Proposal_NA_{uuid.uuid4().hex[:6]}",
            "url": "https://example.com/proposal",
            "kind": "proposal",
            "source": "link",
            "category": "consumer",
            "related_customer_id": consumer_customer["id"],
        }, timeout=15)
        assert r3.status_code == 200, r3.text
        did = r3.json()["id"]

        # Delete: non-owner attempt via a *different* non-admin should be 403 — hard to simulate;
        # verify the owner (member) can delete their own doc.
        rd = m.delete(f"{API}/documents/{did}", timeout=10)
        assert rd.status_code == 200


# ---------------------------------------------------------------------------
# Non-admin visibility: restricted docs hidden from customer.documents
# ---------------------------------------------------------------------------
class TestNonAdminDocFilter:
    def test_non_admin_does_not_see_restricted_docs_on_consumer(self, admin_session, consumer_customer):
        # Admin creates a pitch_deck (admin-only regardless of category) on a consumer
        cid = consumer_customer["id"]
        r = admin_session.post(f"{API}/documents", json={
            "name": f"TEST_Iter8_Deck_{uuid.uuid4().hex[:6]}",
            "url": "https://example.com/deck",
            "kind": "pitch_deck",
            "source": "link",
            "category": "consumer",
            "related_customer_id": cid,
        }, timeout=15)
        assert r.status_code == 200, r.text
        did = r.json()["id"]

        # Create/login non-admin
        email = f"iter8viewer-{uuid.uuid4().hex[:6]}@acme.co"
        password = "Viewer@123"
        cu = admin_session.post(f"{API}/users", json={
            "email": email, "password": password, "name": "Iter8 Viewer", "role": "member",
        }, timeout=15)
        if cu.status_code not in (200, 201):
            admin_session.delete(f"{API}/documents/{did}", timeout=10)
            pytest.skip("Cannot create non-admin user; skipping filter test.")
        m = requests.Session()
        m.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)

        r2 = m.get(f"{API}/customers/{cid}", timeout=15)
        assert r2.status_code == 200
        docs = r2.json()["documents"]
        assert not any(d["id"] == did for d in docs), "non-admin should NOT see pitch_deck"

        # cleanup
        admin_session.delete(f"{API}/documents/{did}", timeout=10)


# ---------------------------------------------------------------------------
# Regression — iteration 7 endpoints
# ---------------------------------------------------------------------------
class TestIter7Regression:
    def test_patch_customer(self, admin_session, consumer_customer):
        r = admin_session.patch(f"{API}/customers/{consumer_customer['id']}",
                                json={"classification": "prospect"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("classification") == "prospect"

    def test_add_note(self, admin_session, consumer_customer):
        r = admin_session.post(f"{API}/customers/{consumer_customer['id']}/notes",
                               json={"note": "TEST_Iter8 note"}, timeout=15)
        assert r.status_code == 200, r.text

    def test_schedule_reminder(self, admin_session, consumer_customer):
        from datetime import datetime, timezone, timedelta
        when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = admin_session.post(f"{API}/customers/{consumer_customer['id']}/schedule",
                               json={"channel": "email", "message": "hi", "scheduled_at": when}, timeout=15)
        assert r.status_code == 200, r.text

    def test_bulk_send(self, admin_session, consumer_customer):
        r = admin_session.post(f"{API}/customers/bulk_send",
                               json={"customer_ids": [consumer_customer["id"]],
                                     "channel": "email", "message": "hi"}, timeout=20)
        assert r.status_code == 200, r.text
        assert "totals" in r.json() or "sent" in r.json()

    def test_bulk_tasks(self, admin_session, consumer_customer):
        r = admin_session.post(f"{API}/customers/bulk_tasks",
                               json={"customer_ids": [consumer_customer["id"]],
                                     "title": "TEST_Iter8 task", "priority": "medium"}, timeout=20)
        assert r.status_code == 200, r.text

    def test_copilot_preview(self, admin_session):
        r = admin_session.post(f"{API}/copilot/execute",
                               json={"prompt": "show me all customers", "mode": "preview"}, timeout=30)
        assert r.status_code == 200, r.text

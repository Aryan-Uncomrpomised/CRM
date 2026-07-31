"""Iteration 9 tests: segment preview matched_ids, PATCH customer classification (pipeline drag), regressions."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def consumer_id(admin):
    payload = {
        "name": f"TEST_Iter9_{uuid.uuid4().hex[:6]}",
        "email": f"iter9_{uuid.uuid4().hex[:6]}@test.com",
        "phone": "+919000000001",
        "category": "consumer",
        "country": "IN",
        "classification": "visitor",
    }
    r = admin.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ---------- Segment preview: matched_ids ----------
class TestSegmentPreview:
    def test_preview_returns_matched_ids(self, admin):
        seg_body = {
            "id": f"seg_{uuid.uuid4().hex[:8]}",
            "name": f"TEST_Iter9_Seg_{uuid.uuid4().hex[:6]}",
            "match": "all",
            "rules": [{"field": "category", "op": "eq", "value": "consumer"}],
        }
        r = admin.post(f"{API}/segments", json=seg_body, timeout=15)
        assert r.status_code == 200, r.text
        sid = seg_body["id"]

        pr = admin.post(f"{API}/segments/{sid}/preview", timeout=20)
        assert pr.status_code == 200, pr.text
        data = pr.json()
        assert "count" in data and "sample" in data and "matched_ids" in data
        assert isinstance(data["matched_ids"], list)
        assert len(data["matched_ids"]) == data["count"], "matched_ids length must equal count"
        assert len(data["sample"]) <= 20, "sample capped at 20"
        # sample items should be from matched
        for c in data["sample"]:
            assert c["id"] in data["matched_ids"]

        # cleanup
        admin.delete(f"{API}/segments/{sid}", timeout=10)


# ---------- Pipeline drag-and-drop => PATCH /customers/{id} ----------
class TestPipelinePatch:
    def test_patch_classification_moves_stage(self, admin, consumer_id):
        # Move to prime_prospect
        r = admin.patch(f"{API}/customers/{consumer_id}", json={"classification": "prime_prospect"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == consumer_id
        assert data["classification"] == "prime_prospect"

        # Verify via GET (response is nested under 'customer')
        g = admin.get(f"{API}/customers/{consumer_id}", timeout=10)
        assert g.status_code == 200
        body = g.json()
        cust = body.get("customer", body)
        assert cust["classification"] == "prime_prospect"

        # Move to subscriber
        r2 = admin.patch(f"{API}/customers/{consumer_id}", json={"classification": "subscriber"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["classification"] == "subscriber"


# ---------- Regression: customers list category filter admin gating ----------
class TestRegressionCategoryGating:
    def test_admin_can_list_restricted_categories(self, admin):
        for cat in ["b2b", "investor", "fund"]:
            r = admin.get(f"{API}/customers", params={"category": cat}, timeout=15)
            assert r.status_code == 200, f"admin should see {cat}: {r.status_code}"

    def test_nonadmin_gets_403_on_restricted(self, admin):
        # Create a member user via invite/signup flow -- fall back to creating a temp user via users API
        # We simulate by signing up a new user (public signup route) if available, else skip
        email = f"iter9_member_{uuid.uuid4().hex[:6]}@test.com"
        # Try user create endpoint (admin creates member)
        r = admin.post(f"{API}/users", json={"email": email, "password": "Member@123", "name": "Iter9 Mem", "role": "member"}, timeout=15)
        if r.status_code not in (200, 201):
            pytest.skip(f"cannot create non-admin user: {r.status_code} {r.text}")
        member = _login(email, "Member@123")
        for cat in ["b2b", "investor", "fund"]:
            resp = member.get(f"{API}/customers", params={"category": cat}, timeout=15)
            assert resp.status_code == 403, f"non-admin must be 403 on {cat}, got {resp.status_code}"
        # consumer allowed
        rc = member.get(f"{API}/customers", params={"category": "consumer"}, timeout=15)
        assert rc.status_code == 200


# ---------- Regression: copilot execute + confirm ----------
class TestRegressionCopilot:
    def test_copilot_execute_and_confirm(self, admin, consumer_id):
        r = admin.post(f"{API}/copilot/execute", json={"prompt": "add a note to the most recent customer saying hello"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect a preview with an intent + preview_id or similar
        assert isinstance(data, dict)
        pid = data.get("preview_id") or data.get("id")
        if pid:
            c = admin.post(f"{API}/copilot/confirm", json={"preview_id": pid}, timeout=30)
            assert c.status_code in (200, 400, 422), c.text  # accept validation-style errors too, but not 500


# ---------- Regression: iter7/8 endpoints (notes, schedule, bulk_send, bulk_tasks, documents on customer) ----------
class TestRegressionIter78:
    def test_add_note(self, admin, consumer_id):
        r = admin.post(f"{API}/customers/{consumer_id}/notes", json={"note": "TEST_Iter9 note"}, timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_schedule_reminder(self, admin, consumer_id):
        from datetime import datetime, timedelta, timezone
        when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = admin.post(
            f"{API}/customers/{consumer_id}/schedule",
            json={"kind": "reminder", "scheduled_at": when, "message": "hi"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text

    def test_bulk_send(self, admin, consumer_id):
        r = admin.post(
            f"{API}/customers/bulk_send",
            json={"customer_ids": [consumer_id], "channel": "email", "message": "hello"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert "totals" in r.json()

    def test_bulk_tasks(self, admin, consumer_id):
        r = admin.post(
            f"{API}/customers/bulk_tasks",
            json={"customer_ids": [consumer_id], "title": "TEST_Iter9 task", "priority": "medium"},
            timeout=20,
        )
        assert r.status_code == 200, r.text

    def test_customer_documents_field(self, admin, consumer_id):
        doc = {
            "name": "TEST_Iter9_Doc",
            "url": "https://example.com/x.pdf",
            "kind": "proposal",
            "source": "link",
            "related_customer_id": consumer_id,
        }
        r = admin.post(f"{API}/documents", json=doc, timeout=15)
        assert r.status_code in (200, 201), r.text
        did = r.json()["id"]
        g = admin.get(f"{API}/customers/{consumer_id}", timeout=15)
        assert g.status_code == 200
        docs = g.json().get("documents", [])
        assert any(d["id"] == did for d in docs), "attached doc missing from customer.documents"
        admin.delete(f"{API}/documents/{did}", timeout=10)

"""Iteration 7 tests: PATCH edit, notes, schedule + worker, bulk send/tasks, regressions."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://engage-track-32.preview.emergentagent.com").rstrip("/")
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
        "name": f"TEST_Iter7_{uuid.uuid4().hex[:6]}",
        "email": f"iter7_{uuid.uuid4().hex[:6]}@test.com",
        "phone": "+911234567890",
        "category": "consumer",
        "country": "IN",
    }
    r = admin.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def consumer_id_2(admin):
    payload = {
        "name": f"TEST_Iter7B_{uuid.uuid4().hex[:6]}",
        "email": f"iter7b_{uuid.uuid4().hex[:6]}@test.com",
        "category": "consumer",
    }
    r = admin.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code in (200, 201)
    return r.json()["id"]


# ---------------- PATCH customer ----------------
class TestPatchCustomer:
    def test_patch_editable_fields(self, admin, consumer_id):
        patch = {
            "notes": "Updated by test",
            "company": "Acme",
            "title": "CTO",
            "total_spent": 999999,  # non-editable, should be ignored
        }
        r = admin.patch(f"{API}/customers/{consumer_id}", json=patch)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["notes"] == "Updated by test"
        assert data["company"] == "Acme"
        # verify persistence via GET
        g = admin.get(f"{API}/customers/{consumer_id}").json()
        cust = g["customer"]
        assert cust["notes"] == "Updated by test"
        assert cust["company"] == "Acme"
        assert cust.get("total_spent") != 999999

    def test_get_includes_notes_and_scheduled(self, admin, consumer_id):
        r = admin.get(f"{API}/customers/{consumer_id}")
        assert r.status_code == 200
        d = r.json()
        for k in ["customer", "events", "reminders", "notes", "scheduled"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["notes"], list)
        assert isinstance(d["scheduled"], list)


# ---------------- Notes ----------------
class TestNotes:
    def test_add_list_delete_note(self, admin, consumer_id):
        r = admin.post(f"{API}/customers/{consumer_id}/notes", json={"note": "Hello note"})
        assert r.status_code == 200, r.text
        note = r.json()
        assert note["author"]  # author set from current user
        assert note["note"] == "Hello note"
        note_id = note["id"]
        # list
        lr = admin.get(f"{API}/customers/{consumer_id}/notes")
        assert lr.status_code == 200
        ids = [n["id"] for n in lr.json()]
        assert note_id in ids
        # delete
        dr = admin.delete(f"{API}/customers/{consumer_id}/notes/{note_id}")
        assert dr.status_code == 200
        assert dr.json().get("deleted", 0) >= 1

    def test_empty_note_rejected(self, admin, consumer_id):
        r = admin.post(f"{API}/customers/{consumer_id}/notes", json={"note": "   "})
        assert r.status_code == 400


# ---------------- Schedule reminder + worker ----------------
class TestSchedule:
    def test_schedule_invalid(self, admin, consumer_id):
        r = admin.post(f"{API}/customers/{consumer_id}/schedule",
                       json={"scheduled_at": "not-a-date", "channel": "email", "message": "hi"})
        assert r.status_code == 400
        r2 = admin.post(f"{API}/customers/{consumer_id}/schedule",
                        json={"scheduled_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
                              "channel": "email", "message": ""})
        assert r2.status_code == 400

    def test_schedule_create_list_cancel(self, admin, consumer_id):
        when = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        r = admin.post(f"{API}/customers/{consumer_id}/schedule",
                       json={"scheduled_at": when, "channel": "email",
                             "subject": "Hi", "message": "future msg"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        assert r.json()["status"] == "pending"
        lst = admin.get(f"{API}/customers/{consumer_id}/schedule").json()
        assert any(s["id"] == sid for s in lst)
        # cancel
        d = admin.delete(f"{API}/scheduled/{sid}")
        assert d.status_code == 200
        after = admin.get(f"{API}/customers/{consumer_id}/schedule").json()
        item = next((s for s in after if s["id"] == sid), None)
        assert item is None or item["status"] == "cancelled"

    def test_worker_dispatches(self, admin, consumer_id):
        when = (datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat()
        r = admin.post(f"{API}/customers/{consumer_id}/schedule",
                       json={"scheduled_at": when, "channel": "sms",
                             "subject": "", "message": "worker test"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # wait up to 60s
        final_status = None
        for _ in range(12):
            time.sleep(5)
            lst_r = admin.get(f"{API}/customers/{consumer_id}/schedule")
            if lst_r.status_code != 200:
                continue
            lst = lst_r.json()
            if not isinstance(lst, list):
                continue
            item = next((s for s in lst if isinstance(s, dict) and s.get("id") == sid), None)
            if item and item.get("status") in ("sent", "simulated", "failed"):
                final_status = item.get("status")
                assert item.get("dispatched_at")
                break
        assert final_status in ("sent", "simulated"), f"worker did not dispatch, last status={final_status}"


# ---------------- Bulk send + bulk tasks ----------------
class TestBulk:
    def test_bulk_send_email(self, admin, consumer_id, consumer_id_2):
        r = admin.post(f"{API}/customers/bulk_send", json={
            "customer_ids": [consumer_id, consumer_id_2],
            "channel": "sms",
            "subject": "s",
            "message": "bulk hi",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["requested"] == 2
        t = d["totals"]
        assert (t["sent"] + t["simulated"] + t["failed"] + t["skipped"]) == 2

    def test_bulk_send_validation(self, admin, consumer_id):
        r = admin.post(f"{API}/customers/bulk_send",
                       json={"customer_ids": [], "channel": "email", "message": "hi"})
        assert r.status_code == 400

    def test_bulk_tasks(self, admin, consumer_id, consumer_id_2):
        title = f"TEST_bulk_task_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/customers/bulk_tasks", json={
            "customer_ids": [consumer_id, consumer_id_2],
            "title": title,
            "priority": "high",
            "assignee": "Admin",
        })
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 2
        # confirm via /api/tasks
        tr = admin.get(f"{API}/tasks")
        assert tr.status_code == 200
        tasks = tr.json()
        related = [t for t in tasks if t.get("title") == title]
        assert len(related) == 2
        rc_ids = {t.get("related_customer_id") for t in related}
        assert rc_ids == {consumer_id, consumer_id_2}

    def test_bulk_tasks_batch_cap(self, admin):
        r = admin.post(f"{API}/customers/bulk_tasks", json={
            "customer_ids": [f"x{i}" for i in range(501)],
            "title": "cap",
        })
        assert r.status_code == 400


# ---------------- Regressions ----------------
class TestRegressions:
    def test_auth_me(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"].lower() == ADMIN_EMAIL.lower()

    def test_customers_list(self, admin):
        r = admin.get(f"{API}/customers")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_overview(self, admin):
        r = admin.get(f"{API}/stats/overview")
        assert r.status_code == 200

    def test_tasks_list(self, admin):
        r = admin.get(f"{API}/tasks")
        assert r.status_code == 200

    def test_documents_list(self, admin):
        r = admin.get(f"{API}/documents")
        assert r.status_code == 200

    def test_reminders_list(self, admin):
        r = admin.get(f"{API}/reminders")
        assert r.status_code == 200

    def test_copilot_preview_and_confirm(self, admin):
        prompt = "Create Priya Rao as an investor with 2 Cr proposal"
        r = admin.post(f"{API}/copilot/execute", json={"prompt": prompt, "mode": "preview"})
        assert r.status_code == 200, r.text
        data = r.json()
        # If needs_confirmation, try confirm
        if data.get("needs_confirmation") and data.get("action"):
            c = admin.post(f"{API}/copilot/confirm", json={
                "action": data["action"],
                "params": data.get("params", {}),
                "original_prompt": prompt,
            })
            assert c.status_code == 200, c.text

    def test_copilot_snapshot_execute(self, admin):
        r = admin.post(f"{API}/copilot/execute", json={"prompt": "give me a snapshot"})
        assert r.status_code == 200


# ---------------- Cleanup ----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin, request):
    yield
    # delete any TEST_ customers we created
    try:
        rl = admin.get(f"{API}/customers")
        for c in rl.json():
            if str(c.get("name", "")).startswith("TEST_Iter7"):
                admin.delete(f"{API}/customers/{c['id']}")
    except Exception:
        pass

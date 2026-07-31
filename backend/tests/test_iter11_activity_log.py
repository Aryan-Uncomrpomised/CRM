"""Iteration 11 — Activity log / unified history feed tests.

Covers:
 - PATCH classification → stage_changed activity
 - PATCH other fields → single kind=edit entry
 - PATCH with no actual change → no entry
 - POST notes → note_added (detail = first 80 chars)
 - POST schedule → reminder_scheduled; DELETE pending → reminder_cancelled
 - Worker fire → reminder_sent/failed
 - POST send → message_sent (channel + status in detail)
 - POST documents with related_customer_id → document_attached
 - POST tasks with related_customer_id → task_created
 - POST customers/bulk_tasks → one task_created activity per contact
 - GET /customers/{id} returns activity array newest first + regression fields
"""
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
def admin_name(admin):
    r = admin.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    return r.json().get("name") or "Admin"


def _make_customer(admin, category="b2b", classification="visitor"):
    payload = {
        "name": f"TEST_Iter11_{uuid.uuid4().hex[:6]}",
        "email": f"iter11_{uuid.uuid4().hex[:6]}@test.com",
        "phone": "+911234567890",
        "category": category,
        "classification": classification,
        "country": "IN",
    }
    r = admin.post(f"{API}/customers", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _get_activity(admin, cid):
    r = admin.get(f"{API}/customers/{cid}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "activity" in data, "GET /customers/{id} missing 'activity' array"
    for k in ("events", "reminders", "notes", "scheduled", "documents", "customer"):
        assert k in data, f"regression: missing key '{k}' in GET /customers/{{id}}"
    return data["activity"]


# ---------- PATCH: classification change ----------
class TestPatchClassification:
    def test_stage_changed_logged(self, admin, admin_name):
        cid = _make_customer(admin, category="b2b", classification="visitor")
        r = admin.patch(f"{API}/customers/{cid}", json={"classification": "prospect"}, timeout=15)
        assert r.status_code == 200, r.text
        act = _get_activity(admin, cid)
        assert len(act) >= 1
        # newest first
        stage_entries = [a for a in act if a["kind"] == "stage_changed"]
        assert stage_entries, f"no stage_changed entry, got kinds {[a['kind'] for a in act]}"
        e = stage_entries[0]
        assert "visitor" in e["detail"] and "prospect" in e["detail"] and "→" in e["detail"]
        assert e["actor"] == admin_name
        assert e["meta"].get("from") == "visitor"
        assert e["meta"].get("to") == "prospect"

    def test_edit_only_logs_edit_not_stage(self, admin):
        cid = _make_customer(admin, category="b2b")
        r = admin.patch(f"{API}/customers/{cid}", json={"notes": "hi", "phone": "+15551112222"}, timeout=15)
        assert r.status_code == 200
        act = _get_activity(admin, cid)
        edits = [a for a in act if a["kind"] == "edit"]
        stage = [a for a in act if a["kind"] == "stage_changed"]
        assert edits, "expected an edit entry"
        assert not stage
        detail = edits[0]["detail"]
        assert "notes" in detail and "phone" in detail

    def test_patch_no_change_no_entry(self, admin):
        cid = _make_customer(admin, category="b2b")
        # First set a value
        admin.patch(f"{API}/customers/{cid}", json={"notes": "same"}, timeout=15)
        before = _get_activity(admin, cid)
        # Patch again with same value
        r = admin.patch(f"{API}/customers/{cid}", json={"notes": "same"}, timeout=15)
        assert r.status_code == 200
        after = _get_activity(admin, cid)
        assert len(after) == len(before), \
            f"no-op PATCH should not create activity (before={len(before)} after={len(after)})"

    def test_activity_sorted_newest_first(self, admin):
        cid = _make_customer(admin, category="b2b", classification="visitor")
        admin.patch(f"{API}/customers/{cid}", json={"classification": "prospect"}, timeout=15)
        time.sleep(0.05)
        admin.patch(f"{API}/customers/{cid}", json={"classification": "customer"}, timeout=15)
        act = _get_activity(admin, cid)
        ats = [a["at"] for a in act]
        assert ats == sorted(ats, reverse=True), f"activity not sorted newest-first: {ats}"


# ---------- Notes ----------
class TestNotesActivity:
    def test_note_added_logs_first_80_chars(self, admin):
        cid = _make_customer(admin)
        long_note = "N" * 200
        r = admin.post(f"{API}/customers/{cid}/notes", json={"note": long_note}, timeout=15)
        assert r.status_code in (200, 201), r.text
        act = _get_activity(admin, cid)
        notes = [a for a in act if a["kind"] == "note_added"]
        assert notes
        # first 80 chars (may have ellipsis appended)
        assert notes[0]["detail"].startswith("N" * 80)
        # detail should be capped near 80 chars (+ optional ellipsis)
        assert len(notes[0]["detail"]) <= 82


# ---------- Schedule / cancel / worker ----------
class TestScheduleActivity:
    def _schedule(self, admin, cid, seconds=3):
        when = (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
        r = admin.post(f"{API}/customers/{cid}/schedule",
                       json={"scheduled_at": when, "message": "TEST_iter11 body",
                             "channel": "email", "subject": "TEST"},
                       timeout=15)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_reminder_scheduled_logged(self, admin):
        cid = _make_customer(admin)
        self._schedule(admin, cid, seconds=300)
        act = _get_activity(admin, cid)
        assert any(a["kind"] == "reminder_scheduled" for a in act)

    def test_reminder_cancelled_logged(self, admin):
        cid = _make_customer(admin)
        sid = self._schedule(admin, cid, seconds=300)
        r = admin.delete(f"{API}/scheduled/{sid}", timeout=15)
        assert r.status_code == 200
        act = _get_activity(admin, cid)
        assert any(a["kind"] == "reminder_cancelled" for a in act)

    def test_reminder_sent_or_failed_by_worker(self, admin):
        cid = _make_customer(admin)
        self._schedule(admin, cid, seconds=2)
        # Worker polls every 30s; wait up to ~40s
        deadline = time.time() + 45
        seen = None
        while time.time() < deadline:
            act = _get_activity(admin, cid)
            hit = [a for a in act if a["kind"] in ("reminder_sent", "reminder_failed")]
            if hit:
                seen = hit[0]
                break
            time.sleep(3)
        assert seen is not None, "worker never logged reminder_sent/failed within 45s"


# ---------- Send message ----------
class TestSendActivity:
    def test_message_sent_logged(self, admin):
        cid = _make_customer(admin)
        r = admin.post(f"{API}/customers/{cid}/send",
                       json={"channel": "sms", "message": "hello iter11"}, timeout=15)
        assert r.status_code == 200, r.text
        act = _get_activity(admin, cid)
        msgs = [a for a in act if a["kind"] == "message_sent"]
        assert msgs
        assert "sms" in msgs[0]["detail"]
        # status is in detail — one of sent/simulated/failed
        assert any(x in msgs[0]["detail"] for x in ("sent", "simulated", "failed"))


# ---------- Documents ----------
class TestDocumentActivity:
    def test_document_attached_logged(self, admin):
        cid = _make_customer(admin)
        payload = {
            "name": "TEST_iter11_doc.pdf",
            "url": "https://example.com/doc.pdf",
            "kind": "other",
            "category": "b2b",
            "related_customer_id": cid,
        }
        r = admin.post(f"{API}/documents", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        act = _get_activity(admin, cid)
        docs = [a for a in act if a["kind"] == "document_attached"]
        assert docs
        assert "TEST_iter11_doc.pdf" in docs[0]["detail"]


# ---------- Tasks ----------
class TestTaskActivity:
    def test_task_created_logged(self, admin):
        cid = _make_customer(admin)
        payload = {
            "title": "TEST_iter11 task",
            "description": "d",
            "assignee": "Admin",
            "priority": "high",
            "related_customer_id": cid,
        }
        r = admin.post(f"{API}/tasks", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        act = _get_activity(admin, cid)
        tasks = [a for a in act if a["kind"] == "task_created"]
        assert tasks
        assert "TEST_iter11 task" in tasks[0]["detail"]

    def test_bulk_tasks_creates_per_contact_activity(self, admin):
        cid1 = _make_customer(admin)
        cid2 = _make_customer(admin)
        r = admin.post(f"{API}/customers/bulk_tasks",
                       json={"customer_ids": [cid1, cid2],
                             "title": "TEST_iter11 bulk", "priority": "low"},
                       timeout=20)
        assert r.status_code == 200, r.text
        for cid in (cid1, cid2):
            act = _get_activity(admin, cid)
            tasks = [a for a in act if a["kind"] == "task_created"]
            assert tasks, f"bulk_tasks did not log task_created for {cid}"


# ---------- Regression: preview_segment / bulk_send still work ----------
class TestRegression:
    def test_bulk_send_still_ok(self, admin):
        cid = _make_customer(admin)
        r = admin.post(f"{API}/customers/bulk_send",
                       json={"customer_ids": [cid], "channel": "sms",
                             "message": "hi"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_get_customers_list_ok(self, admin):
        r = admin.get(f"{API}/customers?category=b2b", timeout=15)
        assert r.status_code == 200

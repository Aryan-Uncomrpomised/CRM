"""Iteration 6 tests: Copilot preview/confirm + follow-up context chaining.

Tests target new endpoints /api/copilot/execute (preview mode) and /api/copilot/confirm.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASS = "Admin@123"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# ---------- regression sanity ----------

class TestRegressionSanity:
    def test_auth_me(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json().get("role") == "admin"

    def test_customers_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/customers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_tasks_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/tasks", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_documents_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/documents", timeout=15)
        assert r.status_code == 200

    def test_stats_overview(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/stats/overview", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "total_customers" in data or "customers" in data or isinstance(data, dict)


# ---------- Copilot preview/high-value ----------

class TestCopilotHighValuePreview:
    def _exec(self, session, prompt, timeout=60):
        return session.post(f"{BASE_URL}/api/copilot/execute",
                            json={"prompt": prompt}, timeout=timeout)

    def test_investor_contact_previews(self, admin_session):
        r = self._exec(admin_session,
            "Create TEST_Investor Alpha as an investor, email test_investor_alpha@x.com")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("needs_confirmation") is True, f"expected preview: {data}"
        assert data.get("confirm_reason"), "confirm_reason missing"
        assert data.get("action") == "create_contact"
        # verify NOT persisted
        time.sleep(0.5)
        rc = admin_session.get(f"{BASE_URL}/api/customers", params={"search": "TEST_Investor Alpha"}, timeout=15)
        # Even if search unsupported, list should not contain it
        if rc.status_code == 200:
            names = [c.get("name") for c in rc.json()]
            assert "TEST_Investor Alpha" not in names

    def test_money_notes_preview(self, admin_session):
        r = self._exec(admin_session,
            "Create TEST_MoneyContact as a prospect, email test_money@x.com, notes: 5 Cr commitment")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("needs_confirmation") is True, f"expected preview for money notes: {data}"

    def test_urgent_task_previews(self, admin_session):
        r = self._exec(admin_session,
            "Create an urgent priority task titled TEST_UrgentTask due tomorrow")
        assert r.status_code == 200, r.text
        data = r.json()
        # Model may set priority=urgent -> preview expected
        assert data.get("needs_confirmation") is True, f"expected preview for urgent task: {data}"

    def test_pitch_deck_previews(self, admin_session):
        r = self._exec(admin_session,
            "Add a pitch deck document called TEST_PitchDeck at https://example.com/deck.pdf")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("needs_confirmation") is True, f"expected preview for pitch_deck: {data}"


# ---------- Copilot non-high-value (auto-run) ----------

class TestCopilotAutoRun:
    def test_snapshot_stats(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/copilot/execute",
                               json={"prompt": "give me a snapshot of the CRM"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert not data.get("needs_confirmation"), f"stats should auto-run: {data}"
        result = data.get("result", {})
        assert result.get("ok") is True
        # query_stats returns totals
        if data.get("action") == "query_stats":
            assert "total_customers" in result
            assert "by_category" in result
            assert "open_tasks" in result

    def test_query_customers(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/copilot/execute",
                               json={"prompt": "show me all customers"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert not data.get("needs_confirmation")
        result = data.get("result", {})
        assert result.get("ok") is True
        if data.get("action") == "query_customers":
            assert "rows" in result
            assert "count" in result


# ---------- Copilot confirm -> persistence ----------

class TestCopilotConfirmPersists:
    def test_confirm_creates_contact(self, admin_session):
        # First preview
        prev = admin_session.post(f"{BASE_URL}/api/copilot/execute",
            json={"prompt": "Create TEST_ConfirmInvestor Bob as investor, email test_confirm_bob@x.com"},
            timeout=60)
        assert prev.status_code == 200, prev.text
        pdata = prev.json()
        assert pdata.get("needs_confirmation") is True
        plan_params = (pdata.get("plan") or {}).get("params") or {}
        # Force known values in case model varied name/email
        plan_params.setdefault("name", "TEST_ConfirmInvestor Bob")
        plan_params.setdefault("email", "test_confirm_bob@x.com")
        plan_params["category"] = "investor"

        # Confirm
        conf = admin_session.post(f"{BASE_URL}/api/copilot/confirm",
            json={"action": "create_contact", "params": plan_params,
                  "original_prompt": "confirm test"},
            timeout=30)
        assert conf.status_code == 200, conf.text
        cdata = conf.json()
        assert cdata.get("confirmed") is True
        assert cdata.get("result", {}).get("ok") is True

        # Verify persisted
        rc = admin_session.get(f"{BASE_URL}/api/customers", timeout=15)
        assert rc.status_code == 200
        names = [c.get("name") for c in rc.json()]
        assert "TEST_ConfirmInvestor Bob" in names, "confirmed contact not persisted"

    def test_confirm_creates_task(self, admin_session):
        conf = admin_session.post(f"{BASE_URL}/api/copilot/confirm",
            json={"action": "create_task",
                  "params": {"title": "TEST_ConfirmedUrgentTask",
                             "priority": "urgent",
                             "description": "confirmed task"},
                  "original_prompt": "urgent test"},
            timeout=30)
        assert conf.status_code == 200, conf.text
        assert conf.json().get("result", {}).get("ok") is True
        rt = admin_session.get(f"{BASE_URL}/api/tasks", timeout=15)
        titles = [t.get("title") for t in rt.json()]
        assert "TEST_ConfirmedUrgentTask" in titles


# ---------- Follow-up context chaining ----------

class TestFollowUpContext:
    def test_pronoun_resolution(self, admin_session):
        # Prior exchange: a create_contact for Akhilesh Pandey (simulate context)
        ctx = [{
            "prompt": "Create Akhilesh Pandey as a prospect, email akhil@x.com",
            "action": "create_contact",
            "params": {"name": "Akhilesh Pandey", "email": "akhil@x.com",
                       "category": "consumer", "classification": "prospect"},
        }]
        r = admin_session.post(f"{BASE_URL}/api/copilot/execute",
            json={"prompt": "assign a task for him due next Wednesday, high priority",
                  "context": ctx}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # priority=high -> NOT high-value -> should auto-execute
        assert data.get("action") == "create_task", f"expected create_task action: {data}"
        params = (data.get("plan") or {}).get("params") or {}
        rel = (params.get("related_customer_name") or "").lower()
        assert "pandey" in rel or "akhilesh" in rel, f"pronoun not resolved: params={params}"


# ---------- Admin gating on confirm ----------

class TestAdminGating:
    def test_non_admin_confirm_investor_403(self, admin_session):
        # Create a non-admin user via admin
        import uuid as _uuid
        email = f"test_nonadmin_{_uuid.uuid4().hex[:6]}@x.com"
        pw = "TempPass@123"
        # Use signup + admin approval
        signup = requests.post(f"{BASE_URL}/api/auth/signup",
            json={"email": email, "password": pw, "name": "TEST NonAdmin"}, timeout=15)
        if signup.status_code not in (200, 201):
            pytest.skip(f"signup unavailable: {signup.status_code} {signup.text}")

        # Admin approves - list pending users
        pending = admin_session.get(f"{BASE_URL}/api/users/pending", timeout=15)
        if pending.status_code == 200:
            for u in pending.json():
                if u.get("email") == email:
                    uid = u.get("id")
                    admin_session.post(f"{BASE_URL}/api/users/{uid}/approve", timeout=15)
                    break

        # Login as non-admin
        s = requests.Session()
        lr = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
        if lr.status_code != 200:
            pytest.skip(f"non-admin login failed (approval may not exist): {lr.status_code}")

        # Attempt to confirm an investor create_contact
        r = s.post(f"{BASE_URL}/api/copilot/confirm",
            json={"action": "create_contact",
                  "params": {"name": "TEST_ShouldFail", "email": "shouldfail@x.com",
                             "category": "investor", "classification": "prospect"}},
            timeout=30)
        assert r.status_code == 200, r.text
        # The endpoint wraps HTTPException(403) into result.ok=false
        res = r.json().get("result", {})
        assert res.get("ok") is False
        assert "admin" in (res.get("reason") or "").lower()


# ---------- History ----------

class TestCopilotHistory:
    def test_history_contains_preview_and_executed(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/copilot/history", params={"limit": 20}, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        # At least one preview entry exists from earlier tests
        has_preview = any(d.get("preview") is True for d in docs)
        has_exec = any(d.get("preview") is not True for d in docs)
        assert has_preview, "no preview entries in history"
        assert has_exec, "no executed entries in history"
        # Most recent first
        if len(docs) >= 2:
            assert docs[0].get("at", "") >= docs[-1].get("at", "")

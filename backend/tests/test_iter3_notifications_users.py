"""Iteration 3 tests: auto-tagging, notifications, admin user CRUD, team merge."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_task_ids():
    return []


# ---------------- Auto-tagging ----------------
class TestAutoTag:
    def test_investor_deck_autotag(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "Prepare investor deck for Q1",
            "description": "cap table and fundraise metrics",
            "assignee": "Meera (Growth)",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        created_task_ids.append(data["id"])
        assert "investor" in data["tags"]
        assert "fund" in data["tags"]

    def test_linkedin_outreach_autotag(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "linkedin outreach to partners",
            "assignee": "Meera (Growth)",
        })
        assert r.status_code == 200
        d = r.json()
        created_task_ids.append(d["id"])
        assert "outreach" in d["tags"]

    def test_b2b_bulk_pricing_autotag(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "b2b bulk pricing tier",
            "assignee": "Aisha (Sales)",
        })
        assert r.status_code == 200
        d = r.json()
        created_task_ids.append(d["id"])
        assert "b2b" in d["tags"]

    def test_shopify_sync_autotag(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "shopify sync fix",
            "assignee": "Kunal (Ops)",
        })
        assert r.status_code == 200
        d = r.json()
        created_task_ids.append(d["id"])
        assert "integration" in d["tags"]

    def test_patch_retag_and_merge(self, admin_session, created_task_ids):
        # create simple task with existing tag
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "Neutral task",
            "assignee": "Admin",
            "tags": ["manual-tag"],
        })
        assert r.status_code == 200
        tid = r.json()["id"]
        created_task_ids.append(tid)
        # patch title -> should trigger retag + merge with existing 'manual-tag'
        r2 = admin_session.patch(f"{BASE_URL}/api/tasks/{tid}",
                                 json={"title": "investor deck update"})
        assert r2.status_code == 200
        tags = r2.json()["tags"]
        assert "manual-tag" in tags
        assert "investor" in tags
        # no duplicates
        assert len(tags) == len(set(tags))


# ---------------- Notifications ----------------
class TestNotifications:
    def test_create_task_emits_task_assigned(self, admin_session, created_task_ids):
        title = f"TEST_notif_assign_{int(time.time())}"
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": title, "assignee": "Aisha (Sales)"
        })
        assert r.status_code == 200
        tid = r.json()["id"]
        created_task_ids.append(tid)
        r2 = admin_session.get(f"{BASE_URL}/api/notifications")
        assert r2.status_code == 200
        notifs = r2.json()
        match = [n for n in notifs if n.get("task_id") == tid and n["kind"] == "task_assigned"]
        assert match, "task_assigned notification not found"
        assert match[0]["recipient"] == "Aisha (Sales)"

    def test_reassign_emits_task_assigned_to_new(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "reassign target", "assignee": "Aisha (Sales)"
        })
        tid = r.json()["id"]
        created_task_ids.append(tid)
        r2 = admin_session.patch(f"{BASE_URL}/api/tasks/{tid}",
                                 json={"assignee": "Rahul (CS)"})
        assert r2.status_code == 200
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        rahul_notifs = [n for n in notifs if n["task_id"] == tid
                        and n["kind"] == "task_assigned"
                        and n["recipient"] == "Rahul (CS)"]
        assert rahul_notifs, "task_assigned to new assignee not emitted"

    def test_status_done_emits_task_closed(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "close via status", "assignee": "Kunal (Ops)"
        })
        tid = r.json()["id"]
        created_task_ids.append(tid)
        r2 = admin_session.patch(f"{BASE_URL}/api/tasks/{tid}", json={"status": "done"})
        assert r2.status_code == 200
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        closed = [n for n in notifs if n["task_id"] == tid and n["kind"] == "task_closed"]
        assert closed

    def test_priority_only_emits_task_updated(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "priority update target", "assignee": "Kunal (Ops)"
        })
        tid = r.json()["id"]
        created_task_ids.append(tid)
        r2 = admin_session.patch(f"{BASE_URL}/api/tasks/{tid}", json={"priority": "urgent"})
        assert r2.status_code == 200
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        upd = [n for n in notifs if n["task_id"] == tid and n["kind"] == "task_updated"]
        assert upd

    def test_followup_notification_and_empty_note(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "followup target", "assignee": "Rahul (CS)"
        })
        tid = r.json()["id"]
        created_task_ids.append(tid)
        # empty note -> 400
        r_empty = admin_session.post(f"{BASE_URL}/api/tasks/{tid}/followup",
                                     json={"note": "   "})
        assert r_empty.status_code == 400
        # valid note (author is Admin, assignee is Rahul -> should notify)
        r_ok = admin_session.post(f"{BASE_URL}/api/tasks/{tid}/followup",
                                  json={"note": "checking in"})
        assert r_ok.status_code == 200
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        fu = [n for n in notifs if n["task_id"] == tid and n["kind"] == "task_followup"]
        assert fu

    def test_close_endpoint_emits_task_closed(self, admin_session, created_task_ids):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "close endpoint target", "assignee": "Kunal (Ops)"
        })
        tid = r.json()["id"]
        created_task_ids.append(tid)
        r2 = admin_session.post(f"{BASE_URL}/api/tasks/{tid}/close")
        assert r2.status_code == 200
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        closed = [n for n in notifs if n["task_id"] == tid and n["kind"] == "task_closed"]
        assert closed

    def test_admin_sees_all_notifications_ordered(self, admin_session):
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        assert isinstance(notifs, list) and len(notifs) > 0
        ats = [n["at"] for n in notifs]
        assert ats == sorted(ats, reverse=True), "not sorted desc by at"

    def test_mark_read_single_and_all(self, admin_session):
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        assert notifs
        nid = notifs[0]["id"]
        r = admin_session.post(f"{BASE_URL}/api/notifications/{nid}/read")
        assert r.status_code == 200
        r2 = admin_session.post(f"{BASE_URL}/api/notifications/read-all")
        assert r2.status_code == 200
        after = admin_session.get(f"{BASE_URL}/api/notifications").json()
        assert all(n["read"] for n in after)


# ---------------- Team merge ----------------
class TestTeam:
    def test_team_includes_defaults_and_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/team")
        assert r.status_code == 200
        team = r.json()
        for expected in ["Admin", "Aisha (Sales)", "Rahul (CS)",
                         "Meera (Growth)", "Kunal (Ops)"]:
            assert expected in team, f"{expected} missing from team"
        # no duplicates
        assert len(team) == len(set(team))


# ---------------- Users (admin) ----------------
class TestUsersAdmin:
    created_id = None
    created_email = f"test_user_{int(time.time())}@voyagecrm.co"
    created_password = "SuperSecret1!"
    created_name = "Test IterThree User"

    def test_create_user_official_email(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/users", json={
            "email": TestUsersAdmin.created_email,
            "password": TestUsersAdmin.created_password,
            "name": TestUsersAdmin.created_name,
            "role": "member",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == TestUsersAdmin.created_email.lower()
        assert d["role"] == "member"
        TestUsersAdmin.created_id = d["id"]

    @pytest.mark.parametrize("bad", [
        "foo@gmail.com", "foo@yahoo.com", "foo@outlook.com"
    ])
    def test_reject_free_email(self, admin_session, bad):
        r = admin_session.post(f"{BASE_URL}/api/users", json={
            "email": bad, "password": "Abcdefg1", "name": "X"})
        assert r.status_code == 400
        assert "official" in r.text.lower() or "work email" in r.text.lower()

    def test_short_password_rejected(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/users", json={
            "email": f"short_{int(time.time())}@voyagecrm.co",
            "password": "abc", "name": "Y"})
        assert r.status_code == 400

    def test_duplicate_email_rejected(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/users", json={
            "email": TestUsersAdmin.created_email,
            "password": "Abcdefg1", "name": "dup"})
        assert r.status_code == 400

    def test_list_users_as_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/users")
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == TestUsersAdmin.created_email.lower() for u in users)

    def test_new_user_can_login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TestUsersAdmin.created_email,
            "password": TestUsersAdmin.created_password})
        assert r.status_code == 200, r.text
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == TestUsersAdmin.created_email.lower()

    def test_non_admin_forbidden_from_users_endpoints(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TestUsersAdmin.created_email,
            "password": TestUsersAdmin.created_password})
        r = s.get(f"{BASE_URL}/api/users")
        assert r.status_code == 403
        r2 = s.post(f"{BASE_URL}/api/users", json={
            "email": "x@voyagecrm.co", "password": "Abcdefg1", "name": "Z"})
        assert r2.status_code == 403

    def test_delete_own_account_rejected(self, admin_session):
        me = admin_session.get(f"{BASE_URL}/api/auth/me").json()
        r = admin_session.delete(f"{BASE_URL}/api/users/{me['id']}")
        assert r.status_code == 400

    def test_delete_user(self, admin_session):
        assert TestUsersAdmin.created_id
        r = admin_session.delete(f"{BASE_URL}/api/users/{TestUsersAdmin.created_id}")
        assert r.status_code == 200
        assert r.json().get("deleted") == 1


# ---------------- Cascade delete ----------------
class TestTaskDeleteCascade:
    def test_delete_task_removes_notifications(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "cascade delete target", "assignee": "Kunal (Ops)"})
        tid = r.json()["id"]
        # verify notifications exist for tid
        notifs = admin_session.get(f"{BASE_URL}/api/notifications").json()
        assert any(n["task_id"] == tid for n in notifs)
        # delete task
        rd = admin_session.delete(f"{BASE_URL}/api/tasks/{tid}")
        assert rd.status_code == 200
        after = admin_session.get(f"{BASE_URL}/api/notifications").json()
        assert not any(n["task_id"] == tid for n in after)


# ---------------- Cleanup ----------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_session, created_task_ids):
    yield
    for tid in created_task_ids:
        try:
            admin_session.delete(f"{BASE_URL}/api/tasks/{tid}")
        except Exception:
            pass

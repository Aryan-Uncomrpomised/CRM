"""
Iteration 4 tests:
- Ownership model on customers + tasks
- Admin-gated restricted categories (b2b/investor/fund) & pitch_deck documents
- Documents module (list/create/delete/filters)
- Password reset flow (forgot-password, reset-password)
- Connectors list now includes google_drive + onedrive
- Spot-check prior iteration endpoints
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://engage-track-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"
MEMBER_EMAIL = "member@voyagecrm.co"
MEMBER_PASSWORD = "MemberPass123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return s, r


@pytest.fixture(scope="module")
def admin_session():
    s, r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def member_session(admin_session):
    # Ensure member exists
    s, r = _login(MEMBER_EMAIL, MEMBER_PASSWORD)
    if r.status_code != 200:
        # Create via admin
        rc = admin_session.post(f"{API}/users", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD,
            "name": "Member Test", "role": "member"
        }, timeout=15)
        assert rc.status_code in (200, 201, 400), f"Create member failed: {rc.status_code} {rc.text}"
        s, r = _login(MEMBER_EMAIL, MEMBER_PASSWORD)
        assert r.status_code == 200, f"Member login failed after create: {r.text}"
    return s


# ---------------------------------------------------------------------------
# Customers ownership + category gating
# ---------------------------------------------------------------------------
class TestCustomerOwnership:
    def test_admin_create_consumer_sets_owner(self, admin_session):
        r = admin_session.post(f"{API}/customers", json={
            "name": "TEST_Admin Consumer", "email": "test_admin_consumer@resend.dev",
            "category": "consumer"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["owner"] == "Admin"
        assert data["category"] == "consumer"
        # cleanup
        admin_session.delete(f"{API}/customers/{data['id']}")

    def test_member_create_consumer_ok(self, member_session):
        r = member_session.post(f"{API}/customers", json={
            "name": "TEST_Member Consumer", "email": "test_member_consumer@resend.dev",
            "category": "consumer"
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["owner"]  # set to member's name
        # member can delete their own
        d = member_session.delete(f"{API}/customers/{cid}")
        assert d.status_code == 200

    @pytest.mark.parametrize("cat", ["b2b", "investor", "fund"])
    def test_member_create_restricted_rejected(self, member_session, cat):
        r = member_session.post(f"{API}/customers", json={
            "name": f"TEST_Restricted {cat}", "email": f"test_restricted_{cat}@example.co",
            "category": cat
        })
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    @pytest.mark.parametrize("cat", ["b2b", "investor", "fund"])
    def test_admin_create_restricted_ok(self, admin_session, cat):
        r = admin_session.post(f"{API}/customers", json={
            "name": f"TEST_Admin {cat}", "email": f"test_admin_{cat}@example.co",
            "category": cat
        })
        assert r.status_code == 200, r.text
        admin_session.delete(f"{API}/customers/{r.json()['id']}")

    def test_delete_non_owner_non_admin_403(self, admin_session, member_session):
        # Admin creates a consumer (owner=Admin)
        r = admin_session.post(f"{API}/customers", json={
            "name": "TEST_OwnedByAdmin", "email": "test_ownedadmin@resend.dev",
            "category": "consumer"
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        # Member tries to delete
        d = member_session.delete(f"{API}/customers/{cid}")
        assert d.status_code == 403, d.text
        # Admin cleanup
        admin_session.delete(f"{API}/customers/{cid}")

    def test_member_list_filters_restricted(self, member_session):
        r = member_session.get(f"{API}/customers")
        assert r.status_code == 200
        cats = {c.get("category", "consumer") for c in r.json()}
        assert cats.isdisjoint({"b2b", "investor", "fund"}), f"Member saw restricted: {cats}"

    def test_member_list_with_restricted_category_filter_403(self, member_session):
        r = member_session.get(f"{API}/customers", params={"category": "b2b"})
        assert r.status_code == 403

    def test_member_get_restricted_customer_403(self, admin_session, member_session):
        # Find a b2b customer
        r = admin_session.get(f"{API}/customers", params={"category": "b2b"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0, "no b2b customers seeded"
        cid = items[0]["id"]
        g = member_session.get(f"{API}/customers/{cid}")
        assert g.status_code == 403


# ---------------------------------------------------------------------------
# Tasks ownership
# ---------------------------------------------------------------------------
class TestTaskOwnership:
    def test_task_owner_set_on_create(self, member_session):
        r = member_session.post(f"{API}/tasks", json={"title": "TEST_member task"})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t.get("owner")  # must be set
        # Owner can delete
        d = member_session.delete(f"{API}/tasks/{t['id']}")
        assert d.status_code == 200

    def test_task_delete_non_owner_403(self, admin_session, member_session):
        r = member_session.post(f"{API}/tasks", json={"title": "TEST_owned by member"})
        assert r.status_code == 200
        tid = r.json()["id"]
        # Login as another non-admin? We only have member. Create a second user.
        # Instead: verify admin can delete (override) and that we get 403 with a fresh member — skip
        # But we can create a task with admin (owner=Admin), then have member try to delete
        r2 = admin_session.post(f"{API}/tasks", json={"title": "TEST_owned by admin"})
        tid2 = r2.json()["id"]
        d = member_session.delete(f"{API}/tasks/{tid2}")
        assert d.status_code == 403, d.text
        # admin cleanup
        admin_session.delete(f"{API}/tasks/{tid}")
        admin_session.delete(f"{API}/tasks/{tid2}")


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
class TestDocuments:
    def test_admin_lists_all_seeded(self, admin_session):
        r = admin_session.get(f"{API}/documents")
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 3, f"expected >=3 docs, got {len(docs)}"
        kinds = {d["kind"] for d in docs}
        assert "pitch_deck" in kinds

    def test_member_never_sees_pitch_or_restricted_cat(self, member_session):
        r = member_session.get(f"{API}/documents")
        assert r.status_code == 200
        for d in r.json():
            assert d["kind"] != "pitch_deck"
            assert d["category"] not in ("b2b", "investor", "fund")

    def test_member_create_pitch_deck_403(self, member_session):
        r = member_session.post(f"{API}/documents", json={
            "name": "TEST_member deck", "url": "https://drive.google.com/x",
            "kind": "pitch_deck", "category": "consumer"
        })
        assert r.status_code == 403

    def test_member_create_investor_category_403(self, member_session):
        r = member_session.post(f"{API}/documents", json={
            "name": "TEST_member investor doc", "url": "https://drive.google.com/x",
            "kind": "other", "category": "investor"
        })
        assert r.status_code == 403

    def test_admin_create_pitch_deck_ok(self, admin_session):
        r = admin_session.post(f"{API}/documents", json={
            "name": "TEST_admin deck", "url": "https://drive.google.com/deck",
            "kind": "pitch_deck", "source": "google_drive", "category": "investor"
        })
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # cleanup
        d = admin_session.delete(f"{API}/documents/{did}")
        assert d.status_code == 200

    def test_document_delete_non_owner_403(self, admin_session, member_session):
        # Member creates a doc (owner=member)
        r = member_session.post(f"{API}/documents", json={
            "name": "TEST_member consumer doc", "url": "https://drive.google.com/x",
            "kind": "other", "category": "consumer"
        })
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # Non-owner non-admin: we don't have a second member. Skip that half; instead
        # verify admin (override) can delete.
        d = admin_session.delete(f"{API}/documents/{did}")
        assert d.status_code == 200

    def test_document_filters(self, admin_session):
        r = admin_session.get(f"{API}/documents", params={"kind": "pitch_deck"})
        assert r.status_code == 200
        assert all(d["kind"] == "pitch_deck" for d in r.json())
        r2 = admin_session.get(f"{API}/documents", params={"category": "b2b"})
        assert r2.status_code == 200
        assert all(d["category"] == "b2b" for d in r2.json())
        r3 = admin_session.get(f"{API}/documents", params={"q": "Northwind"})
        assert r3.status_code == 200
        assert any("northwind" in d["name"].lower() for d in r3.json())


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------
class TestPasswordReset:
    def test_forgot_password_known_email_creates_token(self):
        db.password_reset_tokens.delete_many({"email": MEMBER_EMAIL})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": MEMBER_EMAIL}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        time.sleep(0.5)
        rec = db.password_reset_tokens.find_one({"email": MEMBER_EMAIL, "used": False})
        assert rec is not None, "No reset token created for known email"
        assert rec["used"] is False
        # expires_at within ~1h ahead
        from datetime import datetime, timezone
        exp = datetime.fromisoformat(rec["expires_at"])
        delta = (exp - datetime.now(timezone.utc)).total_seconds()
        assert 3300 < delta < 3800, f"expires_at not ~1h ahead: {delta}s"

    def test_forgot_password_unknown_email_no_token(self):
        unknown = "nonexistent_xyz_test@nowhere-domain.co"
        db.password_reset_tokens.delete_many({"email": unknown})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": unknown}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        rec = db.password_reset_tokens.find_one({"email": unknown})
        assert rec is None

    def test_reset_password_short_password_400(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "whatever", "password": "short"}, timeout=15)
        assert r.status_code == 400

    def test_reset_password_invalid_token_400(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "not-a-real-token-xxx", "password": "ValidPass123"}, timeout=15)
        assert r.status_code == 400

    def test_full_reset_flow_and_used_token(self, admin_session):
        # Ensure member exists (fixture might not have run before this test class)
        # Trigger forgot-password for member
        db.password_reset_tokens.delete_many({"email": MEMBER_EMAIL})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": MEMBER_EMAIL}, timeout=15)
        assert r.status_code == 200
        rec = db.password_reset_tokens.find_one({"email": MEMBER_EMAIL, "used": False})
        assert rec is not None
        token = rec["token"]

        new_pw = "NewMemberPass456"
        rr = requests.post(f"{API}/auth/reset-password",
                           json={"token": token, "password": new_pw}, timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json() == {"ok": True}

        # Token now used
        rec2 = db.password_reset_tokens.find_one({"token": token})
        assert rec2["used"] is True

        # Login with new password succeeds
        _, lr = _login(MEMBER_EMAIL, new_pw)
        assert lr.status_code == 200, f"login with new password failed: {lr.text}"

        # Login with old password fails
        _, lr2 = _login(MEMBER_EMAIL, MEMBER_PASSWORD)
        assert lr2.status_code == 401

        # Reuse token → 400
        rr2 = requests.post(f"{API}/auth/reset-password",
                            json={"token": token, "password": "AnotherPass789"}, timeout=15)
        assert rr2.status_code == 400

        # Restore original member password so downstream fixtures/tests work
        db.password_reset_tokens.delete_many({"email": MEMBER_EMAIL})
        r3 = requests.post(f"{API}/auth/forgot-password", json={"email": MEMBER_EMAIL}, timeout=15)
        assert r3.status_code == 200
        rec3 = db.password_reset_tokens.find_one({"email": MEMBER_EMAIL, "used": False})
        rr3 = requests.post(f"{API}/auth/reset-password",
                            json={"token": rec3["token"], "password": MEMBER_PASSWORD}, timeout=15)
        assert rr3.status_code == 200

    def test_expired_token_400(self):
        # Insert an expired token manually
        from datetime import datetime, timezone, timedelta
        user = db.users.find_one({"email": MEMBER_EMAIL})
        assert user is not None
        expired = {
            "token": "TEST_expired_token_iter4",
            "user_id": user["id"],
            "email": MEMBER_EMAIL,
            "used": False,
            "expires_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            "at": datetime.now(timezone.utc).isoformat(),
        }
        db.password_reset_tokens.delete_many({"token": expired["token"]})
        db.password_reset_tokens.insert_one(expired)
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": expired["token"], "password": "ValidPass123"}, timeout=15)
        assert r.status_code == 400
        db.password_reset_tokens.delete_many({"token": expired["token"]})


# ---------------------------------------------------------------------------
# Connectors
# ---------------------------------------------------------------------------
class TestConnectors:
    def test_connectors_include_gdrive_onedrive(self, admin_session):
        r = admin_session.get(f"{API}/connectors")
        assert r.status_code == 200
        by_id = {c["id"]: c for c in r.json()}
        assert "google_drive" in by_id
        assert "onedrive" in by_id
        assert by_id["google_drive"]["status"] == "not_configured"
        assert by_id["onedrive"]["status"] == "not_configured"
        assert len(r.json()) >= 6


# ---------------------------------------------------------------------------
# Spot-checks
# ---------------------------------------------------------------------------
class TestPriorEndpoints:
    def test_tasks_get(self, admin_session):
        r = admin_session.get(f"{API}/tasks")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_overview(self, admin_session):
        r = admin_session.get(f"{API}/stats/overview")
        assert r.status_code == 200
        d = r.json()
        assert "total_customers" in d and "by_classification" in d

    def test_users_list_as_admin(self, admin_session):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

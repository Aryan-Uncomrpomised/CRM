"""Iteration 5 - Invite-based user creation, signup, admin approval, backfill."""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://engage-track-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@voyageCRM.com"
ADMIN_PASSWORD = "Admin@123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def unique_suffix():
    return uuid.uuid4().hex[:8]


# ---------- SIGNUP ----------

class TestSignup:
    def test_signup_valid(self, unique_suffix, mongo):
        email = f"iter5-signup-{unique_suffix}@voyagecrm.co"
        r = requests.post(f"{API}/auth/signup", json={"email": email, "name": "Signup User"})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        u = mongo.users.find_one({"email": email})
        assert u is not None
        assert u.get("status") == "pending"
        assert u.get("password_hash") in (None,)

    def test_signup_free_email_domain(self, unique_suffix):
        for dom in ["gmail.com", "yahoo.com", "outlook.com"]:
            r = requests.post(f"{API}/auth/signup",
                              json={"email": f"iter5-{unique_suffix}-{dom.split('.')[0]}@{dom}", "name": "X"})
            assert r.status_code == 400, f"{dom}: {r.status_code} {r.text}"

    def test_signup_missing_name(self, unique_suffix):
        r = requests.post(f"{API}/auth/signup",
                          json={"email": f"iter5-noname-{unique_suffix}@voyagecrm.co", "name": ""})
        assert r.status_code in (400, 422), r.text

    def test_signup_duplicate(self, unique_suffix):
        email = f"iter5-dup-{unique_suffix}@voyagecrm.co"
        r1 = requests.post(f"{API}/auth/signup", json={"email": email, "name": "Dup"})
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/signup", json={"email": email, "name": "Dup"})
        assert r2.status_code == 400, r2.text

    def test_pending_cannot_login(self, unique_suffix):
        email = f"iter5-pendinglogin-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "P"})
        # user has no password. Any password should give 401
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Whatever@123"})
        assert r.status_code == 401, r.text

    def test_signup_creates_admin_notification(self, unique_suffix, admin_session):
        email = f"iter5-notify-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "Notify Me"})
        r = admin_session.get(f"{API}/notifications")
        assert r.status_code == 200
        kinds = [n.get("kind") for n in r.json() if email in (n.get("body") or "")]
        assert "user_signup" in kinds, f"user_signup notification missing: {r.json()[:5]}"


# ---------- CREATE USER (admin, no password → invite) ----------

class TestAdminCreateUserInvite:
    def test_create_user_without_password_triggers_invite(self, admin_session, unique_suffix, mongo):
        email = f"iter5-invite-{unique_suffix}@voyagecrm.co"
        r = admin_session.post(f"{API}/users", json={"email": email, "name": "Invite U", "role": "member"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "active"
        assert body["has_password"] is False
        # invite token created
        tok = mongo.password_reset_tokens.find_one({"email": email, "used": False, "kind": "invite"})
        assert tok is not None, "invite token not created"
        assert tok.get("expires_at") is not None

        # cannot login until password set
        login = requests.post(f"{API}/auth/login", json={"email": email, "password": "AnyPass@123"})
        assert login.status_code == 401

        # complete reset-password with invite token
        rp = requests.post(f"{API}/auth/reset-password",
                           json={"token": tok["token"], "password": "NewPass@1234"})
        assert rp.status_code == 200, rp.text

        # now login works
        login2 = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": "NewPass@1234"})
        assert login2.status_code == 200, login2.text

        # has_password now true
        users = admin_session.get(f"{API}/users").json()
        me = [u for u in users if u["email"] == email][0]
        assert me["has_password"] is True

    def test_create_user_with_password_backcompat(self, admin_session, unique_suffix, mongo):
        email = f"iter5-withpw-{unique_suffix}@voyagecrm.co"
        r = admin_session.post(f"{API}/users",
                               json={"email": email, "name": "PW U", "role": "member", "password": "InitPass@1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["has_password"] is True
        tok = mongo.password_reset_tokens.find_one({"email": email, "kind": "invite"})
        assert tok is None, "no invite token should be created when password provided"


# ---------- APPROVE ----------

class TestApprove:
    def test_approve_pending_user(self, admin_session, unique_suffix, mongo):
        email = f"iter5-approve-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "App U"})
        u = mongo.users.find_one({"email": email})
        r = admin_session.post(f"{API}/users/{u['id']}/approve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"
        tok = mongo.password_reset_tokens.find_one({"email": email, "kind": "invite", "used": False})
        assert tok is not None

        # Complete reset with token
        rp = requests.post(f"{API}/auth/reset-password",
                           json={"token": tok["token"], "password": "MyPass@1234"})
        assert rp.status_code == 200, rp.text
        login = requests.post(f"{API}/auth/login", json={"email": email, "password": "MyPass@1234"})
        assert login.status_code == 200

    def test_approve_already_active_no_dup(self, admin_session, unique_suffix, mongo):
        email = f"iter5-approveactive-{unique_suffix}@voyagecrm.co"
        r0 = admin_session.post(f"{API}/users",
                                json={"email": email, "name": "A A", "role": "member",
                                      "password": "InitPass@1"})
        uid = r0.json()["id"]
        before = mongo.password_reset_tokens.count_documents({"email": email})
        r = admin_session.post(f"{API}/users/{uid}/approve")
        assert r.status_code == 200
        assert r.json()["status"] == "active"
        after = mongo.password_reset_tokens.count_documents({"email": email})
        assert after == before, "no new token should be issued"

    def test_approve_non_admin_forbidden(self, admin_session, unique_suffix, mongo):
        # Create a member user with password
        mem_email = f"iter5-memapp-{unique_suffix}@voyagecrm.co"
        admin_session.post(f"{API}/users",
                           json={"email": mem_email, "name": "Mem", "role": "member",
                                 "password": "MemPass@123"})
        mem = requests.Session()
        lr = mem.post(f"{API}/auth/login", json={"email": mem_email, "password": "MemPass@123"})
        assert lr.status_code == 200

        # Create a pending user via signup
        pending_email = f"iter5-pendingtarget-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": pending_email, "name": "Pen"})
        pu = mongo.users.find_one({"email": pending_email})

        r = mem.post(f"{API}/users/{pu['id']}/approve")
        assert r.status_code == 403, r.text

    def test_approve_creates_notification(self, admin_session, unique_suffix, mongo):
        email = f"iter5-appnotif-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "Notif App"})
        u = mongo.users.find_one({"email": email})
        admin_session.post(f"{API}/users/{u['id']}/approve")
        notifs = admin_session.get(f"{API}/notifications").json()
        kinds = [n.get("kind") for n in notifs if email in (n.get("body") or "")]
        assert "user_approved" in kinds


# ---------- FORGOT PASSWORD ----------

class TestForgotPassword:
    def test_forgot_pending_no_token(self, unique_suffix, mongo):
        email = f"iter5-forgotpen-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "F P"})
        # Reset tokens (from /auth/forgot-password) do NOT set a kind field.
        before = mongo.password_reset_tokens.count_documents({"email": email, "kind": {"$exists": False}})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        assert r.json().get("ok") is True
        after_reset = mongo.password_reset_tokens.count_documents({"email": email, "kind": {"$exists": False}})
        assert after_reset == before, "should not create reset token for pending user"

    def test_forgot_active_creates_token(self, admin_session, unique_suffix, mongo):
        email = f"iter5-forgotact-{unique_suffix}@voyagecrm.co"
        admin_session.post(f"{API}/users",
                           json={"email": email, "name": "F A", "role": "member",
                                 "password": "Pass@1234"})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        tok = mongo.password_reset_tokens.find_one({"email": email, "kind": {"$exists": False}})
        assert tok is not None, "reset token should be created for active user"

    def test_forgot_unknown_ok(self, unique_suffix):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": f"iter5-nobody-{unique_suffix}@voyagecrm.co"})
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- LIST / TEAM ----------

class TestListing:
    def test_get_users_has_status_and_has_password(self, admin_session):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200
        users = r.json()
        assert len(users) > 0
        for u in users:
            assert "status" in u
            assert "has_password" in u

    def test_admin_backfill_active(self, admin_session):
        users = admin_session.get(f"{API}/users").json()
        admin = [u for u in users if u["email"].lower() == ADMIN_EMAIL.lower()][0]
        assert admin["status"] == "active"
        # all users should have status field (backfilled)
        for u in users:
            assert u.get("status") in ("active", "pending", "disabled")

    def test_team_excludes_pending(self, admin_session, unique_suffix, mongo):
        email = f"iter5-teampen-{unique_suffix}@voyagecrm.co"
        requests.post(f"{API}/auth/signup", json={"email": email, "name": "Team Pending"})
        r = admin_session.get(f"{API}/team")
        assert r.status_code == 200
        team = r.json()
        # /api/team returns list of names (strings)
        names = [m if isinstance(m, str) else m.get("name") for m in team]
        assert "Team Pending" not in names


# ---------- REGRESSION: prior iteration flows ----------

class TestRegression:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200

    def test_tasks_crud(self, admin_session):
        r = admin_session.get(f"{API}/tasks")
        assert r.status_code == 200

    def test_documents_list(self, admin_session):
        r = admin_session.get(f"{API}/documents")
        assert r.status_code in (200,)

    def test_stats_overview(self, admin_session):
        r = admin_session.get(f"{API}/stats/overview")
        assert r.status_code == 200

    def test_customers_list(self, admin_session):
        r = admin_session.get(f"{API}/customers")
        assert r.status_code == 200

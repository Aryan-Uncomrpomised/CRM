from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import random
import httpx
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
mongo_url = os.environ.get('MONGO_URL', 'mongodb+srv://aryansaxena941_db_user:TVrTbBPkNPUW83z2@cluster0.h8sdvpb.mongodb.net/voyage_crm?retryWrites=true&w=majority&appName=Cluster0')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'voyage_crm')]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", "r4miVG81bQhr8Yq5uSUcTUM9_vwXfjLqYQXbFNy6fCktgWjI-1Bbfq4TWjweM1Xg")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Voyage CRM")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("voyage-crm")

# -----------------------------------------------------------------------------
# Password / JWT helpers
# -----------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 12),
               "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 12, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24 * 7, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
Classification = Literal["visitor", "prospect", "prime_prospect", "customer", "subscriber"]
Category = Literal["consumer", "b2b", "investor", "fund"]
Channel = Literal["email", "sms", "whatsapp"]
EventType = Literal["visit", "add_to_cart", "address_added", "payment_attempt",
                    "order_completed", "subscription_started", "subscription_renewed"]
TaskStatus = Literal["open", "in_progress", "waiting", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
UserRole = Literal["admin", "manager", "member"]
UserStatus = Literal["pending", "active", "disabled"]

FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com",
    "aol.com", "icloud.com", "me.com", "protonmail.com", "proton.me",
    "live.com", "msn.com", "rediffmail.com", "mail.com", "yandex.com",
    "zoho.com", "gmx.com", "example.com", "test.com",
}

def is_official_email(email: str) -> bool:
    domain = (email or "").lower().split("@")[-1]
    return bool(domain) and domain not in FREE_EMAIL_DOMAINS

# Keyword → tag map used to auto-classify tasks
TASK_KEYWORD_TAGS = [
    (["investor", "vc", "venture", "raise", "fundraise", "pitch", "deck", "cap table"], "investor"),
    (["fund", "pe ", "hedge", "lp ", "family office"], "fund"),
    (["b2b", "wholesale", "bulk", "reseller", "retail partner", "distributor"], "b2b"),
    (["linkedin", "outreach", "cold intro"], "outreach"),
    (["shopify", "odoo", "sync", "webhook"], "integration"),
    (["reminder", "queue", "log", "ops"], "ops"),
    (["campaign", "creative", "ad ", "budget"], "marketing"),
    (["urgent", "asap", "immediately"], "urgent"),
]

def auto_tag_task(text: str) -> List[str]:
    t = (text or "").lower()
    tags = []
    for keywords, tag in TASK_KEYWORD_TAGS:
        if any(k in t for k in keywords):
            if tag not in tags:
                tags.append(tag)
    return tags

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: Optional[str] = None
    country: Optional[str] = None
    category: Category = "consumer"
    company: Optional[str] = None
    title: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = None  # user name who owns this record
    classification: Classification = "visitor"
    total_orders: int = 0
    total_spent: float = 0.0
    last_order_at: Optional[str] = None
    subscription_active: bool = False
    subscription_renewal_at: Optional[str] = None
    tags: List[str] = []
    source: Literal["shopify", "odoo", "manual"] = "shopify"
    avatar_url: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CustomerCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    country: Optional[str] = None
    category: Category = "consumer"
    company: Optional[str] = None
    title: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    classification: Classification = "visitor"
    source: Literal["shopify", "odoo", "manual"] = "manual"

class JourneyEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    type: EventType
    detail: str = ""
    amount: Optional[float] = None
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Segment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    # rule tree: { field, op, value }
    rules: List[dict] = []
    match: Literal["all", "any"] = "all"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Automation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    segment_id: str
    trigger: Literal["scheduled", "manual", "on_event"] = "manual"
    channel: Channel = "email"
    subject: str = ""
    message: str
    schedule_days: int = 0  # e.g., 7 = 7 days after last order
    active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    channel: Literal["instagram", "facebook", "tiktok", "twitter", "linkedin", "google_ads"]
    objective: str
    content: str
    budget: float = 0.0
    scheduled_at: Optional[str] = None
    status: Literal["draft", "scheduled", "live", "completed"] = "draft"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReminderLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str
    channel: Channel
    subject: str = ""
    message: str
    status: Literal["sent", "failed", "queued", "simulated"] = "sent"
    automation_id: Optional[str] = None
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Followup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    author: str = "Admin"
    note: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ContactNote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    author: str = "Admin"
    note: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ScheduledReminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str = ""
    channel: Channel = "email"
    subject: str = ""
    message: str
    scheduled_at: str  # ISO datetime — poller dispatches when now >= this
    status: Literal["pending", "sent", "failed", "cancelled"] = "pending"
    dispatched_at: Optional[str] = None
    error: Optional[str] = None
    created_by: str = "Admin"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ActivityEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    kind: str  # edit | stage_changed | note_added | task_created | document_attached
               # reminder_scheduled | reminder_sent | reminder_failed | reminder_cancelled | message_sent
    detail: str = ""
    meta: dict = {}
    actor: str = "system"
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    assignee: str = "Admin"
    owner: Optional[str] = None  # creator; can delegate/delete
    status: TaskStatus = "open"
    priority: TaskPriority = "medium"
    due_date: Optional[str] = None
    related_customer_id: Optional[str] = None
    related_customer_name: Optional[str] = None
    tags: List[str] = []
    followups: List[Followup] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    closed_at: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    assignee: str = "Admin"
    priority: TaskPriority = "medium"
    due_date: Optional[str] = None
    related_customer_id: Optional[str] = None
    tags: List[str] = []

DocumentKind = Literal["pitch_deck", "proposal", "contract", "spreadsheet", "other"]
DocumentSource = Literal["google_drive", "onedrive", "link"]

class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    kind: DocumentKind = "other"
    source: DocumentSource = "link"
    category: Category = "consumer"
    related_customer_id: Optional[str] = None
    related_customer_name: Optional[str] = None
    owner: str = "Admin"
    description: str = ""
    tags: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DocumentCreate(BaseModel):
    name: str
    url: str
    kind: DocumentKind = "other"
    source: DocumentSource = "link"
    category: Category = "consumer"
    related_customer_id: Optional[str] = None
    description: str = ""
    tags: List[str] = []

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole = "member"
    status: UserStatus = "active"
    has_password: bool = False
    created_at: str

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    role: UserRole = "member"
    password: Optional[str] = None  # if omitted → invite email flow

class SignupIn(BaseModel):
    email: EmailStr
    name: str
    password: str

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recipient: str  # team member name
    kind: Literal["task_assigned", "task_updated", "task_followup", "task_closed", "user_created", "user_signup", "user_approved", "document_added"] = "task_assigned"
    title: str
    body: str = ""
    task_id: Optional[str] = None
    read: bool = False
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# -----------------------------------------------------------------------------
# App / router
# -----------------------------------------------------------------------------
app = FastAPI(title="Voyage CRM")
api = APIRouter(prefix="/api")

_cors_env = os.environ.get("CORS_ORIGINS", "*").strip()
if _cors_env == "*" or not _cors_env:
    _cors_kwargs = {"allow_origin_regex": ".*"}
else:
    _cors_kwargs = {"allow_origins": [o.strip() for o in _cors_env.split(",") if o.strip()]}

app.add_middleware(
    CORSMiddleware,
    **_cors_kwargs,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Auth endpoints
# -----------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    status = user.get("status", "active")
    if status == "pending":
        raise HTTPException(status_code=401, detail="Your account is awaiting admin approval.")
    if status == "disabled":
        raise HTTPException(status_code=401, detail="This account has been disabled.")
    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Your account has no password yet. Check your email for a set-password link.")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

# -----------------------------------------------------------------------------
# Customers
# -----------------------------------------------------------------------------
RESTRICTED_CATEGORIES = {"b2b", "investor", "fund"}

def can_view_category(user: dict, category: Optional[str]) -> bool:
    if not category or category == "consumer":
        return True
    if category in RESTRICTED_CATEGORIES:
        return user.get("role") == "admin"
    return True

@api.get("/customers", response_model=List[Customer])
async def list_customers(q: Optional[str] = None, classification: Optional[str] = None,
                         category: Optional[str] = None,
                         current: dict = Depends(get_current_user)):
    is_admin = current.get("role") == "admin"
    query = {}
    if classification and classification != "all":
        query["classification"] = classification
    if category and category != "all":
        if not can_view_category(current, category):
            raise HTTPException(403, "Admin access required for this category")
        query["category"] = category
    elif not is_admin:
        # Hide restricted categories from non-admins
        query["category"] = {"$nin": list(RESTRICTED_CATEGORIES)}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    for d in docs:
        d.setdefault("category", "consumer")
    return docs

@api.post("/customers", response_model=Customer)
async def create_customer(body: CustomerCreate, current: dict = Depends(get_current_user)):
    if not can_view_category(current, body.category):
        raise HTTPException(403, "Admin access required to create this category")
    c = Customer(**body.model_dump(), owner=current.get("name") or "Admin")
    await db.customers.insert_one(c.model_dump())
    return c

@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    c.setdefault("category", "consumer")
    if not can_view_category(current, c.get("category")):
        raise HTTPException(403, "Admin access required to view this contact")
    events = await db.events.find({"customer_id": customer_id}, {"_id": 0}).sort("at", -1).to_list(200)
    reminders = await db.reminders.find({"customer_id": customer_id}, {"_id": 0}).sort("at", -1).to_list(50)
    notes = await db.contact_notes.find({"customer_id": customer_id}, {"_id": 0}).sort("at", -1).to_list(200)
    scheduled = await db.scheduled_reminders.find(
        {"customer_id": customer_id}, {"_id": 0}
    ).sort("scheduled_at", 1).to_list(100)
    # Documents attached to this contact — hide restricted ones for non-admins
    docs_all = await db.documents.find(
        {"related_customer_id": customer_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    is_admin = current.get("role") == "admin"
    documents = [
        d for d in docs_all
        if is_admin or not _doc_needs_admin(d.get("kind", "other"), d.get("category", "consumer"))
    ]
    activity = await db.activity_log.find(
        {"customer_id": customer_id}, {"_id": 0}
    ).sort("at", -1).to_list(300)
    return {
        "customer": c,
        "events": events,
        "reminders": reminders,
        "notes": notes,
        "scheduled": scheduled,
        "documents": documents,
        "activity": activity,
    }

@api.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        return {"deleted": 0}
    is_owner = c.get("owner") == current.get("name")
    if not is_owner and current.get("role") != "admin":
        raise HTTPException(403, "Only the owner or an admin can delete this record")
    r = await db.customers.delete_one({"id": customer_id})
    await db.events.delete_many({"customer_id": customer_id})
    return {"deleted": r.deleted_count}


# --- Edit / Notes / Scheduled reminders / Bulk actions -------------------------

_EDITABLE_CUSTOMER_FIELDS = {
    "name", "email", "phone", "country", "company", "title",
    "linkedin_url", "notes", "category", "classification", "tags", "avatar_url",
}


async def _log_activity(customer_id: str, kind: str, detail: str = "",
                        actor: str = "system", meta: Optional[dict] = None) -> None:
    """Append a timestamped activity entry for a contact. Best-effort — swallow errors."""
    try:
        entry = ActivityEvent(
            customer_id=customer_id,
            kind=kind,
            detail=detail,
            actor=actor,
            meta=meta or {},
        )
        await db.activity_log.insert_one(entry.model_dump())
    except Exception as e:
        logger.error(f"_log_activity failed for {customer_id}/{kind}: {e}")


@api.patch("/customers/{customer_id}")
async def update_customer(customer_id: str, patch: dict, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not can_view_category(current, c.get("category", "consumer")):
        raise HTTPException(403, "Admin access required to edit this contact")

    clean: dict = {}
    for k, v in patch.items():
        if k in _EDITABLE_CUSTOMER_FIELDS:
            clean[k] = v

    # If category is being changed into a restricted one, require admin.
    new_cat = clean.get("category")
    if new_cat and new_cat != c.get("category"):
        if not can_view_category(current, new_cat):
            raise HTTPException(403, "Admin access required to move this contact into that category")

    if not clean:
        return c

    # Compute a diff for the activity log — only fields whose value actually changed.
    changed = {k: v for k, v in clean.items() if c.get(k) != v}
    await db.customers.update_one({"id": customer_id}, {"$set": clean})
    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})

    actor = current.get("name") or "Admin"
    if "classification" in changed:
        await _log_activity(
            customer_id, "stage_changed",
            f"{c.get('classification')} → {changed['classification']}",
            actor,
            {"from": c.get("classification"), "to": changed["classification"]},
        )
    other_changed = {k: v for k, v in changed.items() if k != "classification"}
    if other_changed:
        await _log_activity(
            customer_id, "edit",
            f"Updated: {', '.join(other_changed.keys())}",
            actor,
            {"fields": list(other_changed.keys())},
        )
    return updated


@api.get("/customers/{customer_id}/notes", response_model=List[ContactNote])
async def list_notes(customer_id: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not can_view_category(current, c.get("category", "consumer")):
        raise HTTPException(403, "Admin access required to view this contact")
    return await db.contact_notes.find({"customer_id": customer_id}, {"_id": 0}).sort("at", -1).to_list(200)


@api.post("/customers/{customer_id}/notes", response_model=ContactNote)
async def add_note(customer_id: str, body: dict, current: dict = Depends(get_current_user)):
    text = (body.get("note") or "").strip()
    if not text:
        raise HTTPException(400, "Note text is required")
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not can_view_category(current, c.get("category", "consumer")):
        raise HTTPException(403, "Admin access required to note this contact")
    n = ContactNote(
        customer_id=customer_id,
        author=current.get("name") or "Admin",
        note=text,
    )
    await db.contact_notes.insert_one(n.model_dump())
    await _log_activity(
        customer_id, "note_added",
        text[:80] + ("…" if len(text) > 80 else ""),
        current.get("name") or "Admin",
        {"note_id": n.id},
    )
    return n


@api.delete("/customers/{customer_id}/notes/{note_id}")
async def delete_note(customer_id: str, note_id: str, current: dict = Depends(get_current_user)):
    note = await db.contact_notes.find_one({"id": note_id, "customer_id": customer_id}, {"_id": 0})
    if not note:
        return {"deleted": 0}
    if note.get("author") != current.get("name") and current.get("role") != "admin":
        raise HTTPException(403, "Only the author or an admin can delete this note")
    r = await db.contact_notes.delete_one({"id": note_id, "customer_id": customer_id})
    return {"deleted": r.deleted_count}


@api.get("/customers/{customer_id}/schedule", response_model=List[ScheduledReminder])
async def list_schedules(customer_id: str, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not can_view_category(current, c.get("category", "consumer")):
        raise HTTPException(403, "Admin access required to view this contact")
    return await db.scheduled_reminders.find(
        {"customer_id": customer_id}, {"_id": 0}
    ).sort("scheduled_at", 1).to_list(100)


@api.post("/customers/{customer_id}/schedule", response_model=ScheduledReminder)
async def schedule_reminder(customer_id: str, body: dict, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not can_view_category(current, c.get("category", "consumer")):
        raise HTTPException(403, "Admin access required")
    scheduled_at = body.get("scheduled_at")
    message = (body.get("message") or "").strip()
    if not scheduled_at or not message:
        raise HTTPException(400, "scheduled_at and message are required")
    # Normalize scheduled_at to ISO string with tz
    try:
        dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        scheduled_iso = dt.astimezone(timezone.utc).isoformat()
    except Exception:
        raise HTTPException(400, "scheduled_at must be an ISO datetime")
    s = ScheduledReminder(
        customer_id=customer_id,
        customer_name=c.get("name", ""),
        channel=body.get("channel", "email"),
        subject=body.get("subject", ""),
        message=message,
        scheduled_at=scheduled_iso,
        created_by=current.get("name") or "Admin",
    )
    await db.scheduled_reminders.insert_one(s.model_dump())
    await _log_activity(
        customer_id, "reminder_scheduled",
        f"{s.channel} · {fmt_dt(scheduled_iso)}",
        current.get("name") or "Admin",
        {"scheduled_id": s.id, "channel": s.channel, "scheduled_at": scheduled_iso},
    )
    return s


def fmt_dt(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        return iso


@api.delete("/scheduled/{sid}")
async def cancel_schedule(sid: str, current: dict = Depends(get_current_user)):
    s = await db.scheduled_reminders.find_one({"id": sid}, {"_id": 0})
    if not s:
        return {"deleted": 0}
    if s.get("created_by") != current.get("name") and current.get("role") != "admin":
        raise HTTPException(403, "Only the creator or an admin can cancel this")
    if s.get("status") != "pending":
        # Non-pending → hard delete history entry
        r = await db.scheduled_reminders.delete_one({"id": sid})
        return {"deleted": r.deleted_count}
    await db.scheduled_reminders.update_one({"id": sid}, {"$set": {"status": "cancelled"}})
    await _log_activity(
        s["customer_id"], "reminder_cancelled",
        f"{s.get('channel','')} · {fmt_dt(s.get('scheduled_at',''))}",
        current.get("name") or "Admin",
        {"scheduled_id": sid},
    )
    return {"deleted": 1, "cancelled": True}


@api.post("/customers/bulk_send")
async def customers_bulk_send(body: dict, current: dict = Depends(get_current_user)):
    ids = body.get("customer_ids") or []
    channel = body.get("channel", "email")
    subject = body.get("subject", "")
    message = (body.get("message") or "").strip()
    if not ids or not message:
        raise HTTPException(400, "customer_ids and message are required")
    if len(ids) > 500:
        raise HTTPException(400, "Batch size limited to 500 recipients")

    results = {"sent": 0, "simulated": 0, "failed": 0, "skipped": 0}
    cursor = db.customers.find({"id": {"$in": ids}}, {"_id": 0})
    async for c in cursor:
        if not can_view_category(current, c.get("category", "consumer")):
            results["skipped"] += 1
            continue
        try:
            status = await dispatch_message(c, channel, subject, message)
            if status == "sent":
                results["sent"] += 1
            elif status == "simulated":
                results["simulated"] += 1
            else:
                results["failed"] += 1
        except Exception as e:
            logger.error(f"bulk_send failed for {c.get('id')}: {e}")
            results["failed"] += 1
    return {"ok": True, "totals": results, "requested": len(ids)}


@api.post("/customers/bulk_tasks")
async def customers_bulk_tasks(body: dict, current: dict = Depends(get_current_user)):
    ids = body.get("customer_ids") or []
    title = (body.get("title") or "").strip()
    if not ids or not title:
        raise HTTPException(400, "customer_ids and title are required")
    if len(ids) > 500:
        raise HTTPException(400, "Batch size limited to 500 tasks")
    assignee = body.get("assignee") or current.get("name") or "Admin"
    priority = body.get("priority", "medium")
    due_date = body.get("due_date")
    tags_in = body.get("tags") or []
    description = body.get("description", "")

    created = 0
    cursor = db.customers.find({"id": {"$in": ids}}, {"_id": 0})
    async for c in cursor:
        if not can_view_category(current, c.get("category", "consumer")):
            continue
        auto = auto_tag_task(f"{title}\n{description}")
        merged_tags = list({*(tags_in or []), *auto})
        t = Task(
            title=title,
            description=description,
            assignee=assignee,
            priority=priority,
            due_date=due_date,
            related_customer_id=c["id"],
            related_customer_name=c.get("name"),
            tags=merged_tags,
            owner=current.get("name") or "Admin",
        )
        await db.tasks.insert_one(t.model_dump())
        await _log_activity(
            c["id"], "task_created",
            f"{t.title} · {t.priority}" + (f" · due {t.due_date}" if t.due_date else ""),
            current.get("name") or "Admin",
            {"task_id": t.id, "assignee": t.assignee, "priority": t.priority, "bulk": True},
        )
        if t.assignee != (current.get("name") or "Admin"):
            await notify(t.assignee, "task_assigned",
                         f"New task assigned: {t.title}",
                         f"By {current.get('name','Admin')} · bulk create", task_id=t.id)
        created += 1
    return {"ok": True, "created": created, "requested": len(ids)}

# -----------------------------------------------------------------------------
# Journey events
# -----------------------------------------------------------------------------
@api.post("/customers/{customer_id}/events")
async def add_event(customer_id: str, event: dict, _: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    ev = JourneyEvent(customer_id=customer_id, type=event.get("type", "visit"),
                     detail=event.get("detail", ""), amount=event.get("amount"))
    await db.events.insert_one(ev.model_dump())
    # Auto-reclassify
    new_class = classify_from_event(customer["classification"], ev.type)
    updates = {"classification": new_class}
    if ev.type == "order_completed":
        updates["total_orders"] = customer.get("total_orders", 0) + 1
        updates["total_spent"] = customer.get("total_spent", 0) + (ev.amount or 0)
        updates["last_order_at"] = ev.at
    if ev.type == "subscription_started":
        updates["subscription_active"] = True
        updates["subscription_renewal_at"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.customers.update_one({"id": customer_id}, {"$set": updates})
    return ev

def classify_from_event(current: str, event_type: str) -> str:
    order = ["visitor", "prospect", "prime_prospect", "customer", "subscriber"]
    mapping = {
        "visit": "visitor",
        "add_to_cart": "prospect",
        "address_added": "prime_prospect",
        "payment_attempt": "prime_prospect",
        "order_completed": "customer",
        "subscription_started": "subscriber",
        "subscription_renewed": "subscriber",
    }
    target = mapping.get(event_type, current)
    return target if order.index(target) >= order.index(current) else current

# -----------------------------------------------------------------------------
# Segments
# -----------------------------------------------------------------------------
@api.get("/segments", response_model=List[Segment])
async def list_segments(_: dict = Depends(get_current_user)):
    return await db.segments.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/segments", response_model=Segment)
async def create_segment(body: Segment, _: dict = Depends(get_current_user)):
    await db.segments.insert_one(body.model_dump())
    return body

@api.delete("/segments/{sid}")
async def delete_segment(sid: str, _: dict = Depends(get_current_user)):
    r = await db.segments.delete_one({"id": sid})
    return {"deleted": r.deleted_count}

@api.post("/segments/{sid}/preview")
async def preview_segment(sid: str, _: dict = Depends(get_current_user)):
    seg = await db.segments.find_one({"id": sid}, {"_id": 0})
    if not seg:
        raise HTTPException(404, "Segment not found")
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    matched = [c for c in customers if match_rules(c, seg["rules"], seg.get("match", "all"))]
    return {
        "count": len(matched),
        "sample": matched[:20],
        "matched_ids": [c["id"] for c in matched],
    }

def match_rules(customer: dict, rules: List[dict], match: str) -> bool:
    if not rules:
        return True
    def eval_rule(r):
        field = r.get("field")
        op = r.get("op")
        val = r.get("value")
        cval = customer.get(field)
        if field == "days_since_last_order":
            if not customer.get("last_order_at"):
                return False
            last = datetime.fromisoformat(customer["last_order_at"].replace("Z", "+00:00"))
            cval = (datetime.now(timezone.utc) - last).days
        try:
            val_num = float(val)
        except (TypeError, ValueError):
            val_num = None
        if op == "eq":
            return str(cval) == str(val)
        if op == "neq":
            return str(cval) != str(val)
        if op == "gt" and val_num is not None and cval is not None:
            return float(cval) > val_num
        if op == "lt" and val_num is not None and cval is not None:
            return float(cval) < val_num
        if op == "gte" and val_num is not None and cval is not None:
            return float(cval) >= val_num
        if op == "lte" and val_num is not None and cval is not None:
            return float(cval) <= val_num
        if op == "in":
            return cval in (val if isinstance(val, list) else [val])
        return False
    results = [eval_rule(r) for r in rules]
    return all(results) if match == "all" else any(results)

# -----------------------------------------------------------------------------
# Automations
# -----------------------------------------------------------------------------
@api.get("/automations", response_model=List[Automation])
async def list_automations(_: dict = Depends(get_current_user)):
    return await db.automations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/automations", response_model=Automation)
async def create_automation(body: Automation, _: dict = Depends(get_current_user)):
    await db.automations.insert_one(body.model_dump())
    return body

@api.patch("/automations/{aid}")
async def update_automation(aid: str, patch: dict, _: dict = Depends(get_current_user)):
    await db.automations.update_one({"id": aid}, {"$set": patch})
    doc = await db.automations.find_one({"id": aid}, {"_id": 0})
    return doc

@api.delete("/automations/{aid}")
async def delete_automation(aid: str, _: dict = Depends(get_current_user)):
    r = await db.automations.delete_one({"id": aid})
    return {"deleted": r.deleted_count}

@api.post("/automations/{aid}/run")
async def run_automation(aid: str, _: dict = Depends(get_current_user)):
    auto = await db.automations.find_one({"id": aid}, {"_id": 0})
    if not auto:
        raise HTTPException(404, "Automation not found")
    seg = await db.segments.find_one({"id": auto["segment_id"]}, {"_id": 0})
    if not seg:
        raise HTTPException(400, "Segment not found")
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    matched = [c for c in customers if match_rules(c, seg["rules"], seg.get("match", "all"))]
    sent, failed, simulated = 0, 0, 0
    for c in matched:
        status = await dispatch_message(c, auto["channel"], auto.get("subject", ""), auto["message"], aid)
        if status == "sent":
            sent += 1
        elif status == "simulated":
            simulated += 1
        else:
            failed += 1
    return {"matched": len(matched), "sent": sent + simulated, "delivered": sent, "simulated": simulated, "failed": failed}

# -----------------------------------------------------------------------------
# Messaging dispatch
# -----------------------------------------------------------------------------
async def dispatch_message(customer: dict, channel: str, subject: str, message: str, automation_id: Optional[str] = None) -> str:
    personalized = message.replace("{name}", customer.get("name", "")) \
                          .replace("{email}", customer.get("email", ""))
    subj = subject.replace("{name}", customer.get("name", ""))
    status = "sent"
    error_detail = ""
    if channel == "email":
        try:
            await send_email(customer["email"], subj or "A note from Voyage CRM", personalized)
        except Exception as e:
            logger.error(f"email failed: {e}")
            status = "failed"
            error_detail = str(e)[:200]
    else:
        # SMS / WhatsApp — Twilio credentials not configured in MVP, log as simulated
        status = "simulated"
    log = ReminderLog(customer_id=customer["id"], customer_name=customer["name"],
                     channel=channel, subject=subj, message=personalized,
                     status=status, automation_id=automation_id)
    doc = log.model_dump()
    if error_detail:
        doc["error"] = error_detail
    await db.reminders.insert_one(doc)
    return status

async def send_email(to: str, subject: str, html: str) -> None:
    # 1) Direct Resend API (self-hosted mode) — preferred if RESEND_API_KEY is set
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if resend_key:
        from_addr = os.environ.get(
            "RESEND_FROM",
            f"{EMAIL_FROM_NAME} <onboarding@resend.dev>",
        )
        payload = {"from": from_addr, "to": [to], "subject": subject, "html": html}
        async with httpx.AsyncClient(timeout=30) as client_h:
            r = await client_h.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            r.raise_for_status()
        return
    # 2) Fallback: Emergent-managed email
    if not EMAIL_KEY:
        raise RuntimeError("Email is not configured (set RESEND_API_KEY or EMERGENT_EMAIL_KEY)")
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    async with httpx.AsyncClient(timeout=30) as client_h:
        r = await client_h.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        r.raise_for_status()

# -----------------------------------------------------------------------------
# Reminders (log)
# -----------------------------------------------------------------------------
@api.get("/reminders", response_model=List[ReminderLog])
async def list_reminders(_: dict = Depends(get_current_user)):
    return await db.reminders.find({}, {"_id": 0}).sort("at", -1).to_list(500)

# -----------------------------------------------------------------------------
# Send test message (from a customer detail action)
# -----------------------------------------------------------------------------
@api.post("/customers/{customer_id}/send")
async def send_to_customer(customer_id: str, body: dict, current: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    channel = body.get("channel", "email")
    subject = body.get("subject", "")
    message = body.get("message", "")
    status = await dispatch_message(c, channel, subject, message)
    await _log_activity(
        customer_id, "message_sent",
        f"{channel} · {status}" + (f" · {subject}" if subject else ""),
        current.get("name") or "Admin",
        {"channel": channel, "status": status},
    )
    return {"ok": status in ("sent", "simulated"), "status": status}

# -----------------------------------------------------------------------------
# Campaigns
# -----------------------------------------------------------------------------
@api.get("/campaigns", response_model=List[Campaign])
async def list_campaigns(_: dict = Depends(get_current_user)):
    return await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/campaigns", response_model=Campaign)
async def create_campaign(body: Campaign, _: dict = Depends(get_current_user)):
    await db.campaigns.insert_one(body.model_dump())
    return body

@api.patch("/campaigns/{cid}")
async def update_campaign(cid: str, patch: dict, _: dict = Depends(get_current_user)):
    await db.campaigns.update_one({"id": cid}, {"$set": patch})
    return await db.campaigns.find_one({"id": cid}, {"_id": 0})

@api.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, _: dict = Depends(get_current_user)):
    r = await db.campaigns.delete_one({"id": cid})
    return {"deleted": r.deleted_count}

# -----------------------------------------------------------------------------
# Tasks (internal team task list)
# -----------------------------------------------------------------------------
DEFAULT_TEAM = ["Admin", "Aisha (Sales)", "Rahul (CS)", "Meera (Growth)", "Kunal (Ops)"]

async def get_team_members() -> List[str]:
    users = await db.users.find({"status": {"$ne": "pending"}}, {"_id": 0, "name": 1}).to_list(200)
    names = [u["name"] for u in users if u.get("name")]
    # Merge: DB users first, then defaults that aren't already present
    combined = []
    seen = set()
    for n in names + DEFAULT_TEAM:
        if n and n not in seen:
            combined.append(n)
            seen.add(n)
    return combined

async def notify(recipient: str, kind: str, title: str, body: str = "", task_id: Optional[str] = None):
    if not recipient:
        return
    n = Notification(recipient=recipient, kind=kind, title=title, body=body, task_id=task_id)
    await db.notifications.insert_one(n.model_dump())

@api.get("/team")
async def list_team(_: dict = Depends(get_current_user)):
    return await get_team_members()

@api.get("/tasks", response_model=List[Task])
async def list_tasks(status: Optional[str] = None, assignee: Optional[str] = None,
                     _: dict = Depends(get_current_user)):
    query = {}
    if status and status != "all":
        query["status"] = status
    if assignee and assignee != "all":
        query["assignee"] = assignee
    return await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/tasks", response_model=Task)
async def create_task(body: TaskCreate, user: dict = Depends(get_current_user)):
    related_name = None
    if body.related_customer_id:
        c = await db.customers.find_one({"id": body.related_customer_id}, {"_id": 0, "name": 1})
        related_name = c["name"] if c else None
    # Auto-tag from title + description
    auto = auto_tag_task(f"{body.title}\n{body.description}")
    tags = list(dict.fromkeys([*body.tags, *auto]))
    owner = user.get("name") or "Admin"
    t = Task(**{**body.model_dump(), "tags": tags},
             related_customer_name=related_name, owner=owner)
    await db.tasks.insert_one(t.model_dump())
    if t.assignee != owner:
        await notify(t.assignee, "task_assigned",
                     f"New task assigned: {t.title}",
                     f"By {owner} · priority {t.priority}",
                     task_id=t.id)
    if t.related_customer_id:
        await _log_activity(
            t.related_customer_id, "task_created",
            f"{t.title} · {t.priority}" + (f" · due {t.due_date}" if t.due_date else ""),
            owner,
            {"task_id": t.id, "assignee": t.assignee, "priority": t.priority},
        )
    return t

@api.patch("/tasks/{tid}")
async def update_task(tid: str, patch: dict, user: dict = Depends(get_current_user)):
    existing = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Task not found")
    patch = {k: v for k, v in patch.items() if k in
             {"title", "description", "assignee", "status", "priority", "due_date", "tags"}}
    # Re-run auto-tagging if title/description changed
    if "title" in patch or "description" in patch:
        text = f"{patch.get('title', existing['title'])}\n{patch.get('description', existing.get('description', ''))}"
        auto = auto_tag_task(text)
        current_tags = patch.get("tags", existing.get("tags", []))
        patch["tags"] = list(dict.fromkeys([*current_tags, *auto]))
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    if patch.get("status") == "done":
        patch["closed_at"] = patch["updated_at"]
    await db.tasks.update_one({"id": tid}, {"$set": patch})
    updated = await db.tasks.find_one({"id": tid}, {"_id": 0})
    # Notifications
    actor = user.get("name", "Admin")
    if "assignee" in patch and patch["assignee"] != existing.get("assignee"):
        await notify(patch["assignee"], "task_assigned",
                     f"Task reassigned to you: {updated['title']}",
                     f"By {actor}", task_id=tid)
    elif patch.get("status") == "done":
        await notify(existing.get("assignee"), "task_closed",
                     f"Task closed: {updated['title']}", f"By {actor}", task_id=tid)
    elif any(k in patch for k in ("status", "priority", "title", "description", "due_date")):
        await notify(existing.get("assignee"), "task_updated",
                     f"Task updated: {updated['title']}", f"By {actor}", task_id=tid)
    return updated

@api.post("/tasks/{tid}/followup")
async def add_followup(tid: str, body: dict, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    note = (body.get("note") or "").strip()
    if not note:
        raise HTTPException(400, "Note is required")
    author = body.get("author") or user.get("name", "Admin")
    fu = Followup(author=author, note=note)
    await db.tasks.update_one(
        {"id": tid},
        {"$push": {"followups": fu.model_dump()},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if t.get("assignee") and t["assignee"] != author:
        await notify(t["assignee"], "task_followup",
                     f"New follow-up on: {t['title']}",
                     f"{author}: {note[:120]}", task_id=tid)
    return await db.tasks.find_one({"id": tid}, {"_id": 0})

@api.post("/tasks/{tid}/close")
async def close_task(tid: str, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": tid},
                              {"$set": {"status": "done", "closed_at": now, "updated_at": now}})
    await notify(t.get("assignee"), "task_closed",
                 f"Task closed: {t['title']}", f"By {user.get('name', 'Admin')}", task_id=tid)
    return await db.tasks.find_one({"id": tid}, {"_id": 0})

@api.delete("/tasks/{tid}")
async def delete_task(tid: str, current: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        return {"deleted": 0}
    if t.get("owner") and t["owner"] != current.get("name") and current.get("role") != "admin":
        raise HTTPException(403, "Only the owner or an admin can delete this task")
    r = await db.tasks.delete_one({"id": tid})
    await db.notifications.delete_many({"task_id": tid})
    return {"deleted": r.deleted_count}


# -----------------------------------------------------------------------------
# Users (admin management)
# -----------------------------------------------------------------------------
def _user_public(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u["name"],
            "role": u.get("role", "member"),
            "status": u.get("status", "active"),
            "has_password": bool(u.get("password_hash")),
            "created_at": u.get("created_at")}

async def _issue_invite(user: dict, subject_prefix: str = "Welcome to Voyage CRM"):
    """Generate a password-set token and email it to the user."""
    token = _secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    await db.password_reset_tokens.insert_one({
        "token": token, "user_id": user["id"], "email": user["email"],
        "used": False, "expires_at": expires, "kind": "invite",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    link = f"{FRONTEND_URL}/reset-password?token={token}&invite=1"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px;">
      <h2 style="color: #0057FF; margin-bottom: 6px;">{subject_prefix}</h2>
      <p style="color:#555; margin-top:0;">Hi {user.get('name','')},</p>
      <p>You've been added to <strong>Voyage CRM</strong>. To finish activating your account, set your password below.</p>
      <p style="margin: 28px 0;">
        <a href="{link}"
           style="background: #0057FF; color: #fff; text-decoration: none; padding: 13px 26px; border-radius: 6px; font-weight: bold; display: inline-block;">
           Set my password
        </a>
      </p>
      <p style="color:#666; font-size:12px;">Or paste this into your browser:<br/>{link}</p>
      <p style="color:#999; font-size:11px;">This link expires in 48 hours.</p>
    </div>
    """
    try:
        await send_email(user["email"], f"{subject_prefix} — set your password", html)
    except Exception as e:
        logger.error(f"invite email failed for {user['email']}: {e}")
    logger.info(f"[invite] link for {user['email']}: {link}")
    return token

@api.get("/users", response_model=List[UserOut])
async def list_users(current: dict = Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_user_public(u) for u in users]

@api.post("/users", response_model=UserOut)
async def create_user(body: UserCreate, current: dict = Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    email = body.email.lower().strip()
    if not is_official_email(email):
        raise HTTPException(400, "Please use an official work email (free email providers are not allowed).")
    if body.password is not None and len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with this email already exists.")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "role": body.role,
        "status": "active",
        "password_hash": hash_password(body.password) if body.password else None,
        "created_at": now,
    }
    await db.users.insert_one(doc)
    invite_sent = False
    if not body.password:
        await _issue_invite(doc, "Welcome to Voyage CRM")
        invite_sent = True
    await notify(current.get("name", "Admin"), "user_created",
                 f"User created: {body.name}",
                 f"{email} · {body.role}" + (" · invite sent" if invite_sent else ""))
    return _user_public(doc)

@api.post("/users/{uid}/approve", response_model=UserOut)
async def approve_user(uid: str, current: dict = Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("status") == "active":
        return _user_public(user)
    await db.users.update_one({"id": uid}, {"$set": {"status": "active"}})
    updated = await db.users.find_one({"id": uid}, {"_id": 0})
    await _issue_invite(updated, "Your Voyage CRM account is approved")
    await notify(current.get("name", "Admin"), "user_approved",
                 f"User approved: {updated['name']}",
                 f"{updated['email']} · invite sent")
    return _user_public(updated)

@api.delete("/users/{uid}")
async def delete_user(uid: str, current: dict = Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    if uid == current.get("id"):
        raise HTTPException(400, "You cannot delete your own account.")
    r = await db.users.delete_one({"id": uid})
    await db.password_reset_tokens.delete_many({"user_id": uid})
    return {"deleted": r.deleted_count}


# -----------------------------------------------------------------------------
# Public sign-up
# -----------------------------------------------------------------------------
@api.post("/auth/signup")
async def signup(body: SignupIn, response: Response):
    email = body.email.lower().strip()
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with this email already exists.")
    
    total_users = await db.users.count_documents({})
    role = "admin" if total_users == 0 else "member"
    
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": name,
        "role": role,
        "status": "active",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    
    access = create_access_token(doc["id"], doc["email"])
    refresh = create_refresh_token(doc["id"])
    set_auth_cookies(response, access, refresh)
    
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "name": 1}).to_list(50)
    for a in admins:
        await notify(a["name"], "user_signup",
                     f"New user registered: {name}",
                     f"{email} · {role}")
                     
    return {"id": doc["id"], "email": doc["email"], "name": doc["name"], "role": doc["role"]}

# -----------------------------------------------------------------------------
# Notifications
# -----------------------------------------------------------------------------
@api.get("/notifications", response_model=List[Notification])
async def list_notifications(current: dict = Depends(get_current_user)):
    # Return notifications where recipient matches the current user's name
    # PLUS anything targeting "Admin" if current is an admin (audit stream)
    name = current.get("name") or ""
    if current.get("role") == "admin":
        docs = await db.notifications.find({}, {"_id": 0}).sort("at", -1).to_list(100)
    else:
        docs = await db.notifications.find({"recipient": name}, {"_id": 0}).sort("at", -1).to_list(100)
    return docs

@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, _: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}

@api.post("/notifications/read-all")
async def read_all(_: dict = Depends(get_current_user)):
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


# -----------------------------------------------------------------------------
# Documents (pitch decks, proposals, contracts) — Google Drive / OneDrive links
# -----------------------------------------------------------------------------
DOC_KIND_CATEGORY_LOCK = {
    # Pitch decks + investor proposals are admin-only regardless of category
    "pitch_deck": True,
}

def _doc_needs_admin(kind: str, category: str) -> bool:
    if DOC_KIND_CATEGORY_LOCK.get(kind):
        return True
    if category in RESTRICTED_CATEGORIES:
        return True
    return False

@api.get("/documents", response_model=List[Document])
async def list_documents(kind: Optional[str] = None, category: Optional[str] = None,
                         q: Optional[str] = None,
                         current: dict = Depends(get_current_user)):
    is_admin = current.get("role") == "admin"
    query = {}
    if kind and kind != "all":
        query["kind"] = kind
    if category and category != "all":
        if _doc_needs_admin(kind or "", category) and not is_admin:
            raise HTTPException(403, "Admin access required for this category")
        query["category"] = category
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Non-admins never see pitch_deck / restricted category docs
    if not is_admin:
        docs = [d for d in docs if not _doc_needs_admin(d.get("kind", "other"), d.get("category", "consumer"))]
    return docs

@api.post("/documents", response_model=Document)
async def create_document(body: DocumentCreate, current: dict = Depends(get_current_user)):
    if _doc_needs_admin(body.kind, body.category) and current.get("role") != "admin":
        raise HTTPException(403, "Admin access required to add this document type")
    related_name = None
    if body.related_customer_id:
        c = await db.customers.find_one({"id": body.related_customer_id}, {"_id": 0, "name": 1})
        related_name = c["name"] if c else None
    d = Document(**body.model_dump(),
                 owner=current.get("name") or "Admin",
                 related_customer_name=related_name)
    await db.documents.insert_one(d.model_dump())
    await notify(d.owner, "document_added",
                 f"Document added: {d.name}",
                 f"{d.kind.replace('_', ' ')} · {d.category}")
    if d.related_customer_id:
        await _log_activity(
            d.related_customer_id, "document_attached",
            f"{d.name} ({d.kind.replace('_', ' ')})",
            current.get("name") or "Admin",
            {"document_id": d.id, "url": d.url, "kind": d.kind},
        )
    return d

@api.delete("/documents/{did}")
async def delete_document(did: str, current: dict = Depends(get_current_user)):
    d = await db.documents.find_one({"id": did}, {"_id": 0})
    if not d:
        return {"deleted": 0}
    if d.get("owner") != current.get("name") and current.get("role") != "admin":
        raise HTTPException(403, "Only the owner or an admin can delete this document")
    r = await db.documents.delete_one({"id": did})
    return {"deleted": r.deleted_count}


# -----------------------------------------------------------------------------
# Password reset (via Resend email)
# -----------------------------------------------------------------------------
import secrets as _secrets

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    # Always return ok=True to avoid email enumeration
    if user and user.get("status", "active") == "active":
        token = _secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": user["id"], "email": email,
            "used": False, "expires_at": expires,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px;">
          <h2 style="color: #0057FF;">Reset your Voyage CRM password</h2>
          <p>Hi {user.get('name', '')},</p>
          <p>Someone (hopefully you) requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
          <p style="margin: 24px 0;">
            <a href="{reset_link}"
               style="background: #0057FF; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
               Reset password
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">Or paste this link into your browser:<br/>{reset_link}</p>
          <p style="color: #999; font-size: 11px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        """
        try:
            await send_email(email, "Reset your Voyage CRM password", html)
        except Exception as e:
            logger.error(f"reset email failed: {e}")
        # Also log link to server log for local/dev testing
        logger.info(f"[password-reset] link for {email}: {reset_link}")
    return {"ok": True}

@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    rec = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(400, "Invalid or already used token")
    if rec["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(400, "Token has expired")
    await db.users.update_one({"id": rec["user_id"]},
                              {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}


# -----------------------------------------------------------------------------
# Connectors (Shopify + Odoo mock)
# -----------------------------------------------------------------------------
@api.get("/connectors")
async def list_connectors(_: dict = Depends(get_current_user)):
    default_ids = ["shopify", "odoo", "twilio", "resend", "google_drive", "onedrive"]
    default_data = {
        "shopify": {"name": "Shopify", "status": "connected"},
        "odoo": {"name": "Odoo POS", "status": "connected"},
        "twilio": {"name": "Twilio (SMS + WhatsApp)", "status": "not_configured"},
        "resend": {"name": "Resend (Email)", "status": "connected"},
        "google_drive": {"name": "Google Drive", "status": "not_configured"},
        "onedrive": {"name": "Microsoft OneDrive", "status": "not_configured"},
    }
    existing = {d["id"] async for d in db.connectors.find({}, {"_id": 0, "id": 1})}
    now = datetime.now(timezone.utc).isoformat()
    for cid in default_ids:
        if cid not in existing:
            data = default_data[cid]
            records = await db.customers.count_documents({"source": cid}) if cid in ("shopify", "odoo") else 0
            await db.connectors.insert_one({
                "id": cid, "name": data["name"], "status": data["status"],
                "last_sync": now if data["status"] == "connected" else None,
                "records": records,
            })
    docs = await db.connectors.find({}, {"_id": 0}).to_list(20)
    # Preserve stable order
    docs.sort(key=lambda d: default_ids.index(d["id"]) if d["id"] in default_ids else 999)
    return docs

async def _sync_odoo_live(clear_dummy: bool = True) -> int:
    odoo_url = os.environ.get("ODOO_URL", "https://simplability.odoo.com")
    odoo_db = os.environ.get("ODOO_DB", "simplability")
    odoo_key = os.environ.get("ODOO_API_KEY", "47d7e9974ad4ca3d766fbbb47d77cae4a8fc4c88")
    odoo_user = os.environ.get("ODOO_USERNAME", "finance@uncompromised.in")

    if clear_dummy:
        # Purge dummy synthetic customers on real sync
        await db.customers.delete_many({"source": {"$nin": ["odoo", "odoo_live"]}})

    if not odoo_key:
        return 0

    # Attempt XML-RPC connection to Odoo for partners & Account 200110 sales
    try:
        import xmlrpc.client
        import asyncio
        
        def _fetch_odoo_data():
            clean_url = odoo_url.rstrip("/").removesuffix("/odoo")
            common = xmlrpc.client.ServerProxy(f"{clean_url}/xmlrpc/2/common")
            uid = common.authenticate(odoo_db, odoo_user, odoo_key, {})
            if not uid:
                return [], {}
            models = xmlrpc.client.ServerProxy(f"{clean_url}/xmlrpc/2/object")
            # 1. Fetch active partners (customers) — no limit to get all partners
            partners = models.execute_kw(
                odoo_db, uid, odoo_key,
                'res.partner', 'search_read',
                [[['active', '=', True]]],
                {'fields': ['id', 'name', 'email', 'phone', 'comment', 'is_company', 'total_invoiced']}
            )
            # 2. Fetch sales line entries for Account 200110 (Revenue From Operations - Sale of Goods - Produce)
            sales_by_partner = {}
            try:
                move_lines = models.execute_kw(
                    odoo_db, uid, odoo_key,
                    'account.move.line', 'search_read',
                    [[['account_id.code', '=', '200110']]],
                    {'fields': ['partner_id', 'credit', 'debit', 'balance', 'move_id']}
                )
                for line in move_lines:
                    pid = line.get('partner_id')
                    if pid and isinstance(pid, (list, tuple)):
                        p_id = pid[0]
                        amt = (line.get('credit') or 0.0) - (line.get('debit') or 0.0)
                        sales_by_partner[p_id] = sales_by_partner.get(p_id, 0.0) + amt
            except Exception as e_account:
                logger.info(f"Odoo account.move.line query notice: {e_account}")

            return partners, sales_by_partner

        partners, sales_by_partner = await asyncio.to_thread(_fetch_odoo_data)
        synced_count = 0
        now = datetime.now(timezone.utc).isoformat()
        for p in partners:
            if not p.get("name"):
                continue
            cid = f"odoo_{p['id']}"
            calc_spent = round(sales_by_partner.get(p['id'], p.get('total_invoiced') or 0.0), 2)
            doc = {
                "id": cid,
                "name": p["name"],
                "email": p.get("email") or f"{p['name'].lower().replace(' ', '.')}@simplability.com",
                "phone": p.get("phone") or "",
                "category": "b2b" if p.get("is_company") else "consumer",
                "classification": "customer" if calc_spent > 0 else "prospect",
                "total_spent": calc_spent,
                "notes": p.get("comment") or "Account 200110 - Revenue From Operations (Odoo)",
                "source": "odoo_live",
                "updated_at": now,
            }
            await db.customers.update_one({"id": cid}, {"$set": doc, "$setOnInsert": {"created_at": now, "total_orders": 1 if calc_spent > 0 else 0}}, upsert=True)
            synced_count += 1
        return synced_count
    except Exception as e:
        logger.warning(f"Odoo sync exception: {e}")
        return 0

@api.post("/connectors/clear-dummy")
async def clear_dummy_data(_: dict = Depends(get_current_user)):
    """Removes synthetic dummy seed data to keep only clean real data."""
    deleted_c = await db.customers.delete_many({"source": {"$nin": ["odoo", "odoo_live"]}})
    deleted_r = await db.reminders.delete_many({})
    return {"deleted_customers": deleted_c.deleted_count, "deleted_reminders": deleted_r.deleted_count}

@api.post("/connectors/{cid}/sync")
async def sync_connector(cid: str, _: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    if cid == "odoo":
        await _sync_odoo_live()
    records = await db.customers.count_documents({"source": {"$in": ["odoo", "odoo_live"]}}) if cid in ("shopify", "odoo") else 0
    await db.connectors.update_one({"id": cid},
                                   {"$set": {"last_sync": now, "records": records, "status": "connected"}},
                                   upsert=True)
    doc = await db.connectors.find_one({"id": cid}, {"_id": 0})
    return doc

# -----------------------------------------------------------------------------
# Dashboard stats
# -----------------------------------------------------------------------------
@api.get("/stats/overview")
async def stats_overview(_: dict = Depends(get_current_user)):
    total = await db.customers.count_documents({})
    by_class = {}
    for cls in ["visitor", "prospect", "prime_prospect", "customer", "subscriber"]:
        by_class[cls] = await db.customers.count_documents({"classification": cls})
    reminders_sent = await db.reminders.count_documents({"status": {"$in": ["sent", "simulated"]}})
    active_autos = await db.automations.count_documents({"active": True})

    # revenue trend by week (last 8 weeks)
    customers = await db.customers.find({}, {"_id": 0, "total_spent": 1, "created_at": 1}).to_list(1000)
    now = datetime.now(timezone.utc)
    weeks = []
    for i in range(7, -1, -1):
        wstart = now - timedelta(days=(i + 1) * 7)
        wend = now - timedelta(days=i * 7)
        rev = sum([c.get("total_spent", 0) or 0 for c in customers
                   if c.get("created_at") and wstart.isoformat() <= c["created_at"] < wend.isoformat()])
        weeks.append({"week": wstart.strftime("%b %d"), "revenue": round(rev, 2)})

    total_revenue = sum([c.get("total_spent", 0) or 0 for c in customers])
    return {
        "total_customers": total,
        "by_classification": by_class,
        "reminders_sent": reminders_sent,
        "active_automations": active_autos,
        "total_revenue": round(total_revenue, 2),
        "revenue_trend": weeks,
    }

# -----------------------------------------------------------------------------
# Copilot — English-driven command engine
# -----------------------------------------------------------------------------
import json as _json
import re as _re

# LLM providers — prefer direct Anthropic SDK for self-hosting; fall back to
# Emergent's managed universal key when running inside the Emergent platform.
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    _HAS_EMERGENT_LLM = True
except Exception:  # pragma: no cover — self-hosted image may not ship this
    LlmChat = None  # type: ignore
    UserMessage = None  # type: ignore
    _HAS_EMERGENT_LLM = False

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
EMERGENT_LLM_KEY_VAL = os.environ.get("EMERGENT_LLM_KEY", "")


async def _llm_complete(system: str, user_msg: str, session_tag: str) -> str:
    """Send a single prompt to Claude and return the raw string response.

    Prefers direct Anthropic SDK if ANTHROPIC_API_KEY is set (self-hosted mode).
    Falls back to the Emergent-managed universal key otherwise.
    """
    if ANTHROPIC_API_KEY:
        # Direct Anthropic API — works on any server.
        from anthropic import AsyncAnthropic  # local import so preview keeps working without the package
        client_a = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        resp = await client_a.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        # Concatenate text blocks
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

    if _HAS_EMERGENT_LLM and EMERGENT_LLM_KEY_VAL:
        chat = (
            LlmChat(
                api_key=EMERGENT_LLM_KEY_VAL,
                session_id=session_tag,
                system_message=system,
            )
            .with_model("anthropic", "claude-sonnet-4-6")
        )
        return await chat.send_message(UserMessage(text=user_msg))

    raise HTTPException(500, "Copilot is not configured — set ANTHROPIC_API_KEY or EMERGENT_LLM_KEY")

COPILOT_SYSTEM = """You are Voyage CRM's command engine. The user gives instructions in natural English.
You MUST reply with ONLY a JSON object (no markdown fences, no prose outside the JSON) with this schema:

{
  "action": "create_contact" | "create_task" | "query_customers" | "query_tasks" | "query_stats" | "link_document" | "unsupported",
  "params": { ...action-specific fields... },
  "summary": "one short human sentence describing what you're about to do"
}

Action schemas:

1. create_contact — extract from the message:
   {
     "name": "...",
     "email": "..." (optional),
     "phone": "..." (optional; strip spaces & format e.g. '+911234567890'),
     "country": "..." (optional),
     "company": "..." (optional),
     "title": "..." (optional),
     "linkedin_url": "..." (optional),
     "notes": "..." (optional; capture the free-form context),
     "category": "consumer" | "b2b" | "investor" | "fund",
     "classification": "visitor" | "prospect" | "prime_prospect" | "customer" | "subscriber"
   }
   Rules:
   - "potential investor" / "VC" / "angel" → category="investor"
   - "wholesale" / "retail partner" / "B2B" → category="b2b"
   - "PE" / "growth fund" / "family office" → category="fund"
   - If the user says something like "I've shared proposals / decks / gave options / went to payment" → classification="prime_prospect"
   - If just introduced with intent to convert → "prospect"
   - If bought → "customer"; monthly plan → "subscriber"

2. create_task — extract:
   {
     "title": "...",
     "description": "...",
     "assignee": "..." (choose from provided team list; default "Admin"),
     "priority": "low" | "medium" | "high" | "urgent",
     "due_date": "YYYY-MM-DD" (optional; parse natural dates relative to today),
     "related_customer_name": "..." (optional; the engine will resolve to id if any)
   }

3. query_customers — extract filters:
   {
     "category": "consumer" | "b2b" | "investor" | "fund" | null,
     "classification": "visitor" | "prospect" | ... | null,
     "created_from": "YYYY-MM-DD" or null,
     "created_to": "YYYY-MM-DD" or null,
     "country": "..." or null,
     "min_spent": number or null,
     "search": "..." or null
   }

4. query_tasks — extract filters:
   {
     "status": "open" | "in_progress" | "waiting" | "done" | null,
     "assignee": "..." or null,
     "tag": "..." or null,
     "priority": "low"|"medium"|"high"|"urgent" | null
   }

5. query_stats — no params ({}) — returns dashboard-level overview.

6. link_document — extract:
   {
     "name": "...",
     "url": "...",
     "kind": "pitch_deck" | "proposal" | "contract" | "spreadsheet" | "other",
     "source": "google_drive" | "onedrive" | "link",
     "category": "consumer" | "b2b" | "investor" | "fund",
     "related_customer_name": "..." or null,
     "description": "..." or null
   }

7. unsupported — when the request doesn't map to any action:
   { "reason": "brief explanation" }

Return VALID JSON only. Do not wrap in ```. Today's date is provided in the user message."""

class CopilotIn(BaseModel):
    prompt: str
    mode: Literal["auto", "preview"] = "auto"
    context: List[dict] = []  # last N feed entries: [{prompt, action, params}]

class CopilotConfirm(BaseModel):
    action: str
    params: dict
    original_prompt: Optional[str] = None

def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    # Strip markdown fences if the model added them
    text = _re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=_re.MULTILINE).strip()
    try:
        return _json.loads(text)
    except Exception:
        # Try to find first { ... } block
        m = _re.search(r"\{.*\}", text, _re.DOTALL)
        if m:
            try:
                return _json.loads(m.group(0))
            except Exception:
                return None
    return None

async def _resolve_customer(name: Optional[str]) -> Optional[dict]:
    if not name:
        return None
    return await db.customers.find_one({"name": {"$regex": _re.escape(name), "$options": "i"}}, {"_id": 0})

_MONEY_PATTERNS = [" cr", "crore", "lakh", "lac", "million", "$", "₹", "€", "£", "usd", "inr"]

def _is_high_value(action: str, params: dict) -> tuple[bool, str]:
    if action == "create_contact":
        cat = params.get("category")
        if cat in ("investor", "fund"):
            return True, f"Creates a {cat} contact — admin-only category"
        if cat == "b2b":
            return True, "Creates a B2B contact — admin-only category"
        notes = (params.get("notes") or "").lower()
        if any(m in notes for m in _MONEY_PATTERNS):
            return True, "Notes mention a monetary amount"
    if action == "link_document":
        kind = params.get("kind")
        if kind in ("pitch_deck", "contract"):
            return True, f"Adds a {kind.replace('_', ' ')} — high-sensitivity document"
    if action == "create_task":
        if params.get("priority") == "urgent":
            return True, "Task priority is urgent"
    return False, ""

async def _execute_plan(action: str, params: dict, current: dict) -> dict:
    """Execute a copilot plan. Returns the result dict."""
    is_admin = current.get("role") == "admin"
    result: dict = {"ok": True}
    try:
        if action == "create_contact":
            cat = params.get("category", "consumer")
            if cat in RESTRICTED_CATEGORIES and not is_admin:
                raise HTTPException(403, "Admin access required to create this contact category")
            data = {
                "name": params.get("name") or "",
                "email": params.get("email") or f"contact-{uuid.uuid4().hex[:8]}@voyage-crm.temp",
                "phone": params.get("phone"),
                "country": params.get("country"),
                "category": cat,
                "company": params.get("company"),
                "title": params.get("title"),
                "linkedin_url": params.get("linkedin_url"),
                "notes": params.get("notes"),
                "classification": params.get("classification", "prospect"),
                "source": "manual",
            }
            if not data["name"]:
                raise HTTPException(400, "Could not extract a name from your instruction")
            c = Customer(**data, owner=current.get("name") or "Admin")
            await db.customers.insert_one(c.model_dump())
            result["contact"] = c.model_dump()

        elif action == "create_task":
            related_id = None
            related_name = None
            if params.get("related_customer_name"):
                match = await _resolve_customer(params.get("related_customer_name"))
                if match:
                    related_id = match["id"]
                    related_name = match["name"]
            auto = auto_tag_task(f"{params.get('title','')}\n{params.get('description','')}")
            t = Task(
                title=params.get("title") or "Untitled task",
                description=params.get("description", ""),
                assignee=params.get("assignee") or current.get("name") or "Admin",
                priority=params.get("priority", "medium"),
                due_date=params.get("due_date"),
                related_customer_id=related_id,
                related_customer_name=related_name,
                tags=auto,
                owner=current.get("name") or "Admin",
            )
            await db.tasks.insert_one(t.model_dump())
            if t.assignee != (current.get("name") or "Admin"):
                await notify(t.assignee, "task_assigned",
                             f"New task assigned: {t.title}",
                             f"By {current.get('name','Admin')} · via copilot", task_id=t.id)
            result["task"] = t.model_dump()

        elif action == "query_customers":
            q: dict = {}
            if params.get("category"):
                if params["category"] in RESTRICTED_CATEGORIES and not is_admin:
                    raise HTTPException(403, "Admin access required for this category")
                q["category"] = params["category"]
            elif not is_admin:
                q["category"] = {"$nin": list(RESTRICTED_CATEGORIES)}
            if params.get("classification"):
                q["classification"] = params["classification"]
            if params.get("country"):
                q["country"] = params["country"]
            if params.get("min_spent") is not None:
                q["total_spent"] = {"$gte": float(params["min_spent"])}
            if params.get("created_from") or params.get("created_to"):
                rng = {}
                if params.get("created_from"):
                    rng["$gte"] = params["created_from"]
                if params.get("created_to"):
                    rng["$lte"] = params["created_to"] + "T23:59:59+00:00"
                q["created_at"] = rng
            if params.get("search"):
                q["$or"] = [
                    {"name": {"$regex": params["search"], "$options": "i"}},
                    {"email": {"$regex": params["search"], "$options": "i"}},
                    {"company": {"$regex": params["search"], "$options": "i"}},
                ]
            total = await db.customers.count_documents(q)
            rows = await db.customers.find(q, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
            result["count"] = total
            result["rows"] = rows
            result["query"] = q

        elif action == "query_tasks":
            q: dict = {}
            for k in ("status", "assignee", "priority"):
                if params.get(k):
                    q[k] = params[k]
            if params.get("tag"):
                q["tags"] = params["tag"]
            total = await db.tasks.count_documents(q)
            rows = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
            result["count"] = total
            result["rows"] = rows

        elif action == "query_stats":
            total = await db.customers.count_documents({})
            by_class = {}
            for cls in ["visitor", "prospect", "prime_prospect", "customer", "subscriber"]:
                by_class[cls] = await db.customers.count_documents({"classification": cls})
            by_cat = {}
            for c in ["consumer", "b2b", "investor", "fund"]:
                by_cat[c] = await db.customers.count_documents({"category": c})
            open_tasks = await db.tasks.count_documents({"status": {"$ne": "done"}})
            result.update({
                "total_customers": total,
                "by_classification": by_class,
                "by_category": by_cat,
                "open_tasks": open_tasks,
            })

        elif action == "link_document":
            if _doc_needs_admin(params.get("kind", "other"), params.get("category", "consumer")) and not is_admin:
                raise HTTPException(403, "Admin access required to add this document type")
            related_id = None
            related_name = None
            if params.get("related_customer_name"):
                match = await _resolve_customer(params.get("related_customer_name"))
                if match:
                    related_id = match["id"]
                    related_name = match["name"]
            d = Document(
                name=params.get("name") or "Untitled document",
                url=params.get("url") or "",
                kind=params.get("kind", "other"),
                source=params.get("source", "link"),
                category=params.get("category", "consumer"),
                description=params.get("description") or "",
                owner=current.get("name") or "Admin",
                related_customer_id=related_id,
                related_customer_name=related_name,
            )
            await db.documents.insert_one(d.model_dump())
            result["document"] = d.model_dump()

        else:
            result = {"ok": False, "reason": params.get("reason") or "Unsupported instruction"}
    except HTTPException as e:
        result = {"ok": False, "reason": e.detail}
    return result

@api.post("/copilot/execute")
async def copilot_execute(body: CopilotIn, current: dict = Depends(get_current_user)):
    if not (ANTHROPIC_API_KEY or EMERGENT_LLM_KEY_VAL):
        raise HTTPException(500, "Copilot is not configured (set ANTHROPIC_API_KEY or EMERGENT_LLM_KEY)")
    team = await get_team_members()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Build follow-up context from recent exchanges
    ctx_block = ""
    if body.context:
        lines = []
        for i, entry in enumerate(body.context[-3:], 1):
            p = (entry.get("prompt") or "").strip()
            a = entry.get("action") or "?"
            params_str = _json.dumps(entry.get("params") or {}, ensure_ascii=False)
            lines.append(f"[{i}] You said: {p}\n    Action: {a}\n    Params: {params_str}")
        ctx_block = "Recent conversation (for context — resolve pronouns like 'him', 'her', 'that', 'the deal'):\n" + "\n".join(lines) + "\n\n"

    user_msg = (
        f"Today: {today}\n"
        f"Team members available for assignee: {', '.join(team)}\n"
        f"Requester: {current.get('name')} ({current.get('role')})\n\n"
        f"{ctx_block}"
        f"New instruction:\n{body.prompt}"
    )
    try:
        raw = await _llm_complete(
            system=COPILOT_SYSTEM,
            user_msg=user_msg,
            session_tag=f"copilot-{current['id']}-{uuid.uuid4()}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"copilot LLM call failed: {e}")
        raise HTTPException(502, "Copilot temporarily unavailable")
    plan = _extract_json(raw) or {"action": "unsupported", "params": {"reason": "Could not parse model response"}, "summary": "I couldn't understand that."}

    action = plan.get("action", "unsupported")
    params = plan.get("params", {}) or {}
    summary = plan.get("summary", "")

    # High-value / destructive actions require explicit confirmation before executing.
    needs_confirm, confirm_reason = _is_high_value(action, params)
    if body.mode == "preview" or needs_confirm:
        preview = {
            "plan": plan,
            "action": action,
            "summary": summary,
            "preview": True,
            "needs_confirmation": True,
            "confirm_reason": confirm_reason or "Preview requested",
            "result": {"ok": True, "preview": True, "reason": confirm_reason or "Preview only"},
        }
        # Persist as preview (not executed) so it shows in history
        await db.copilot_history.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current["id"],
            "user_name": current.get("name"),
            "prompt": body.prompt,
            "plan": plan,
            "result": preview["result"],
            "preview": True,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        return preview

    result = await _execute_plan(action, params, current)

    # Persist copilot history
    await db.copilot_history.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current["id"],
        "user_name": current.get("name"),
        "prompt": body.prompt,
        "plan": plan,
        "result": result,
        "at": datetime.now(timezone.utc).isoformat(),
    })

    return {"plan": plan, "action": action, "summary": summary, "result": result}


@api.post("/copilot/confirm")
async def copilot_confirm(body: CopilotConfirm, current: dict = Depends(get_current_user)):
    """Execute a previously previewed high-value plan after user confirmation."""
    result = await _execute_plan(body.action, body.params, current)
    await db.copilot_history.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current["id"],
        "user_name": current.get("name"),
        "prompt": body.original_prompt or f"[confirmed] {body.action}",
        "plan": {"action": body.action, "params": body.params, "summary": ""},
        "result": result,
        "confirmed": True,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"action": body.action, "result": result, "confirmed": True}

@api.get("/copilot/history")
async def copilot_history(limit: int = 30, current: dict = Depends(get_current_user)):
    docs = await db.copilot_history.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("at", -1).limit(limit).to_list(limit)
    return docs


# -----------------------------------------------------------------------------
# Seed
# -----------------------------------------------------------------------------
AVATARS = [
    "https://images.pexels.com/photos/17049742/pexels-photo-17049742.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200",
    "https://images.pexels.com/photos/12311572/pexels-photo-12311572.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200",
    "https://images.pexels.com/photos/29995646/pexels-photo-29995646.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200",
    "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200",
    "https://images.pexels.com/photos/1300402/pexels-photo-1300402.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200",
]
FIRST = ["Aarav","Priya","Rohan","Meera","Kabir","Isha","Arjun","Ananya","Vihaan","Zara",
         "Emma","Liam","Noah","Olivia","Ethan","Ava","Mia","Sofia","Lucas","Charlotte"]
LAST = ["Sharma","Patel","Iyer","Kapoor","Verma","Menon","Smith","Johnson","Garcia","Kim",
        "Chen","Rossi","Silva","Novak","Dubois"]
COUNTRIES = ["India","USA","UK","Germany","France","Singapore","UAE","Canada","Australia"]

async def seed_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Admin",
            "role": "admin",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin {ADMIN_EMAIL}")
    else:
        # Keep password in sync with .env for local dev convenience
        if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            await db.users.update_one({"email": ADMIN_EMAIL.lower()},
                                      {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})
    # Backfill status=active for legacy users without a status field
    await db.users.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})

async def seed_customers():
    count = await db.customers.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    events = []
    reminders_seed = []
    classes = ["visitor", "prospect", "prime_prospect", "customer", "subscriber"]
    weights = [10, 12, 8, 15, 7]
    for i in range(52):
        cls = random.choices(classes, weights=weights)[0]
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        created = now - timedelta(days=random.randint(0, 55))
        c = {
            "id": str(uuid.uuid4()),
            "name": name,
            "email": f"{name.lower().replace(' ', '.')}{random.randint(1,99)}@resend.dev",
            "phone": f"+91{random.randint(7000000000, 9999999999)}",
            "country": random.choice(COUNTRIES),
            "category": "consumer",
            "classification": cls,
            "total_orders": 0,
            "total_spent": 0.0,
            "last_order_at": None,
            "subscription_active": cls == "subscriber",
            "subscription_renewal_at": (now + timedelta(days=random.randint(2, 28))).isoformat() if cls == "subscriber" else None,
            "tags": [],
            "source": random.choice(["shopify", "odoo"]),
            "avatar_url": random.choice(AVATARS),
            "created_at": created.isoformat(),
        }
        # events per class
        ev_types = ["visit"]
        if cls in ("prospect", "prime_prospect", "customer", "subscriber"):
            ev_types.append("add_to_cart")
        if cls in ("prime_prospect", "customer", "subscriber"):
            ev_types.append("address_added")
        if cls in ("customer", "subscriber"):
            ev_types.append("order_completed")
            orders = random.randint(1, 6)
            spend = 0.0
            last = created
            for k in range(orders):
                amt = round(random.uniform(19, 240), 2)
                spend += amt
                last = created + timedelta(days=random.randint(1, 40))
                events.append({
                    "id": str(uuid.uuid4()), "customer_id": c["id"], "type": "order_completed",
                    "detail": f"Order #{random.randint(1000,9999)}", "amount": amt,
                    "at": last.isoformat(),
                })
            c["total_orders"] = orders
            c["total_spent"] = round(spend, 2)
            c["last_order_at"] = last.isoformat()
        if cls == "subscriber":
            ev_types.append("subscription_started")
        for t in ev_types:
            if t == "order_completed":
                continue
            events.append({
                "id": str(uuid.uuid4()), "customer_id": c["id"], "type": t,
                "detail": "", "amount": None,
                "at": (created + timedelta(days=random.randint(0, 5))).isoformat(),
            })
        docs.append(c)
    await db.customers.insert_many(docs)
    if events:
        await db.events.insert_many(events)

    # a couple of seed reminders
    for c in random.sample(docs, min(6, len(docs))):
        reminders_seed.append({
            "id": str(uuid.uuid4()),
            "customer_id": c["id"], "customer_name": c["name"],
            "channel": random.choice(["email", "sms", "whatsapp"]),
            "subject": "We miss you!", "message": f"Hey {c['name']}, come back for 10% off.",
            "status": random.choice(["sent", "simulated"]),
            "automation_id": None,
            "at": (now - timedelta(hours=random.randint(1, 96))).isoformat(),
        })
    if reminders_seed:
        await db.reminders.insert_many(reminders_seed)

    # seed a few segments + automations
    seg1 = Segment(name="Dormant customers (30+ days)",
                   description="Customers who haven't ordered in 30+ days",
                   rules=[{"field": "classification", "op": "eq", "value": "customer"},
                          {"field": "days_since_last_order", "op": "gt", "value": 30}],
                   match="all")
    seg2 = Segment(name="Cart abandoners",
                   description="Prospects who added to cart but didn't check out",
                   rules=[{"field": "classification", "op": "eq", "value": "prospect"}])
    seg3 = Segment(name="Renewing subscribers",
                   description="Active subscribers up for renewal",
                   rules=[{"field": "classification", "op": "eq", "value": "subscriber"}])
    await db.segments.insert_many([seg1.model_dump(), seg2.model_dump(), seg3.model_dump()])

    a1 = Automation(name="Win-back email — 30 day dormant",
                    segment_id=seg1.id, channel="email",
                    subject="We miss you, {name} 🌱",
                    message="Hi {name},<br><br>It's been a while. Enjoy 10% off your next order — code WELCOME10.")
    a2 = Automation(name="Cart abandon WhatsApp nudge",
                    segment_id=seg2.id, channel="whatsapp",
                    message="Hey {name}, you left something in your cart. Complete checkout in 2 taps.")
    a3 = Automation(name="Subscription renewal reminder (SMS)",
                    segment_id=seg3.id, channel="sms", schedule_days=3,
                    message="Hi {name}, your subscription renews in 3 days. Manage via your account.")
    await db.automations.insert_many([a1.model_dump(), a2.model_dump(), a3.model_dump()])

    # seed campaigns
    campaigns = [
        Campaign(name="Winter drop — IG launch", channel="instagram",
                 objective="Awareness", content="Story + Reel push for new collection", budget=500,
                 status="live"),
        Campaign(name="Facebook retargeting", channel="facebook",
                 objective="Conversion", content="Retarget cart abandoners with 15% off", budget=350,
                 status="scheduled"),
    ]
    await db.campaigns.insert_many([c.model_dump() for c in campaigns])


B2B_SEEDS = [
    {"name": "Vikram Iyer", "company": "Northwind Retail Group", "title": "Head of Procurement",
     "category": "b2b", "country": "India"},
    {"name": "Sarah Blake", "company": "Meridian Wholesale Co.", "title": "Buying Director",
     "category": "b2b", "country": "USA"},
    {"name": "Hiroshi Tanaka", "company": "Sakura Retail Partners", "title": "Category Manager",
     "category": "b2b", "country": "Singapore"},
    {"name": "Elena Rossi", "company": "Milano Boutique Chain", "title": "Owner",
     "category": "b2b", "country": "Italy"},
]
INVESTOR_SEEDS = [
    {"name": "Ravi Menon", "company": "Blume Ventures", "title": "Partner",
     "category": "investor", "country": "India"},
    {"name": "Alicia Ford", "company": "Sequoia Capital", "title": "Principal",
     "category": "investor", "country": "USA"},
    {"name": "Chen Wei", "company": "Sequoia China", "title": "Vice President",
     "category": "investor", "country": "Singapore"},
]
FUND_SEEDS = [
    {"name": "David Cohen", "company": "Tiger Global", "title": "Managing Director",
     "category": "fund", "country": "USA"},
    {"name": "Priya Nair", "company": "SoftBank Vision Fund", "title": "Investment Director",
     "category": "fund", "country": "UAE"},
    {"name": "Marcus Weber", "company": "General Atlantic", "title": "Senior VP",
     "category": "fund", "country": "Germany"},
]

async def seed_b2b_investors():
    if await db.customers.count_documents({"category": {"$in": ["b2b", "investor", "fund"]}}) > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for group in [B2B_SEEDS, INVESTOR_SEEDS, FUND_SEEDS]:
        for p in group:
            first = p["name"].split(" ")[0].lower()
            handle = p["company"].lower().replace(" ", "").replace(",", "").replace(".", "")[:14]
            docs.append({
                "id": str(uuid.uuid4()),
                "name": p["name"],
                "email": f"{first}@{handle}.com",
                "phone": f"+1{random.randint(2000000000, 9999999999)}",
                "country": p.get("country", "USA"),
                "category": p["category"],
                "company": p["company"],
                "title": p["title"],
                "linkedin_url": f"https://linkedin.com/in/{first}-{random.randint(100,999)}",
                "notes": "",
                "classification": "prospect",
                "total_orders": 0, "total_spent": 0.0,
                "last_order_at": None, "subscription_active": False,
                "subscription_renewal_at": None, "tags": [p["category"]],
                "source": "manual",
                "avatar_url": random.choice(AVATARS),
                "created_at": (now - timedelta(days=random.randint(1, 40))).isoformat(),
            })
    await db.customers.insert_many(docs)

async def seed_tasks():
    if await db.tasks.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc)
    # Pick one seeded B2B / investor to attach to
    b2b = await db.customers.find_one({"category": "b2b"}, {"_id": 0})
    investor = await db.customers.find_one({"category": "investor"}, {"_id": 0})
    seeds = [
        Task(title="Follow up with Northwind on bulk pricing",
             description="They asked for a bulk pricing tier for orders > $5k.",
             assignee="Aisha (Sales)", priority="high",
             due_date=(now + timedelta(days=2)).isoformat(),
             related_customer_id=(b2b or {}).get("id"),
             related_customer_name=(b2b or {}).get("name"),
             tags=["b2b", "pricing"]),
        Task(title="Send investor deck to Blume Ventures",
             description="Prepare Q3 metrics, LTV/CAC, MRR growth chart.",
             assignee="Meera (Growth)", priority="urgent",
             due_date=(now + timedelta(days=1)).isoformat(),
             related_customer_id=(investor or {}).get("id"),
             related_customer_name=(investor or {}).get("name"),
             tags=["investor", "deck"]),
        Task(title="Draft LinkedIn outreach template for funds",
             description="One template for cold intros, another for warm follow-ups.",
             assignee="Meera (Growth)", priority="medium",
             tags=["fund", "outreach"]),
        Task(title="Weekly reminder-log review",
             description="Check failed sends & re-queue.",
             assignee="Rahul (CS)", status="in_progress",
             priority="low", tags=["ops"]),
    ]
    await db.tasks.insert_many([s.model_dump() for s in seeds])

async def seed_documents():
    if await db.documents.count_documents({}) > 0:
        return
    investor = await db.customers.find_one({"category": "investor"}, {"_id": 0})
    b2b = await db.customers.find_one({"category": "b2b"}, {"_id": 0})
    seeds = [
        Document(name="Voyage — Series A Deck v3.2", url="https://drive.google.com/file/d/example-deck",
                 kind="pitch_deck", source="google_drive", category="investor",
                 related_customer_id=(investor or {}).get("id"),
                 related_customer_name=(investor or {}).get("name"),
                 owner="Admin",
                 description="10-slide narrative with Q3 metrics, GTM plan, and use of funds.",
                 tags=["fundraise", "series-a"]),
        Document(name="Northwind — Bulk Pricing Proposal", url="https://voyagecrm-my.sharepoint.com/proposals/northwind.docx",
                 kind="proposal", source="onedrive", category="b2b",
                 related_customer_id=(b2b or {}).get("id"),
                 related_customer_name=(b2b or {}).get("name"),
                 owner="Aisha (Sales)",
                 description="Tiered wholesale pricing for orders > $5k.",
                 tags=["b2b", "pricing"]),
        Document(name="Master Services Agreement — v2", url="https://drive.google.com/file/d/example-msa",
                 kind="contract", source="google_drive", category="b2b",
                 owner="Admin",
                 description="Standard MSA template for B2B partners.",
                 tags=["legal"]),
    ]
    await db.documents.insert_many([s.model_dump() for s in seeds])

@app.on_event("startup")
async def startup():
    await db.customers.create_index("email")
    await db.customers.create_index("classification")
    await db.customers.create_index("category")
    await db.events.create_index("customer_id")
    await db.tasks.create_index("assignee")
    await db.tasks.create_index("status")
    await db.users.create_index("email", unique=True)
    await db.contact_notes.create_index("customer_id")
    await db.scheduled_reminders.create_index([("status", 1), ("scheduled_at", 1)])
    await db.activity_log.create_index([("customer_id", 1), ("at", -1)])
    await seed_admin()
    await seed_customers()
    await seed_b2b_investors()
    await seed_tasks()
    await seed_documents()
    # Kick off the scheduled-reminder poller & automatic Odoo sync
    import asyncio as _asyncio
    _asyncio.create_task(_scheduled_reminder_worker())
    _asyncio.create_task(_sync_odoo_live(clear_dummy=False))


async def _scheduled_reminder_worker():
    """Every 30 seconds, dispatch any scheduled reminders that are due."""
    import asyncio as _asyncio
    while True:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            due = await db.scheduled_reminders.find(
                {"status": "pending", "scheduled_at": {"$lte": now_iso}}, {"_id": 0}
            ).to_list(50)
            for s in due:
                customer = await db.customers.find_one({"id": s["customer_id"]}, {"_id": 0})
                if not customer:
                    await db.scheduled_reminders.update_one(
                        {"id": s["id"]},
                        {"$set": {"status": "failed", "error": "Customer not found",
                                  "dispatched_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    continue
                try:
                    status = await dispatch_message(
                        customer, s["channel"], s.get("subject", ""), s["message"]
                    )
                    await db.scheduled_reminders.update_one(
                        {"id": s["id"]},
                        {"$set": {"status": "sent" if status in ("sent", "simulated") else "failed",
                                  "dispatched_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    await _log_activity(
                        s["customer_id"],
                        "reminder_sent" if status in ("sent", "simulated") else "reminder_failed",
                        f"{s['channel']} · {status}",
                        "scheduler",
                        {"scheduled_id": s["id"], "status": status},
                    )
                except Exception as e:
                    logger.error(f"scheduled dispatch failed {s['id']}: {e}")
                    await db.scheduled_reminders.update_one(
                        {"id": s["id"]},
                        {"$set": {"status": "failed", "error": str(e)[:400],
                                  "dispatched_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    await _log_activity(
                        s["customer_id"], "reminder_failed",
                        f"{s['channel']} · error",
                        "scheduler",
                        {"scheduled_id": s["id"], "error": str(e)[:200]},
                    )
        except Exception as e:
            logger.error(f"scheduler worker error: {e}")
        await _asyncio.sleep(30)

@app.on_event("shutdown")
async def shutdown():
    client.close()

# Health
@api.get("/")
async def root():
    return {"service": "voyage-crm", "status": "ok"}


# Root-level health probe (for Kubernetes / load balancer checks)
@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api)

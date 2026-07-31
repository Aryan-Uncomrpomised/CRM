# Voyage CRM — Self-Hosting Guide

This document is for **your IT team**. It explains how to run the full Voyage CRM stack on your own infrastructure using Docker Compose.

## Stack overview

| Service    | Tech                                | Port (inside compose) |
|-----------|--------------------------------------|-----------------------|
| `frontend` | Nginx + built React app             | `80` (published)      |
| `backend`  | FastAPI + Uvicorn                   | `8001` (internal)     |
| `mongo`    | MongoDB 7                           | `27017` (internal)    |

The frontend container's Nginx also **reverse-proxies `/api/*` → `backend:8001`**, so the SPA and the API share the same origin. This keeps cookies (JWT auth) simple.

---

## 1. Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose ...`)
- A public DNS record and TLS certificate (recommended for production — see §6)
- API keys (see §3):
  - **Anthropic** (for the AI Copilot) — https://console.anthropic.com
  - **Resend** (for transactional email) — https://resend.com

## 2. Clone & configure

```bash
git clone <your-repo-url> voyage-crm
cd voyage-crm
cp .env.example .env
$EDITOR .env         # fill in JWT_SECRET, ANTHROPIC_API_KEY, RESEND_API_KEY, etc.
```

Generate a strong `JWT_SECRET`:
```bash
openssl rand -base64 48
```

## 3. Required environment variables

The complete list is in [`.env.example`](./.env.example). The important ones:

| Variable              | Required | Purpose                                                                                       |
|----------------------|----------|-----------------------------------------------------------------------------------------------|
| `JWT_SECRET`          | ✅       | Signs auth tokens. **MUST** be a strong random string.                                        |
| `ADMIN_EMAIL`         | ✅       | Bootstrap admin. Rotate password after first login.                                           |
| `ADMIN_PASSWORD`      | ✅       | Bootstrap admin password.                                                                     |
| `ANTHROPIC_API_KEY`   | ✅*      | Powers the AI Copilot. Without it, Copilot returns 500.                                       |
| `ANTHROPIC_MODEL`     |          | Defaults to `claude-sonnet-4-5-20250929`. Bump to whatever Anthropic ships next.              |
| `RESEND_API_KEY`      | ✅*      | Sends welcome emails and password reset links. Verify a sending domain for production.        |
| `RESEND_FROM`         |          | `"Voyage CRM <onboarding@resend.dev>"` works out of the box; swap for your verified domain.   |
| `CORS_ORIGINS`        |          | Comma-separated list of allowed origins; `*` uses a regex so credentials still work.          |
| `FRONTEND_URL`        |          | Used inside password-reset email links.                                                       |
| `REACT_APP_BACKEND_URL` |        | Leave **empty** for same-origin deployments (default). Only set if backend is on another host.|
| `HTTP_PORT`           |          | The port on the host that maps to Nginx (default `80`).                                       |

\* Technically the app can start without these two, but Copilot and email delivery won't work until they're set.

## 4. Build & run

```bash
docker compose build
docker compose up -d
docker compose logs -f backend   # tail startup logs
```

Then open **http://<your-server>** and sign in with the bootstrap admin.

**Rotate the admin password immediately:** Settings → Change password. Or update `ADMIN_PASSWORD` in `.env` and restart.

## 5. Verifying the install

```bash
# Backend health (should 401 without a cookie — that's correct)
curl -i http://localhost/api/auth/me

# Login (cookie-based)
curl -c cookies.txt -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@voyageCRM.com","password":"Admin@123"}'

# Snapshot
curl -b cookies.txt http://localhost/api/stats/overview
```

## 6. HTTPS in production

The bundled Nginx only speaks HTTP on port 80. **In production, terminate TLS at a reverse proxy in front** (Cloudflare, an external Nginx, Traefik, or a load balancer).

Minimum external-Nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name crm.example.com;

  ssl_certificate     /etc/letsencrypt/live/crm.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/crm.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:80;   # points at the compose "frontend" container
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Then in `.env`:
```
CORS_ORIGINS=https://crm.example.com
FRONTEND_URL=https://crm.example.com
```
and re-run `docker compose up -d --build`.

## 7. Backups & upgrades

Snapshot MongoDB regularly:
```bash
docker compose exec mongo mongodump --archive --gzip \
  | cat > backups/voyage-$(date +%F).archive.gz
```

Restore:
```bash
cat backups/voyage-YYYY-MM-DD.archive.gz \
  | docker compose exec -T mongo mongorestore --archive --gzip
```

Upgrade the stack:
```bash
git pull
docker compose build
docker compose up -d
```

## 8. Notes for the app team

- The app is **backwards compatible** with Emergent's managed integrations. If you leave `ANTHROPIC_API_KEY` / `RESEND_API_KEY` empty AND set `EMERGENT_LLM_KEY` / `EMERGENT_EMAIL_KEY`, it will use those instead. Self-hosted installs should always prefer the direct keys.
- Copilot uses **Claude Sonnet 4.x** (Anthropic). Set `ANTHROPIC_MODEL` to whatever version you want to pin.
- Admin approval flow: new users go into `pending` status; an admin must approve them from the Users page before they can sign in.

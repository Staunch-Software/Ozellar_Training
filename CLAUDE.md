# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ozellar Marine seafarer training portal: seafarers log in, work through gated
maritime courses (lessons with scroll-to-unlock), take a server-graded final
assessment, and earn a certificate. Three real courses transcribed from PPT
decks (Cargo 22 lessons, HSM 46, Cyber 19).

Stack: React (Vite) frontend in `frontend/`, FastAPI + SQLAlchemy backend in
`backend/`. Postgres in production, SQLite (`backend/dev.db`) as an automatic
dev fallback.

> The `README.md` is partly stale: it describes a `USE_API` toggle and "auth
> out of scope". Neither is true anymore — the frontend is fully API-driven
> (`frontend/src/api.js`) and JWT auth is implemented. Trust the code over the
> README.

## Commands

Backend (from `backend/`, using the checked-in venv):
```bash
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000   # run API (docs at /docs)
./.venv/Scripts/python.exe -m alembic upgrade head               # create/upgrade schema (owns DDL)
./.venv/Scripts/python.exe -m app.seed                           # non-destructive content + demo users/enrollments
```

Schema is owned by **Alembic** (`backend/alembic/`), not `create_all`. First-time
setup on a fresh DB is `alembic upgrade head` then `python -m app.seed`. After a
model change: `alembic revision --autogenerate -m "..."` then `upgrade head`.
`alembic/env.py` pulls `DATABASE_URL` + `Base.metadata` from the app, so it needs
no credentials in `alembic.ini` and runs from `backend/`.

Frontend (from `frontend/`):
```bash
npm run dev        # http://localhost:5173, proxies /api -> :8000
npm run build      # production build to dist/
```

Production build gotcha: `frontend/public/media` is ~1.4 GB of git-ignored
videos. Before `npm run build`, stop the vite dev server and temporarily move
`frontend/public/media` out of the tree so it's excluded, build, then restore.

There is no test suite and no linter configured. Verification is manual/end-to-end.

Windows/port gotcha: killing a uvicorn parent can leave a child holding port
8000. If bind fails, find and `taskkill /PID <child> /T /F` the child.

## Architecture

**Content is DB-seeded, not hardcoded.** `backend/app/courses_seed.json` is the
single source of truth for all course content (chapters, sections, assessment
questions with answer keys). `seed.py` is **non-destructive**: it upserts course
content (replacing each course's chapters/questions), creates the demo users
only if missing, and ensures demo enrollments — it never drops the schema or
touches real `progress`/`attempts`/`certificates`. `frontend/src/data/courses.json`
is a mirror copy; the running frontend does **not** read it — it fetches
everything from `/api`. So content edits mean editing `courses_seed.json` and
re-running the seed.

**Data model** (`backend/app/models.py`): `Course` → `Chapter` (ordered) and
`Course` → `Question` (ordered). Per-user state lives in `Progress`
(one row per learner+course: `completed_chapters` JSON, `score`, `passed`) and
`Certificate` (id like `OM-CARGO-2026-0417`). `Enrollment` assigns a course to a
learner — **learners only see/access courses they're enrolled in** (admins see
all); `main.py`'s `require_enrollment` enforces this on course/chapter/assessment
routes. `Attempt` records every assessment submission (score/pass/answers/time)
as the audit trail; `Progress` keeps the *best* result. `User` holds both roles
in one table. Note: `Progress`/`Certificate.learner_id` are strings (`str(id)`),
while `Enrollment`/`Attempt.learner_id` are integer FKs to `users.id`.

**Auth** (`backend/app/auth.py`): two login modes through `POST /api/auth/login`.
- Crew (learners): **full name + date of birth** (8 digits `DDMMYYYY`). Name match
  is case/whitespace-insensitive (`normalize_name`). If name+DOB is ambiguous (two
  crew share both), the endpoint returns **409** and the client reveals a Crew ID
  field as a tiebreaker; `crew_id` stays the permanent internal key (FKs, certs).
- Admins: `email` + bcrypt password.
Returns a 12-hour HS256 JWT signed with `SECRET_KEY`. Every course/progress/
assessment/certificate route depends on `get_current_user` and is scoped to
that user's `id`. `require_admin` exists for admin-only routes. In-memory
login rate limiter (6 attempts / 5 min per identifier). `parse_ddmmyyyy`
converts the crew DOB string to a `date`.

**Frontend auth flow**: `frontend/src/auth.jsx` holds `AuthProvider`,
`ProtectedRoute`, `AdminRoute`, and `homeFor(user)` (admins → `/admin`, crew →
`/my-courses`). Token is stored in `localStorage` (`ozellar.token`). `api.js`
attaches it as a Bearer header, and on a 401 to an authenticated request clears
the session and redirects to `/`; it also surfaces `err.status` so callers can
branch (e.g. the login 409 collision). Routes are in `App.jsx`; learner pages
are wrapped in `ProtectedRoute`, the `/admin` subtree in `AdminRoute`.

**Admin panel** (`frontend/src/pages/admin/`, API under `/api/admin/*`, all
`require_admin`): Dashboard, Users (create crew or admin, activate/deactivate),
Assignments (a crew × courses matrix that assigns/unassigns via `Enrollment`),
and a compliance report (`/api/admin/report` + `.csv` export). Admin creation
takes email+password and bcrypt-hashes server-side; an admin can't deactivate
their own account. Unassigning a course hides it from the learner but keeps
their progress/attempts/certificate rows.

**Certificates** are issued on pass. `app/certificates.py` renders the official
Ozellar layout to PDF with **ReportLab** (pure-Python — no system libs, runs on
Windows + Ubuntu), embedding the logo + signature from `app/assets/` (cropped
from the official reference PDF; `frontend/public/cert/` holds copies). The
certificate page **embeds this same PDF** in an `<iframe>` so the preview and
the download are byte-identical (one renderer, no drift). A candidate-photo
frame is drawn as an empty placeholder (photo upload is deferred).
`GET /api/courses/{id}/certificate.pdf` (auth) streams it;
`GET /api/certificates` (auth) lists the learner's certs for the hub page; and
`GET /api/verify/{cert_id}` is **public** (no auth) for online verification. The
PDF embeds a verify line pointing at `PUBLIC_BASE_URL/verify/{id}`. Frontend:
`/certificates` hub, `/help`, and a public `/verify/:id` page (outside
`ProtectedRoute`).

**Notifications** are in-app only. `Notification` rows are auto-created on course
assignment, assessment pass/fail, and (implicitly) certificate issue via `notify()`
in `main.py`. `GET /api/notifications` returns `{unread, items}`; `POST
/api/notifications/{id}/read` and `/read-all` mark read. The top-nav bell
(`frontend/src/NotificationBell.jsx`) shows the unread badge + dropdown, polling
every 60s. Admins don't receive notifications (events are learner-scoped).

**Assessment grading is server-side** (`submit_assessment` in `main.py`):
client POSTs an array of answer indices; server compares against stored
`Question.answer`, computes score vs `pass_mark`, records an `Attempt`, updates
`Progress` (best result), and issues a `Certificate` on pass. The course-detail
payload does **not** contain answer keys or explanations — the correct answers +
explanations come back only in the graded result (the `review` array), so the UI
shows results at the end, never mid-quiz. `Course.max_attempts` (null = unlimited)
caps retries per course; a learner who already passed is never blocked.

## DB config

`backend/app/database.py` reads `DATABASE_URL`; unset → `sqlite:///./dev.db`.
Moving to Postgres is config-only (set `DATABASE_URL`, `SECRET_KEY`,
`CORS_ORIGINS` in `backend/.env`) plus a re-seed — the models use portable
JSON columns. All testing so far has been on SQLite; Postgres is not yet
provisioned anywhere.

## Seed logins

- Admin: `admin@ozellarmarine.com` / `Admin@123`
- Crew (name + DOB): `Rajan Kumar` / `14051990` (crew_id OZ1024); `Arjun Nair` / `02111995` (crew_id OZ1088)

## Deployment

Target: Azure VM at `training.ozellar.com` (see `deploy/DEPLOY.md`,
`deploy/nginx-ozellar.conf`). Claude cannot SSH the VM — the user runs commands
there. Currently only a pre-auth static frontend is live; the auth version
needs the backend `/api` up before it can go live. Deploy is the final step,
done only after everything is built and verified locally.

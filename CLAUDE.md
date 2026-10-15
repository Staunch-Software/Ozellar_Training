# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ozellar Marine training portal. Originally seafarer courses only; now four
areas, all in one app:

1. **Courses** — gated lessons (scroll-to-unlock), server-graded final assessment, certificate on pass.
2. **Orientation Program** — rank-promotion checklists (task completion + proof uploads) verified by a vessel approver (Master / Chief Engineer).
3. **Screening tests** — entrance exams for external candidates (separate login, own token type).
4. **Admin panel** — course builder (incl. PPTX import), assignments, user management, reports, screening/orientation management.

Stack: React 18 (Vite) in `frontend/`, FastAPI + SQLAlchemy 2 in `backend/`.
Postgres in production, SQLite (`backend/dev.db`) as automatic dev fallback.

> `README.md` is stale (mentions a `USE_API` toggle / "auth out of scope").
> Trust the code. Same for `frontend/src/data/courses.json` — a mirror the app does not read.

## Commands

Backend (from `backend/`, checked-in venv at `backend/.venv`):
```bash
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8008   # run API (docs at /docs)
./.venv/Scripts/python.exe -m alembic upgrade head               # create/upgrade schema (owns DDL)
./.venv/Scripts/python.exe -m app.seed                           # non-destructive content + demo users
SEED_MODE=prod ./.venv/Scripts/python.exe -m app.seed            # prod seed: admin + courses only
```
The Vite dev proxy targets **`127.0.0.1:8008`** (`frontend/vite.config.js`), so run
the API on 8008 (older notes said 8000). `main.py`'s lifespan auto-seeds if the
courses/users tables are empty.

Schema is owned by **Alembic** (`backend/alembic/`), not `create_all`. Fresh DB:
`alembic upgrade head` then `python -m app.seed`. After a model change:
`alembic revision --autogenerate -m "..."` then `upgrade head`. `alembic/env.py`
pulls `DATABASE_URL` + `Base.metadata` from the app and runs from `backend/`.

Frontend (from `frontend/`):
```bash
npm run dev        # http://localhost:5173, proxies /api -> :8008
npm run build      # production build to dist/
```
Production build gotcha: `frontend/public/media` is ~1.4 GB of git-ignored
videos. Before `npm run build`, stop vite and temporarily move `public/media`
out of the tree, build, then restore.

Tests: there is no test suite or linter. `frontend/playwright.config.ts` exists
(testDir `./tests`, base URL `:5174`) but no `tests/` directory is checked in.
Verification is manual/end-to-end. `backend/qa_test_setup.py` / `qa_test_teardown.py`
create/remove a tagged throwaway Orientation flow (QA Test Vessel, `QATEST-` crew)
for manual walkthroughs; other top-level `backend/*.py` files (`migrate_*`,
`fix_*`, `delete_*`, `rotate_crew_photo`, …) are one-off ops scripts, not app code.

Windows/port gotcha: killing a uvicorn parent can leave a child holding the
port. If bind fails, find and `taskkill /PID <child> /T /F` the child.

## Backend architecture

`app/main.py` is thin: lifespan (auto-seed, APScheduler jobs), CORS, and
`include_router` for each module in `app/routers/`. All endpoints live in
routers: `auth`, `courses`, `assessments`, `course_builder`, `screening`,
`orientation`, `admin_users`, `reporting`, `notifications`, `uploads`.
Models are a package (`app/models/`: `user`, `course`, `assessment`,
`orientation`, `screening`, `notification`), re-exported so `from app import models`
works everywhere. Shared helpers: `course_helpers.py` (progress, enrollment checks,
serialization), `notifications_service.notify()`, `time_utils.py` (IST formatting).

**IDs are UUID strings.** All PKs and FKs (`users.id`, `learner_id`, course IDs …)
are strings now (a migration moved them off integers). The older "int vs str
learner_id" split no longer applies. `crew_id` is still the human-facing login ID.

**Content is DB-seeded.** `app/courses_seed.json` is the source of truth for the
three original courses (Cargo, HSM, Cyber). `seed.py` upserts course content
(replacing chapters/questions per course), creates the admin (and demo crew in
non-prod) only if missing, and never touches progress/attempts/certificates.
Courses can also be authored in the admin Course Builder (DB only — not in the seed JSON).

**Roles & auth** (`app/auth.py`, `routers/auth.py`): `User.role` is `learner`,
`admin`, or `super_admin` (`require_admin` accepts both; `require_super_admin`
is stricter). There is no separate approver role — `require_vessel_approver`
checks a *learner* whose rank qualifies via `orientation_ranks.vessel_approver_info`.
Rank is a free-text string synced from SmartPAL, matched case-insensitively;
`"OFFICE STAFF"` rank gets preview-only access to all courses (`/office-courses`)
and is excluded from Orientation.
- Crew login: full name + DOB (`DDMMYYYY`); ambiguous → 409 and client asks for Crew ID.
- Admin login: email + bcrypt password.
- Screening candidates: separate login (`create_screening_token`,
  `get_current_candidate`, role `test_taker`) — never a `User` row.
- 12h HS256 JWT (`SECRET_KEY`); DB-backed `RateLimit` (`check_rate_limit`).
- A second JWT type (`type: "approval"`) is emailed to admins in the approval digest.

**Admin module access.** Admins don't all see everything: `User.modules` (JSON list;
NULL = all) is checked by `require_module(key)` in `auth.py` (keys in `ADMIN_MODULES`:
`courses`, `orientation`, `assessment`, `briefing`, `user_management`; `super_admin`
always passes). Admin routers use `require_module(...)` instead of `require_admin`;
the frontend mirrors this with `hasModule()`/`<AdminRoute module=...>` and filters the
`AdminLayout` tabs, and `homeFor` sends module-limited admins to their first module.
Only a super_admin can change an admin's modules/designation (`_clean_access` in
`admin_users.py`). `User.department` + `User.designation` (technical_director /
managing_director) exist for the briefing feature.

**Pre-joining briefing** (form OF-MA-010; `routers/briefing.py`, `briefing_template.py`,
`briefing_pdf.py`, `models/briefing.py`): admin assigns a senior officer + one briefer
per department (QHSE/Marine/Technical/Manning-IT-Accounts, admins whose `department`
matches) → each briefer fills Yes/No/N/A + remarks and approves their section →
fixed TD and MD (users with that `designation`) approve → officer reviews on
`/pre-joining-briefing`, adds comments, confirms. Status: `in_progress →
awaiting_directors → awaiting_crew → completed`. Every sign-off stores name + IST
timestamp; the PDF (ReportLab platypus) reproduces the paper form. Checklist wording
is fixed in `briefing_template.py` (stable item keys — don't renumber).

**Enrollment & access.** Learners only access courses they're enrolled in
(`require_enrollment`); admins and office staff bypass. Courses have
`target_ranks` / `target_users` (JSON) for audience, and `max_attempts`
(null = unlimited; passed learners never blocked). Unassigning hides a course
but keeps progress/attempts/certificate rows.

**Assessment grading is server-side** (`routers/assessments.py`): client posts
answer indices; server grades against `Question.answer`, records an `Attempt`,
keeps best result in `Progress`, and issues a `Certificate` on pass (sequence in
`CertificateSequence`, ids like `OM-CARGO-2026-0417`). Course payloads contain no
answer keys; correct answers + explanations come back only in the graded `review`.
There is also an `AssessmentApproval` flow: pending results are batched by an
APScheduler job (`send_pending_digest_job`, every `APPROVAL_DIGEST_INTERVAL_MINUTES`,
default 30) into one email to `ADMIN_EMAIL` with one-click approval tokens
(`email_service.py`).

**Certificates**: ReportLab PDF (`app/certificates.py`) with logo/signature from
`app/assets/`; the certificate page embeds the same PDF in an `<iframe>` so preview
== download. `GET /api/verify/{cert_id}` is public; the PDF carries a verify line to
`PUBLIC_BASE_URL/verify/{id}`.

**Orientation** (`routers/orientation.py`, `orientation_ranks.py`, models
`OrientationProgram/Task/Enrollment/TaskCompletion/Submission`): programs have a
department (deck/engine) and from/to rank; admins enroll eligible crew, crew tick
tasks (some require proof uploads), a vessel approver (Master/Chief Engineer of the
crew member's current vessel) verifies per task.

**Screening** (`routers/screening.py`, `models/screening.py`): admin-built tests
(sections, questions with multiple images), candidate exam session with photo
capture and tab-switch counting, review/results screens in admin.

**Course Builder & PPTX import** (`routers/course_builder.py`,
`services/pptx_processor.py`): admins upload a PPTX; a background thread converts
slides to images (progress tracked in `UPLOAD_DIR/<course_id>/_pptx_job.json`) and
creates chapters. Videos are compressed via `video.py`. Uploads are validated by
`security_upload.py` (magic-byte/type checks, optional ClamAV via `pyclamd`).

**Storage** (`app/storage.py`): addressed by `(course_id, filename)`. Uses Azure
Blob when `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_CONTAINER_NAME` are set,
otherwise local `UPLOAD_DIR` (default `backend/uploads/`, git-ignored). Same
"unset → local" pattern as `DATABASE_URL`.

**SmartPAL crew sync** (`smartpal_sync.py` QueryActivity report, `crewlist_sync.py`
Crew List report): Playwright drives Azure AD SSO login and in-page `fetch()` calls
(plain HTTP clients get 401). Upserts `User` rows keyed on `emp_id`, writing only
SmartPAL-owned fields (never email/password/role/is_active; absent crew are not
deactivated); `crew_id` ← SmartPAL `empNo`. Scheduled 07:00 and 19:00 IST only when
`SMARTPAL_USERNAME`/`SMARTPAL_PASSWORD` are set; run manually with
`python -m app.smartpal_sync`. Logged in `SyncLog`.

**Notifications** are in-app (`Notification` rows via `notify()`); the crew bell
(`NotificationBell.jsx`) polls every 60s, and admins now have `AdminNotificationBell.jsx`.

## Frontend architecture

Fully API-driven via `src/api.js` (Bearer token from `localStorage` key
`ozellar.token`; a 401 on an authenticated call clears the session and redirects
to `/`; `err.status` is exposed for branching, e.g. login 409).
`src/auth.jsx` has `AuthProvider`, `ProtectedRoute`, `AdminRoute`, and `homeFor(user)`.
`src/App.jsx` defines all routes; besides crew (`ProtectedRoute`) and `/admin/*`
(`AdminRoute`, nested layout with `AdminLayout`) there are `ApproverRoute`
(`/approvals`), `OfficeStaffRoute` (`/office-courses`), candidate-token routes under
`/test/*`, and the public `/verify/:id`. `/dashboard` goes through
`CrewDashboardRouter` to pick the right landing page by role/rank.
Admin pages: `src/pages/admin/` (course management, orientation, screening, user
management, reports). Styling is plain CSS files alongside pages plus `styles.css`
(no CSS framework).

## Config (`backend/.env`, see `.env.example`)

`DATABASE_URL` (unset → SQLite), `SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`,
`UPLOAD_DIR`, Azure Blob vars, `SMARTPAL_*`, SMTP vars, `ADMIN_EMAIL`,
`APPROVAL_DIGEST_INTERVAL_MINUTES`. External binaries: LibreOffice (`soffice`) for PPTX
conversion (`services/pptx_processor.py`) and `ffmpeg` on PATH for video compression
(`video.py`); Playwright browsers are needed for the SmartPAL sync.

## Seed logins (dev)

- Admin: `admin@ozellarmarine.com` / `Admin@123`
- Crew (name + DOB): `Rajan Kumar` / `14051990` (OZ1024); `Arjun Nair` / `02111995` (OZ1088)

## Deployment

Target: Azure VM at `training.ozellar.com` (`deploy/DEPLOY.md`,
`deploy/DEPLOY-BACKEND.md`, `deploy/nginx-ozellar.conf`, `deploy/ozellar-api.service`
systemd unit; nginx proxies `/api`). Claude cannot SSH the VM — the user runs
commands there. Deploy only after everything is built and verified locally.

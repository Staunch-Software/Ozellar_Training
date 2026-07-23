# Ozellar Marine — Seafarer Training Portal

A web app where seafarers log in, work through their **assigned** training
courses (text, diagrams, and video with scroll-to-unlock gating), take a
server-graded final assessment, and earn a certificate. Admins manage crew,
assign courses, and pull compliance reports. Built from the real Ozellar Marine
training decks (Cargo Operations, Health & Safety, Cyber Security).

**Stack:** React (Vite) · FastAPI (Python) · PostgreSQL, with **Alembic**
migrations. A SQLite fallback exists for zero-setup dev (unset `DATABASE_URL`).

---

## Prerequisites

- **Python** (the repo ships a virtualenv at `backend/.venv`)
- **Node.js** (18+)
- **PostgreSQL** running locally, with a database created for the app

Create the database once (in `psql` as a superuser):

```sql
CREATE DATABASE ozellar_learn;
```

Then configure `backend/.env` (copy from `.env.example`):

```
DATABASE_URL=postgresql+psycopg2://<user>:<password>@localhost:5432/ozellar_learn
SECRET_KEY=<a long random string>
CORS_ORIGINS=http://localhost:5173
```

Generate a `SECRET_KEY` with:

```bash
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

> If `DATABASE_URL` is left unset, the app falls back to a local SQLite file
> (`backend/dev.db`) so it runs with no Postgres — but production uses Postgres.

---

## Run it

### Backend (FastAPI)

From `backend/` (commands use the checked-in venv):

```bash
# 1. install dependencies (first time / after requirements change)
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. create all tables — schema is owned by Alembic, NOT auto-created
.\.venv\Scripts\python.exe -m alembic upgrade head

# 3. seed course content + demo users + enrollments (non-destructive; safe to re-run)
.\.venv\Scripts\python.exe -m app.seed

# 4. run the API  (docs at http://localhost:8000/docs)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

**Order matters:** run `alembic upgrade head` *before* `app.seed` — seeding
into an empty schema fails because the tables don't exist yet.

### Frontend (React + Vite)

From `frontend/` (in a second terminal):

```bash
npm install
npm run dev            # http://localhost:5173  (proxies /api -> :8000)
```

---

## Demo logins

- **Admin:** `admin@ozellarmarine.com` / `Admin@123`
- **Crew** (full name + date of birth, `DDMMYYYY`):
  - `Rajan Kumar` / `14051990`
  - `Arjun Nair` / `02111995`

Crew log in with their **name + date of birth**; admins with **email +
password**. Learners only see the courses assigned to them.

---

## Database & migrations

The schema is managed by **Alembic** (`backend/alembic/`), not by
`create_all`. `alembic/env.py` reads `DATABASE_URL` and the model metadata from
the app, so credentials never live in a committed file.

```bash
# after changing a model in app/models.py:
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

**Seeing the tables:** they live in the database named in your `DATABASE_URL`
(e.g. `ozellar_learn`), *not* the default `postgres` database.

```bash
psql -U postgres -d ozellar_learn -c "\dt"
```

Expected tables: `users, courses, chapters, questions, progress, certificates,
enrollments, attempts, alembic_version`.

**Content is DB-seeded.** `backend/app/courses_seed.json` is the single source of
truth for all course content and assessment questions. `app.seed` upserts that
content and ensures the demo users/enrollments exist — it does **not** drop
tables or touch real learner progress.

---

## Project layout

```
Course/
├── frontend/                 React app (Vite)
│   └── src/
│       ├── pages/            Login, MyCourses, CourseReader, Assessment, Certificate
│       │   └── admin/        AdminLayout, Dashboard, Users, Assignments, Report
│       ├── auth.jsx          AuthProvider, ProtectedRoute, AdminRoute
│       ├── api.js            API client (fully API-driven; Bearer token)
│       └── styles.css        design system (light + dark)
└── backend/
    ├── app/
    │   ├── main.py           API routes (auth, courses, assessment, admin)
    │   ├── auth.py           JWT, bcrypt, login helpers, rate limiter
    │   ├── models.py         Course, Chapter, Question, Progress, Certificate, Enrollment, Attempt
    │   ├── database.py       engine/session; reads DATABASE_URL
    │   ├── seed.py           non-destructive seed from courses_seed.json
    │   └── courses_seed.json single source of truth for content
    └── alembic/              database migrations
```

---

## Features

- **Auth & roles** — JWT (12h), single `users` table; crew login by name + DOB
  (with a Crew-ID tiebreaker if two crew share both), admin login by
  email + password; login rate-limited.
- **Assigned courses** — admins assign courses to specific crew; learners see
  only their assignments.
- **Server-graded assessments** — the answer key is never sent to the browser;
  grading, scoring, pass mark, attempt limits, and the per-question review all
  come from the server. Every submission is recorded (`attempts`).
- **Certificates** — issued automatically on pass, with a unique ID
  (e.g. `OM-CARGO-OPS-2026-0001`).
- **Admin panel** — dashboard, user management (create crew/admins,
  activate/deactivate), a crew × course assignment matrix, and a completion
  report with CSV export.

---

## Production build note

`frontend/public/media` is ~1.4 GB of git-ignored training videos. Before
`npm run build`, stop the Vite dev server and temporarily move
`frontend/public/media` out of the tree so it's excluded from the build, then
restore it afterward.

# Ozellar Marine — Seafarer Training Portal

A web app where seafarers log in, work through assigned training courses
(text, diagrams, and video), take a final assessment, and earn a
certificate. Built from the real Ozellar Marine training decks.

**Stack:** React (Vite) · FastAPI (Python) · Postgres — with a SQLite
fallback so it runs with no database setup.

---

## What's here

```
Course/
├── frontend/          React app (the seafarer-facing website)
│   └── src/
│       ├── pages/     Login, MyCourses, CourseReader, Assessment, Certificate
│       ├── data/      courses.js — seed content from the real decks
│       ├── api.js     data layer (local seed today; flip USE_API for the backend)
│       └── styles.css design system (warm paper · amber · teal · navy)
└── backend/           FastAPI + SQLAlchemy API
    └── app/
        ├── main.py           API routes
        ├── models.py         Course · Chapter · Question · Progress · Certificate
        ├── seed.py           loads courses_seed.json into the DB
        └── courses_seed.json single source of truth (generated from the frontend seed)
```

## The five screens

1. **Login** — sign in with company email / crew ID (auth wired separately).
2. **My courses** — the courses assigned to the learner, each with progress.
3. **Course reader** — chapters in the sidebar, content on the right (text /
   diagram / video blocks), with next / previous and *mark complete*.
4. **Assessment** — the course's final assessment; graded with a pass mark.
5. **Certificate** — issued automatically once the assessment is passed.

---

## Run it

### Frontend (works standalone — no backend needed)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Out of the box the frontend uses local seed data and stores progress in the
browser, so the whole flow is clickable immediately.

### Backend (FastAPI + Postgres)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (use: source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python -m app.seed                # create tables + load content
uvicorn app.main:app --reload     # http://localhost:8000  (docs at /docs)
```

- **No Postgres?** It falls back to a local `dev.db` (SQLite) automatically.
- **Using Postgres?** Copy `.env.example` to `.env` and set `DATABASE_URL`.

### Connect the two

In `frontend/src/api.js` set `USE_API = true`. The Vite dev server proxies
`/api` to `http://localhost:8000`, so the frontend then reads live data,
records progress, and grades assessments server-side.

---

## How the content was loaded

The real deck content is extracted by scripts (in the session scratchpad) and
committed as generated data — no hand-copying:

- **Slides → images:** every slide of all three decks is exported to PNG under
  `frontend/public/slides/<courseId>/slideN.png` (93 slides total).
- **Text:** extracted per slide with `python-pptx`.
- **Videos:** the embedded clips are pulled out of the decks into
  `frontend/public/media/<courseId>/` and wired into the `<video>` player.
- All of this is assembled into `frontend/src/data/courses.json` (the single
  source of truth), a copy of which seeds the backend.

Fonts use `@fontsource/inter`; all icons are `lucide-react` (no emoji).

## Notes for the next iteration

- **Video hosting:** the extracted videos total ~1.4 GB and are git-ignored.
  They play fine locally, but for real use they belong on a streaming service
  (e.g. Cloudflare Stream) rather than served as files.
- **Auth** is intentionally out of scope — the login screen enters the portal
  and the API assumes one demo learner. Plug in your chosen provider.
- **Assessment security:** the reader currently ships answer keys to the client
  for the offline demo. In production, grade only via
  `POST /api/courses/{id}/assessment` (already implemented server-side) and stop
  sending `answer` fields to the browser.

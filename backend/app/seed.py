"""Seed the database from courses_seed.json (the single source of truth,
generated from the frontend seed data). Run:  python -m app.seed

Non-destructive: this refreshes course *content* (courses/chapters/questions)
and ensures the demo users + their enrollments exist, but it never drops the
schema or touches real learner progress, attempts, or certificates. Schema is
owned by Alembic migrations (`alembic upgrade head`), not by this script.
"""
import json
import os
from datetime import date
from .database import SessionLocal
from . import models
from .auth import hash_password

SEED_FILE = os.path.join(os.path.dirname(__file__), "courses_seed.json")

# Seed users. Crew log in with full name + DOB (DDMMYYYY); admin with email + password.
SEED_USERS = [
    dict(role="admin", email="admin@ozellarmarine.com", full_name="Fleet Training Admin",
         rank="Training Administrator", password="Admin@123"),
    dict(role="learner", crew_id="OZ1024", full_name="Rajan Kumar",
         rank="Chief Officer", date_of_birth=date(1990, 5, 14), pp_no="PP-4471"),  # DOB 14051990
    dict(role="learner", crew_id="OZ1088", full_name="Arjun Nair",
         rank="Second Officer", date_of_birth=date(1995, 11, 2), pp_no="PP-5210"),  # DOB 02111995
]


def _upsert_course(db, ci, c):
    """Create or update a course and fully refresh its chapters + questions.
    Course PK (and therefore progress/enrollment/certificate FKs) is preserved."""
    course = db.get(models.Course, c["id"])
    if course is None:
        course = models.Course(id=c["id"])
        db.add(course)
    course.slug = c["slug"]
    course.title = c["title"]
    course.subtitle = c.get("subtitle")
    course.icon = c.get("icon")
    course.gradient = c.get("gradient")
    course.duration_label = c.get("durationLabel")
    course.status = c.get("status", "not-started")
    course.status_note = c.get("statusNote")
    course.pass_mark = c["assessment"]["passMark"]
    course.max_attempts = c["assessment"].get("maxAttempts")   # null = unlimited
    course.cert = c.get("cert")
    course.order = ci

    # Replace content wholesale so edits/removals in the JSON are reflected.
    db.query(models.Chapter).filter_by(course_id=c["id"]).delete()
    db.query(models.Question).filter_by(course_id=c["id"]).delete()
    for chi, ch in enumerate(c["chapters"]):
        db.add(models.Chapter(
            id=ch["id"], course_id=c["id"], n=ch.get("n"),
            chapter_label=ch.get("chapterLabel"), title=ch["title"],
            intro=ch.get("intro", ""), sections=ch.get("sections", []),
            figure=ch.get("figure", ""), image=ch.get("image"),
            videos=ch.get("videos", []), order=chi,
        ))
    for qi, q in enumerate(c["assessment"]["questions"]):
        db.add(models.Question(
            course_id=c["id"], prompt=q["q"], options=q["options"],
            answer=q["answer"], explain=q.get("explain"), order=qi,
        ))


def _ensure_user(db, u):
    """Create a demo user if one with the same crew_id/email doesn't exist.
    Existing users are left untouched (admin edits are preserved)."""
    q = db.query(models.User)
    existing = (q.filter_by(crew_id=u["crew_id"]).first() if u.get("crew_id")
                else q.filter_by(email=u["email"]).first())
    if existing:
        return existing
    user = models.User(
        role=u["role"], crew_id=u.get("crew_id"), email=u.get("email"),
        full_name=u["full_name"], rank=u.get("rank"),
        date_of_birth=u.get("date_of_birth"), pp_no=u.get("pp_no"),
        password_hash=hash_password(u["password"]) if u.get("password") else None,
    )
    db.add(user)
    db.flush()   # assign id for enrollment FKs
    return user


def _ensure_enrollment(db, learner_id, course_id):
    exists = db.query(models.Enrollment).filter_by(
        learner_id=learner_id, course_id=course_id).first()
    if not exists:
        db.add(models.Enrollment(learner_id=learner_id, course_id=course_id))


def run():
    with open(SEED_FILE, encoding="utf-8") as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        course_ids = []
        for ci, c in enumerate(data["courses"]):
            _upsert_course(db, ci, c)
            course_ids.append(c["id"])

        learners = []
        for u in SEED_USERS:
            user = _ensure_user(db, u)
            if user.role == "learner":
                learners.append(user)

        # Demo: assign every seeded course to every demo learner.
        for learner in learners:
            for cid in course_ids:
                _ensure_enrollment(db, learner.id, cid)

        db.commit()
        print(f"Seeded {len(course_ids)} courses; "
              f"ensured {len(SEED_USERS)} users and their enrollments.")
        print("  Admin login: admin@ozellarmarine.com / Admin@123")
        print("  Crew login:  Rajan Kumar / 14051990")
        print("  Crew login:  Arjun Nair / 02111995")
    finally:
        db.close()


if __name__ == "__main__":
    run()

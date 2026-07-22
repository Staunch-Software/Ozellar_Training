"""FastAPI application for the Ozellar Marine seafarer training portal.

Endpoints return the same shapes the React frontend already uses, so the
frontend can switch from local seed data to this API by setting
USE_API = true in frontend/src/api.js.

Auth is handled separately (per plan); a single demo learner is assumed.
Run:  uvicorn app.main:app --reload
"""
import os
import json
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import Base, engine, get_db, SessionLocal
from . import models

DEMO_LEARNER = {"id": "rajan", "name": "Rajan Kumar", "rank": "Chief Officer", "initials": "RK"}

app = FastAPI(title="Ozellar Marine Training API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    # Auto-seed on first run so the API is usable immediately.
    db = SessionLocal()
    try:
        if db.query(models.Course).count() == 0:
            from .seed import run
            run()
    finally:
        db.close()


# ---------- helpers ----------
def get_progress(db, course_id):
    return (db.query(models.Progress)
            .filter_by(learner_id=DEMO_LEARNER["id"], course_id=course_id).first())


def serialize_course(course, progress, detail=False):
    done = set(progress.completed_chapters or []) if progress else set()
    total = len(course.chapters)
    completed = sum(1 for ch in course.chapters if ch.id in done)
    pct = round(completed / total * 100) if total else 0
    if progress is None and course.status == "completed":
        pct = 100
    data = {
        "id": course.id, "slug": course.slug, "title": course.title,
        "subtitle": course.subtitle, "icon": course.icon, "gradient": course.gradient,
        "durationLabel": course.duration_label, "status": course.status,
        "statusNote": course.status_note, "total": total, "completedCount": completed,
        "progressPct": pct,
        "passed": bool(progress.passed) if progress else course.status == "completed",
        "score": (progress.score if progress else (92 if course.status == "completed" else None)),
    }
    if detail:
        data["chapters"] = [{
            "id": ch.id, "n": ch.n, "chapterLabel": ch.chapter_label, "title": ch.title,
            "intro": ch.intro, "sections": ch.sections, "figure": ch.figure,
            "image": ch.image, "videos": ch.videos, "done": ch.id in done,
        } for ch in course.chapters]
        data["cert"] = course.cert
        data["assessment"] = {
            "passMark": course.pass_mark,
            "questions": [{
                "q": q.prompt, "options": q.options, "answer": q.answer, "explain": q.explain,
            } for q in course.questions],
        }
    else:
        data["chapters"] = [{"id": ch.id} for ch in course.chapters]
    return data


# ---------- routes ----------
@app.get("/api/learner")
def learner():
    return DEMO_LEARNER


@app.get("/api/courses")
def list_courses(db: Session = Depends(get_db)):
    out = []
    for c in db.query(models.Course).order_by(models.Course.order).all():
        out.append(serialize_course(c, get_progress(db, c.id), detail=False))
    return out


@app.get("/api/courses/{slug}")
def get_course(slug: str, db: Session = Depends(get_db)):
    c = db.query(models.Course).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Course not found")
    return serialize_course(c, get_progress(db, c.id), detail=True)


@app.post("/api/courses/{course_id}/chapters/{chapter_id}/complete")
def complete_chapter(course_id: str, chapter_id: str, db: Session = Depends(get_db)):
    p = get_progress(db, course_id)
    if not p:
        p = models.Progress(learner_id=DEMO_LEARNER["id"], course_id=course_id,
                            completed_chapters=[])
        db.add(p)
    done = list(p.completed_chapters or [])
    if chapter_id not in done:
        done.append(chapter_id)
    p.completed_chapters = done
    db.commit()
    return {"ok": True, "completed": done}


class AssessmentSubmission(BaseModel):
    answers: list[int]   # option index chosen per question, in order


@app.post("/api/courses/{course_id}/assessment")
def submit_assessment(course_id: str, sub: AssessmentSubmission, db: Session = Depends(get_db)):
    """Grade server-side (authoritative), record the result, and issue a
    certificate on pass."""
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    questions = sorted(course.questions, key=lambda q: q.order)
    if len(sub.answers) != len(questions):
        raise HTTPException(400, "Answer count does not match question count")
    correct = sum(1 for q, a in zip(questions, sub.answers) if a == q.answer)
    score = round(correct / len(questions) * 100)
    passed = score >= course.pass_mark

    p = get_progress(db, course_id)
    if not p:
        p = models.Progress(learner_id=DEMO_LEARNER["id"], course_id=course_id,
                            completed_chapters=[])
        db.add(p)
    p.score = score
    p.passed = passed
    db.commit()

    cert = None
    if passed:
        cert = issue_certificate(db, course)
    return {"score": score, "passed": passed, "correct": correct,
            "total": len(questions), "certificate": cert}


def issue_certificate(db, course):
    existing = (db.query(models.Certificate)
                .filter_by(learner_id=DEMO_LEARNER["id"], course_id=course.id).first())
    if existing:
        return cert_dict(existing, course)
    year = datetime.now(timezone.utc).year
    seq = db.query(models.Certificate).count() + 1
    cid = f"OM-{course.id.upper()}-{year}-{seq:04d}"
    cert = models.Certificate(id=cid, learner_id=DEMO_LEARNER["id"],
                              course_id=course.id,
                              score=get_progress(db, course.id).score)
    db.add(cert)
    db.commit()
    return cert_dict(cert, course)


def cert_dict(cert, course):
    return {
        "id": cert.id, "learner": DEMO_LEARNER["name"], "rank": DEMO_LEARNER["rank"],
        "course": course.title, "score": cert.score,
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
    }


@app.get("/api/courses/{course_id}/certificate")
def get_certificate(course_id: str, db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=DEMO_LEARNER["id"], course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    return cert_dict(cert, course)

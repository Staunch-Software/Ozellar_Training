"""FastAPI application for the Ozellar Marine seafarer training portal.

Auth: crew log in with crew_id + date of birth (DDMMYYYY); admins with
email + password. All learner data (progress, assessments, certificates)
is tied to the authenticated user via a JWT bearer token.

Run:  uvicorn app.main:app --reload
"""
import csv
import io
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db, SessionLocal
from . import models
from .certificates import build_certificate_pdf
from .auth import (
    create_token, get_current_user, require_admin, user_public,
    verify_password, hash_password, parse_ddmmyyyy, normalize_name,
    check_rate_limit, clear_rate_limit,
)

# public origin used in the certificate's verification line / verify links
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://training.ozellar.com")

app = FastAPI(title="Ozellar Marine Training API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    # Schema is owned by Alembic migrations (`alembic upgrade head`), not
    # create_all. On first run after migrating, load demo content if the DB
    # is empty; skip quietly (with a hint) if the schema isn't there yet.
    db = SessionLocal()
    try:
        if db.query(models.Course).count() == 0 or db.query(models.User).count() == 0:
            from .seed import run
            run()
    except Exception as e:
        print(f"[startup] auto-seed skipped ({e}). "
              f"Run:  alembic upgrade head  &&  python -m app.seed")
    finally:
        db.close()


# ======================= AUTH =======================
class LoginRequest(BaseModel):
    mode: str                       # 'crew' | 'admin'
    name: str | None = None         # crew login: full name
    dob: str | None = None          # 8 digits DDMMYYYY
    crewId: str | None = None       # crew login: tiebreaker only (name+DOB collision)
    email: str | None = None
    password: str | None = None


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if req.mode == "crew":
        name = (req.name or "").strip()
        dob_raw = (req.dob or "").strip()
        check_rate_limit(f"crew:{normalize_name(name)}:{dob_raw}")
        dob = parse_ddmmyyyy(dob_raw)
        if not name or dob is None:
            raise HTTPException(401, "Invalid name or date of birth")
        # Match on date of birth (narrows to a few rows), then compare the
        # normalized name in Python so case/spacing differences don't matter.
        candidates = db.query(models.User).filter_by(role="learner", date_of_birth=dob).all()
        target = normalize_name(name)
        matches = [u for u in candidates if normalize_name(u.full_name) == target]
        if not matches:
            raise HTTPException(401, "Invalid name or date of birth")
        if len(matches) > 1:
            # rare collision: two crew share name + DOB → need Crew ID to disambiguate
            crew_id = (req.crewId or "").strip()
            if not crew_id:
                raise HTTPException(
                    409, "More than one crew member matches that name and date of birth. "
                         "Please enter your Crew ID to continue.")
            matches = [u for u in matches if u.crew_id == crew_id]
            if len(matches) != 1:
                raise HTTPException(401, "Invalid Crew ID for that name and date of birth")
        user = matches[0]
        clear_rate_limit(f"crew:{normalize_name(name)}:{dob_raw}")

    elif req.mode == "admin":
        email = (req.email or "").strip().lower()
        check_rate_limit(f"admin:{email}")
        user = db.query(models.User).filter_by(email=email, role="admin").first()
        if not user or not user.password_hash or not verify_password(req.password or "", user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        clear_rate_limit(f"admin:{email}")
    else:
        raise HTTPException(400, "Invalid login mode")

    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    return {"token": create_token(user), "user": user_public(user)}


@app.get("/api/auth/me")
def me(user: models.User = Depends(get_current_user)):
    return user_public(user)


# ======================= COURSES =======================
def get_progress(db, learner_id, course_id):
    return (db.query(models.Progress)
            .filter_by(learner_id=learner_id, course_id=course_id).first())


def notify(db, user_id, kind, title, body=None, link=None):
    """Create an in-app notification (caller commits)."""
    db.add(models.Notification(user_id=user_id, kind=kind, title=title,
                               body=body, link=link))


def enrolled_course_ids(db, user_id):
    return [e.course_id for e in
            db.query(models.Enrollment).filter_by(learner_id=user_id).all()]


def require_enrollment(db, user, course_id):
    """Admins may access any course (preview); learners must be assigned it."""
    if user.role == "admin":
        return
    is_enrolled = db.query(models.Enrollment).filter_by(
        learner_id=user.id, course_id=course_id).first()
    if not is_enrolled:
        raise HTTPException(403, "You are not assigned to this course")


def serialize_course(course, progress, detail=False):
    done = set(progress.completed_chapters or []) if progress else set()
    total = len(course.chapters)
    completed = sum(1 for ch in course.chapters if ch.id in done)
    pct = round(completed / total * 100) if total else 0
    data = {
        "id": course.id, "slug": course.slug, "title": course.title,
        "subtitle": course.subtitle, "icon": course.icon, "gradient": course.gradient,
        "durationLabel": course.duration_label, "status": course.status,
        "statusNote": course.status_note, "total": total, "completedCount": completed,
        "progressPct": pct,
        "passed": bool(progress.passed) if progress else False,
        "score": progress.score if progress else None,
    }
    if detail:
        data["chapters"] = [{
            "id": ch.id, "n": ch.n, "chapterLabel": ch.chapter_label, "title": ch.title,
            "intro": ch.intro, "sections": ch.sections, "figure": ch.figure,
            "image": ch.image, "videos": ch.videos, "done": ch.id in done,
        } for ch in course.chapters]
        data["cert"] = course.cert
        # Integrity: the answer key and explanations are NOT sent to the client.
        # Grading is server-side (submit_assessment) and the correct answers +
        # explanations come back only in the graded result.
        data["assessment"] = {
            "passMark": course.pass_mark,
            "maxAttempts": course.max_attempts,
            "questions": [{
                "q": q.prompt, "options": q.options,
            } for q in course.questions],
        }
    else:
        data["chapters"] = [{"id": ch.id} for ch in course.chapters]
    return data


@app.get("/api/learner")
def learner(user: models.User = Depends(get_current_user)):
    return user_public(user)


@app.get("/api/courses")
def list_courses(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    lid = str(user.id)
    q = db.query(models.Course).order_by(models.Course.order)
    if user.role != "admin":
        # learners see only the courses assigned to them
        assigned = enrolled_course_ids(db, user.id)
        if not assigned:
            return []
        q = q.filter(models.Course.id.in_(assigned))
    return [serialize_course(c, get_progress(db, lid, c.id)) for c in q.all()]


@app.get("/api/courses/{slug}")
def get_course(slug: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(models.Course).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Course not found")
    require_enrollment(db, user, c.id)
    return serialize_course(c, get_progress(db, str(user.id), c.id), detail=True)


@app.post("/api/courses/{course_id}/chapters/{chapter_id}/complete")
def complete_chapter(course_id: str, chapter_id: str,
                     user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_enrollment(db, user, course_id)
    lid = str(user.id)
    p = get_progress(db, lid, course_id)
    if not p:
        p = models.Progress(learner_id=lid, course_id=course_id, completed_chapters=[])
        db.add(p)
    done = list(p.completed_chapters or [])
    if chapter_id not in done:
        done.append(chapter_id)
    p.completed_chapters = done
    db.commit()
    return {"ok": True, "completed": done}


class AssessmentSubmission(BaseModel):
    answers: list[int]


@app.post("/api/courses/{course_id}/assessment")
def submit_assessment(course_id: str, sub: AssessmentSubmission,
                      user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    require_enrollment(db, user, course_id)
    questions = sorted(course.questions, key=lambda q: q.order)
    if len(sub.answers) != len(questions):
        raise HTTPException(400, "Answer count does not match question count")

    lid = str(user.id)
    p = get_progress(db, lid, course_id)
    already_passed = bool(p and p.passed)

    # Attempt limit (null = unlimited). A learner who already passed is never
    # blocked; otherwise stop once they've used up their configured attempts.
    if course.max_attempts and not already_passed:
        used = (db.query(models.Attempt)
                .filter_by(learner_id=user.id, course_id=course_id).count())
        if used >= course.max_attempts:
            raise HTTPException(
                403, "No assessment attempts remaining. Contact your training officer.")

    correct = sum(1 for q, a in zip(questions, sub.answers) if a == q.answer)
    score = round(correct / len(questions) * 100)
    passed = score >= course.pass_mark

    # full audit trail: one row per submission
    db.add(models.Attempt(learner_id=user.id, course_id=course_id,
                          score=score, passed=passed, answers=sub.answers))
    # Progress holds the best result so a later worse attempt can't un-pass
    if not p:
        p = models.Progress(learner_id=lid, course_id=course_id, completed_chapters=[])
        db.add(p)
    if p.score is None or score > p.score:
        p.score = score
    p.passed = bool(p.passed) or passed

    if passed:
        notify(db, user.id, "passed", "Assessment passed",
               f"You passed {course.title} with {score}%. Your certificate is ready.",
               f"/course/{course.slug}/certificate")
    else:
        notify(db, user.id, "failed", "Assessment not passed",
               f"You scored {score}% on {course.title}. You can retry the assessment.",
               f"/course/{course.slug}/assessment")
    db.commit()

    cert = issue_certificate(db, user, course) if passed else None
    # per-question review is returned ONLY here (post-submission), never up front
    review = [{
        "q": q.prompt, "options": q.options, "correct": q.answer,
        "chosen": a, "isCorrect": a == q.answer, "explain": q.explain,
    } for q, a in zip(questions, sub.answers)]
    return {"score": score, "passed": passed, "correct": correct,
            "total": len(questions), "certificate": cert, "review": review}


def issue_certificate(db, user, course):
    lid = str(user.id)
    existing = (db.query(models.Certificate)
                .filter_by(learner_id=lid, course_id=course.id).first())
    if existing:
        return cert_dict(existing, user, course)
    year = datetime.now(timezone.utc).year
    seq = db.query(models.Certificate).count() + 1
    cid = f"OM-{course.id.upper()}-{year}-{seq:04d}"
    cert = models.Certificate(id=cid, learner_id=lid, course_id=course.id,
                              score=get_progress(db, lid, course.id).score)
    db.add(cert)
    db.commit()
    return cert_dict(cert, user, course)


def cert_dict(cert, user, course):
    return {
        "id": cert.id, "learner": user.full_name, "rank": user.rank, "ppNo": user.pp_no,
        "course": course.title, "score": cert.score,
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
    }


@app.get("/api/courses/{course_id}/certificate")
def get_certificate(course_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=str(user.id), course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    return cert_dict(cert, user, course)


def cert_pdf_data(cert, user, course):
    c = course.cert or {}
    return {
        "id": cert.id,
        "learner": user.full_name,
        "ppNo": user.pp_no,
        "titleUpper": c.get("titleUpper") or course.title.upper(),
        "topics": c.get("topics") or [],
        "issued": cert.issued_at.strftime("%Y-%m-%d") if cert.issued_at else "",
        "location": "Chennai",
        "photoPath": None,   # candidate photo — wired for a later upload feature
        "verifyUrl": f"{PUBLIC_BASE_URL}/verify/{cert.id}",
    }


@app.get("/api/courses/{course_id}/certificate.pdf")
def get_certificate_pdf(course_id: str, user: models.User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=str(user.id), course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    pdf = build_certificate_pdf(cert_pdf_data(cert, user, course))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{cert.id}.pdf"'})


@app.get("/api/certificates")
def list_certificates(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    certs = db.query(models.Certificate).filter_by(learner_id=str(user.id)).all()
    out = []
    for cert in certs:
        course = db.query(models.Course).filter_by(id=cert.course_id).first()
        if not course:
            continue
        out.append({
            "id": cert.id, "courseId": course.id, "slug": course.slug,
            "course": course.title, "score": cert.score,
            "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
        })
    return out


@app.get("/api/verify/{cert_id}")
def verify_certificate(cert_id: str, db: Session = Depends(get_db)):
    """Public certificate verification — no authentication required."""
    cert = db.get(models.Certificate, cert_id)
    if not cert:
        return {"valid": False}
    course = db.query(models.Course).filter_by(id=cert.course_id).first()
    user = (db.get(models.User, int(cert.learner_id))
            if (cert.learner_id or "").isdigit() else None)
    return {
        "valid": True, "id": cert.id,
        "holder": user.full_name if user else None,
        "course": course.title if course else None,
        "score": cert.score,
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
    }


# ======================= NOTIFICATIONS =======================
@app.get("/api/notifications")
def list_notifications(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(models.Notification).filter_by(user_id=user.id)
            .order_by(models.Notification.created_at.desc(), models.Notification.id.desc())
            .limit(50).all())
    unread = db.query(models.Notification).filter_by(user_id=user.id, is_read=False).count()
    items = [{
        "id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
        "isRead": bool(n.is_read),
        "createdAt": n.created_at.isoformat() if n.created_at else None,
    } for n in rows]
    return {"unread": unread, "items": items}


@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, user: models.User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(user: models.User = Depends(get_current_user),
                               db: Session = Depends(get_db)):
    (db.query(models.Notification).filter_by(user_id=user.id, is_read=False)
     .update({models.Notification.is_read: True}))
    db.commit()
    return {"ok": True}


# ======================= ADMIN =======================
class CreateUserRequest(BaseModel):
    role: str                       # 'learner' | 'admin'
    fullName: str
    crewId: str | None = None       # learner
    dob: str | None = None          # learner — 8 digits DDMMYYYY
    rank: str | None = None
    ppNo: str | None = None
    email: str | None = None        # admin
    password: str | None = None     # admin


class UpdateUserRequest(BaseModel):
    isActive: bool | None = None
    fullName: str | None = None
    rank: str | None = None
    ppNo: str | None = None


class AssignRequest(BaseModel):
    courseId: str


def admin_user_view(db, u):
    v = {
        "id": u.id, "role": u.role, "name": u.full_name, "rank": u.rank,
        "crewId": u.crew_id, "email": u.email, "ppNo": u.pp_no,
        "dob": u.date_of_birth.strftime("%d%m%Y") if u.date_of_birth else None,
        "isActive": bool(u.is_active),
    }
    if u.role == "learner":
        v["assignedCount"] = db.query(models.Enrollment).filter_by(learner_id=u.id).count()
        v["passedCount"] = (db.query(models.Progress)
                            .filter_by(learner_id=str(u.id), passed=True).count())
    return v


@app.get("/api/admin/users")
def admin_list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.role, models.User.full_name).all()
    return [admin_user_view(db, u) for u in users]


@app.post("/api/admin/users")
def admin_create_user(req: CreateUserRequest, admin: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    name = (req.fullName or "").strip()
    if not name:
        raise HTTPException(400, "Full name is required")

    if req.role == "learner":
        crew_id = (req.crewId or "").strip()
        if not crew_id:
            raise HTTPException(400, "Crew ID is required")
        dob = parse_ddmmyyyy((req.dob or "").strip())
        if dob is None:
            raise HTTPException(400, "Date of birth must be 8 digits (DDMMYYYY)")
        if db.query(models.User).filter_by(crew_id=crew_id).first():
            raise HTTPException(400, "That Crew ID is already in use")
        user = models.User(role="learner", crew_id=crew_id, full_name=name,
                           rank=(req.rank or "").strip() or None, date_of_birth=dob,
                           pp_no=(req.ppNo or "").strip() or None)

    elif req.role == "admin":
        email = (req.email or "").strip().lower()
        if not email:
            raise HTTPException(400, "Email is required")
        if not req.password or len(req.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        if db.query(models.User).filter_by(email=email).first():
            raise HTTPException(400, "That email is already in use")
        user = models.User(role="admin", email=email, full_name=name,
                           rank=(req.rank or "").strip() or None,
                           password_hash=hash_password(req.password))
    else:
        raise HTTPException(400, "Role must be 'learner' or 'admin'")

    db.add(user)
    db.commit()
    db.refresh(user)
    return admin_user_view(db, user)


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, req: UpdateUserRequest,
                      admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if req.isActive is not None:
        if user.id == admin.id and req.isActive is False:
            raise HTTPException(400, "You cannot deactivate your own account")
        user.is_active = req.isActive
    if req.fullName is not None:
        user.full_name = req.fullName.strip()
    if req.rank is not None:
        user.rank = req.rank.strip() or None
    if req.ppNo is not None:
        user.pp_no = req.ppNo.strip() or None
    db.commit()
    return admin_user_view(db, user)


@app.post("/api/admin/users/{user_id}/enrollments")
def admin_assign(user_id: int, req: AssignRequest,
                 admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user or user.role != "learner":
        raise HTTPException(404, "Learner not found")
    if not db.query(models.Course).filter_by(id=req.courseId).first():
        raise HTTPException(404, "Course not found")
    exists = (db.query(models.Enrollment)
              .filter_by(learner_id=user_id, course_id=req.courseId).first())
    if not exists:
        course = db.query(models.Course).filter_by(id=req.courseId).first()
        db.add(models.Enrollment(learner_id=user_id, course_id=req.courseId,
                                 assigned_by=admin.id))
        notify(db, user_id, "assigned", "New course assigned",
               f"{course.title} has been assigned to you.",
               f"/course/{course.slug}")
        db.commit()
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}/enrollments/{course_id}")
def admin_unassign(user_id: int, course_id: str,
                   admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    # removing an assignment hides the course from the learner but keeps their
    # progress/attempts/certificate rows for audit
    db.query(models.Enrollment).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.commit()
    return {"ok": True}


# ----- compliance reporting -----
def _course_cell(db, learner, course):
    prog = get_progress(db, str(learner.id), course.id)
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=str(learner.id), course_id=course.id).first())
    if prog and prog.passed:
        status = "passed"
    elif prog and ((prog.completed_chapters and len(prog.completed_chapters) > 0)
                   or prog.score is not None):
        status = "in-progress"
    else:
        status = "assigned"
    return {
        "status": status,
        "score": prog.score if prog else None,
        "passedOn": cert.issued_at.strftime("%Y-%m-%d") if cert and cert.issued_at else None,
    }


def _report(db):
    courses = db.query(models.Course).order_by(models.Course.order).all()
    learners = (db.query(models.User).filter_by(role="learner")
                .order_by(models.User.full_name).all())
    rows = []
    for lr in learners:
        assigned = set(enrolled_course_ids(db, lr.id))
        cells = {c.id: _course_cell(db, lr, c) for c in courses if c.id in assigned}
        rows.append({
            "learnerId": lr.id, "name": lr.full_name, "crewId": lr.crew_id,
            "rank": lr.rank, "isActive": bool(lr.is_active), "cells": cells,
        })
    return courses, rows


@app.get("/api/admin/report")
def admin_report(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses, rows = _report(db)
    return {"courses": [{"id": c.id, "title": c.title} for c in courses], "rows": rows}


@app.get("/api/admin/report.csv")
def admin_report_csv(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses, rows = _report(db)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Crew ID", "Name", "Rank", "Active", "Course", "Status", "Score", "Passed On"])
    for r in rows:
        active = "yes" if r["isActive"] else "no"
        if not r["cells"]:
            w.writerow([r["crewId"], r["name"], r["rank"] or "", active,
                        "(no courses assigned)", "", "", ""])
            continue
        for c in courses:
            cell = r["cells"].get(c.id)
            if not cell:
                continue
            w.writerow([r["crewId"], r["name"], r["rank"] or "", active, c.title,
                        cell["status"], "" if cell["score"] is None else cell["score"],
                        cell["passedOn"] or ""])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=ozellar-compliance-report.csv"})

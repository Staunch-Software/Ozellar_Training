"""FastAPI application for the Ozellar Marine seafarer training portal.

Auth: crew log in with crew_id + date of birth (DDMMYYYY); admins with
email + password. All learner data (progress, assessments, certificates)
is tied to the authenticated user via a JWT bearer token.

Run:  uvicorn app.main:app --reload
"""
import csv
import io
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db, SessionLocal
from . import models, email_service
from .certificates import build_certificate_pdf
from .auth import (
    create_token, get_current_user, require_admin, user_public,
    verify_password, hash_password, parse_ddmmyyyy, normalize_name,
    check_rate_limit, clear_rate_limit,
)

# public origin used in the certificate's verification line / verify links
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://training.ozellar.com")

# admin course-builder uploads (slide images rendered from .pptx, uploaded
# videos) — served back out under /api/uploads so nginx's existing /api
# proxy (see deploy/nginx-ozellar.conf) covers it with no further config.
UPLOAD_DIR = os.getenv(
    "UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

from contextlib import asynccontextmanager

smartpal_scheduler = None
email_scheduler = None

def send_pending_digest_job():
    # Job to scan for pending approvals and send the digest
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    import jwt
    from datetime import datetime, timezone, timedelta
    
    admin_email = os.getenv("ADMIN_EMAIL")
    if not admin_email:
        print("[send_pending_digest] Skipped: ADMIN_EMAIL not set")
        return

    with SessionLocal() as db:
        pending = db.query(models.AssessmentApproval).filter_by(status="pending", digest_sent=False).all()
        if not pending:
            return
            
        approvals_list = []
        for ap in pending:
            user = db.get(models.User, ap.learner_id)
            course = db.get(models.Course, ap.course_id)
            if not user or not course:
                continue
                
            # Create a one-off token for approval. Valid for 7 days.
            from .auth import SECRET_KEY, ALGORITHM
            token_payload = {
                "sub": f"approve:{ap.id}",
                "exp": datetime.now(timezone.utc) + timedelta(days=7)
            }
            token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
            ap.approval_token = token
            ap.digest_sent = True
            
            approvals_list.append({
                "learner_name": user.full_name,
                "crew_id": user.crew_id,
                "course_title": course.title,
                "score": ap.score,
                "token": token
            })
            
        db.commit()
        if approvals_list:
            email_service.send_digest_email(admin_email, approvals_list)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global smartpal_scheduler, email_scheduler

    # 1. DB auto-seed
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

    # 2. Start Schedulers
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .smartpal_sync import schedule_jobs
    import asyncio
    
    if os.getenv("SMARTPAL_USERNAME") and os.getenv("SMARTPAL_PASSWORD"):
        smartpal_scheduler = AsyncIOScheduler()
        schedule_jobs(smartpal_scheduler)
        smartpal_scheduler.start()
        print("[startup] SmartPAL sync scheduled for 7:00 and 19:00 IST")
    else:
        print("[startup] SmartPAL sync disabled (SMARTPAL_USERNAME/PASSWORD not set)")

    interval = int(os.getenv("APPROVAL_DIGEST_INTERVAL_MINUTES", "30"))
    email_scheduler = AsyncIOScheduler()
    email_scheduler.add_job(send_pending_digest_job, 'interval', minutes=interval)
    email_scheduler.start()
    print(f"[startup] Approval digest email scheduled every {interval} minutes")

    try:
        yield
    except asyncio.CancelledError:
        pass
    finally:
        # Shutdown Schedulers
        if smartpal_scheduler:
            smartpal_scheduler.shutdown(wait=False)
        if email_scheduler:
            email_scheduler.shutdown(wait=False)

app = FastAPI(title="Ozellar Marine Training API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


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


@app.get("/api/auth/crew-search")
def crew_search(q: str, request: Request, db: Session = Depends(get_db)):
    """Public (pre-login) name autocomplete for the crew sign-in form.
    Deliberately minimal: only name + rank (never crew_id/DOB/passport/etc.),
    active learners only, capped result count, and a per-IP rate limit
    separate from the stricter login-attempt limiter — this endpoint has no
    credential to check, just a lookup, so it needs its own looser budget
    that still blocks bulk roster scraping."""
    check_rate_limit(f"crew-search:{request.client.host if request.client else 'unknown'}",
                     max_attempts=40, window_seconds=60)
    query = normalize_name(q)
    if len(query) < 1:
        return []
    candidates = (db.query(models.User)
                  .filter_by(role="learner", is_active=True).all())
    matches = [u for u in candidates if query in normalize_name(u.full_name)]
    matches.sort(key=lambda u: (not normalize_name(u.full_name).startswith(query), u.full_name))
    return [{"name": u.full_name, "rank": u.rank} for u in matches[:8]]


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


def serialize_course(db, course, progress, detail=False):
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
    
    # Check if certificate is pending
    cert_pending = False
    if progress and progress.passed:
        cert_pending = db.query(models.AssessmentApproval).filter_by(
            learner_id=progress.learner_id, course_id=course.id, status="pending"
        ).first() is not None
    data["certPending"] = cert_pending
    if detail:
        data["chapters"] = [{
            "id": ch.id, "n": ch.n, "chapterLabel": ch.chapter_label, "title": ch.title,
            "intro": ch.intro, "sections": ch.sections, "figure": ch.figure,
            "image": ch.image, "videos": ch.videos, "done": ch.id in done,
            "kind": ch.kind,
            # checkpoint quizzes are ungraded (non-blocking) — safe to send
            # the answer key straight to the client, unlike the final assessment
            "quizQuestions": [{
                "q": qq.prompt, "options": qq.options, "answer": qq.answer, "explain": qq.explain,
            } for qq in ch.quiz_questions] if ch.kind == "quiz" else [],
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
        
        # Include latest attempt if exists so the frontend can resume/show results directly
        if progress:
            latest = db.query(models.Attempt).filter_by(
                learner_id=progress.learner_id, course_id=course.id
            ).order_by(models.Attempt.id.desc()).first()
            if latest:
                attempts_used = db.query(models.Attempt).filter_by(
                    learner_id=progress.learner_id, course_id=course.id
                ).count()
                can_retry = False
                if not latest.passed:
                    if course.max_attempts is None:
                        can_retry = True
                    else:
                        can_retry = attempts_used < course.max_attempts
                
                show_answers = latest.passed or not can_retry
                questions = sorted(course.questions, key=lambda q: q.order)
                review = [{
                    "q": q.prompt, "options": q.options,
                    "correct": q.answer if (show_answers or a == q.answer) else None,
                    "chosen": a, "isCorrect": a == q.answer,
                    "explain": q.explain if (show_answers or a == q.answer) else None,
                } for q, a in zip(questions, latest.answers)]
                
                data["latestAttempt"] = {
                    "score": latest.score,
                    "passed": latest.passed,
                    "correct": sum(1 for q, a in zip(questions, latest.answers) if a == q.answer),
                    "total": len(questions),
                    "review": review,
                    "attemptsUsed": attempts_used,
                    "maxAttempts": course.max_attempts,
                    "certPending": cert_pending
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
    return [serialize_course(db, c, get_progress(db, lid, c.id)) for c in q.all()]


@app.get("/api/courses/{slug}")
def get_course(slug: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(models.Course).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Course not found")
    require_enrollment(db, user, c.id)
    return serialize_course(db, c, get_progress(db, str(user.id), c.id), detail=True)


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

    used = (db.query(models.Attempt)
            .filter_by(learner_id=user.id, course_id=course_id).count())
    if course.max_attempts and not already_passed:
        if used >= course.max_attempts:
            raise HTTPException(
                403, "No assessment attempts remaining. Contact your training officer.")

    correct = sum(1 for q, a in zip(questions, sub.answers) if a == q.answer)
    score = round(correct / len(questions) * 100)
    passed = score >= course.pass_mark

    # full audit trail: one row per submission
    attempt = models.Attempt(learner_id=user.id, course_id=course_id,
                          score=score, passed=passed, answers=sub.answers)
    db.add(attempt)
    db.flush()  # to get attempt.id
    
    # Progress holds the best result so a later worse attempt can't un-pass
    if not p:
        p = models.Progress(learner_id=lid, course_id=course_id, completed_chapters=[])
        db.add(p)
    if p.score is None or score > p.score:
        p.score = score
    p.passed = bool(p.passed) or passed

    if passed:
        # Check if they already have a certificate (e.g. they passed before and retook it)
        cert = None
        existing_cert = db.query(models.Certificate).filter_by(learner_id=lid, course_id=course.id).first()
        if existing_cert:
            cert = cert_dict(existing_cert, user, course)
            notify(db, user.id, "passed", "Assessment passed",
                   f"You passed {course.title} with {score}%. Your certificate is already available.",
                   f"/course/{course.slug}/certificate")
        else:
            # Queue for approval
            db.add(models.AssessmentApproval(
                learner_id=user.id, course_id=course.id, score=score, attempt_id=attempt.id
            ))
            notify(db, user.id, "passed", "Assessment passed",
                   f"You passed {course.title} with {score}%. Your result is pending admin approval for certificate generation.",
                   f"/course/{course.slug}/assessment")
    else:
        cert = None
        notify(db, user.id, "failed", "Assessment not passed",
               f"You scored {score}% on {course.title}. You can retry the assessment.",
               f"/course/{course.slug}/assessment")
    db.commit()

    can_retry = False
    if not passed:
        if course.max_attempts is None:
            can_retry = True
        else:
            can_retry = (used + 1) < course.max_attempts

    # always return review, but mask the correct answer if they failed and can retry
    show_answers = passed or not can_retry
    review = [{
        "q": q.prompt,
        "options": q.options,
        "correct": q.answer if (show_answers or a == q.answer) else None,
        "chosen": a,
        "isCorrect": a == q.answer,
        "explain": q.explain if (show_answers or a == q.answer) else None,
    } for q, a in zip(questions, sub.answers)]

    return {
        "score": score, "passed": passed, "correct": correct,
        "total": len(questions), "certificate": cert, "review": review,
        "attemptsUsed": used + 1, "maxAttempts": course.max_attempts,
        "certPending": passed and not cert
    }


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
        "photoPath": os.path.join(UPLOAD_DIR, "photos", f"{user.id}.jpg"),
        "verifyUrl": f"{PUBLIC_BASE_URL}/verify/{cert.id}",
    }


from fastapi.responses import HTMLResponse
import jwt
from .auth import SECRET_KEY, ALGORITHM

def _styled_html_response(title: str, message: str, is_success: bool = True):
    color = "#15a34a" if is_success else "#dc2626"
    icon = "&#10003;" if is_success else "&#10005;"
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ozellar Marine Training</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            body {{
                font-family: 'Inter', sans-serif;
                background-color: #f6f7f9;
                color: #16181d;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }}
            .card {{
                background: #ffffff;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                text-align: center;
                max-width: 440px;
                width: 90%;
            }}
            .icon-circle {{
                width: 64px;
                height: 64px;
                background-color: {color}15;
                color: {color};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                margin: 0 auto 24px;
            }}
            h2 {{
                margin: 0 0 12px;
                font-size: 20px;
                font-weight: 600;
            }}
            p {{
                margin: 0 0 24px;
                color: #5c626d;
                font-size: 15px;
                line-height: 1.5;
            }}
            .btn {{
                display: inline-block;
                background-color: #2f6fed;
                color: white;
                text-decoration: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: 500;
                font-size: 14px;
                transition: background-color 0.2s;
            }}
            .btn:hover {{
                background-color: #215dd6;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon-circle">{icon}</div>
            <h2>{title}</h2>
            <p>{message}</p>
        </div>
    </body>
    </html>
    """)

@app.get("/api/approve", response_class=HTMLResponse)
def approve_assessment(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub", "")
        if not sub.startswith("approve:"):
            raise ValueError()
        ap_id = int(sub.split(":")[1])
    except Exception:
        return _styled_html_response("Link Expired", "This approval link is invalid or has expired.", False)

    ap = db.get(models.AssessmentApproval, ap_id)
    if not ap or ap.status != "pending":
        return _styled_html_response("Already Processed", "This approval has already been processed or does not exist.", False)

    user = db.get(models.User, ap.learner_id)
    course = db.query(models.Course).filter_by(id=ap.course_id).first()
    
    # Generate certificate
    cert_info = issue_certificate(db, user, course)
    ap.status = "approved"
    ap.decided_at = datetime.now(timezone.utc)
    
    notify(db, user.id, "certificate", "Certificate Ready",
           f"Your certificate for {course.title} has been approved.",
           f"/course/{course.slug}/certificate")
    db.commit()

    # Generate PDF and email crew
    cert_obj = db.get(models.Certificate, cert_info["id"])
    pdf_bytes = build_certificate_pdf(cert_pdf_data(cert_obj, user, course))
    if user.email:
        email_service.send_approval_email(user.email, user.full_name, course.title, pdf_bytes, cert_info["id"])

    return _styled_html_response(
        "Assessment Approved", 
        f"You have successfully approved {user.full_name} for {course.title}. Their certificate has been generated and dispatched.", 
        True
    )


@app.get("/api/reject", response_class=HTMLResponse)
def reject_assessment(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub", "")
        if not sub.startswith("approve:"):
            raise ValueError()
        ap_id = int(sub.split(":")[1])
    except Exception:
        return _styled_html_response("Link Expired", "This rejection link is invalid or has expired.", False)

    ap = db.get(models.AssessmentApproval, ap_id)
    if not ap or ap.status != "pending":
        return _styled_html_response("Already Processed", "This approval has already been processed or does not exist.", False)

    user = db.get(models.User, ap.learner_id)
    course = db.query(models.Course).filter_by(id=ap.course_id).first()
    
    ap.status = "rejected"
    ap.decided_at = datetime.now(timezone.utc)
    
    notify(db, user.id, "failed", "Assessment Rejected",
           f"Your passing score for {course.title} was reviewed but not approved. Please retry.",
           f"/course/{course.slug}/assessment")
           
    # Update progress so they can retake
    p = db.query(models.Progress).filter_by(learner_id=str(user.id), course_id=course.id).first()
    if p:
        p.passed = False
        
    db.commit()

    if user.email:
        email_service.send_rejection_email(user.email, user.full_name, course.title)

    return _styled_html_response(
        "Assessment Rejected", 
        f"You have rejected the assessment for {user.full_name} for {course.title}. They have been notified to retry.", 
        True
    )

@app.post("/api/crew/photo")
async def upload_crew_photo(file: UploadFile = File(...), user: models.User = Depends(get_current_user)):
    if user.role != "learner":
        raise HTTPException(403, "Only crew members can upload photos")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    
    photos_dir = os.path.join(UPLOAD_DIR, "photos")
    os.makedirs(photos_dir, exist_ok=True)
    
    file_path = os.path.join(photos_dir, f"{user.id}.jpg")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    return {"status": "success"}



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
            "pending": False
        })
        
    pending_approvals = db.query(models.AssessmentApproval).filter_by(learner_id=user.id, status="pending").all()
    for ap in pending_approvals:
        course = db.query(models.Course).filter_by(id=ap.course_id).first()
        if not course:
            continue
        out.append({
            "id": f"pending-{ap.id}", "courseId": course.id, "slug": course.slug,
            "course": course.title, "score": ap.score,
            "issued": "Pending",
            "pending": True
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
    enr = (db.query(models.Enrollment)
           .filter_by(learner_id=learner.id, course_id=course.id).first())
    attempts = (db.query(models.Attempt)
                .filter_by(learner_id=learner.id, course_id=course.id).count())

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
        "startedOn": enr.assigned_at.strftime("%Y-%m-%d") if enr and enr.assigned_at else None,
        "passedOn": cert.issued_at.strftime("%Y-%m-%d") if cert and cert.issued_at else None,
        "attempts": attempts,
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


@app.get("/api/admin/dashboard-stats")
def admin_dashboard_stats(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Rich analytics for the admin dashboard charts."""
    from collections import defaultdict
    from datetime import date, timedelta

    # --- crew breakdown ---
    learners = db.query(models.User).filter_by(role="learner").all()
    rank_counts = defaultdict(int)
    status_counts = defaultdict(int)
    vessel_counts = defaultdict(int)
    for lr in learners:
        rank_counts[lr.rank or "Unspecified"] += 1
        status_counts[lr.emp_status or "Unknown"] += 1
        vessel_counts[lr.current_vessel or "Unassigned"] += 1

    rank_data = sorted(
        [{"rank": k, "count": v} for k, v in rank_counts.items()],
        key=lambda x: -x["count"]
    )[:12]  # top 12 ranks

    status_data = [{"status": k, "count": v} for k, v in status_counts.items() if v > 0]

    vessel_data = sorted(
        [{"vessel": k, "count": v} for k, v in vessel_counts.items() if k != "Unassigned"],
        key=lambda x: -x["count"]
    )[:8]

    # --- course stats ---
    courses = db.query(models.Course).order_by(models.Course.order).all()
    course_stats = []
    for c in courses:
        enrolled_ids = set(
            e.learner_id for e in db.query(models.Enrollment).filter_by(course_id=c.id).all()
        )
        total = len(enrolled_ids)
        if total == 0:
            course_stats.append({
                "course": c.title[:30], "courseId": c.id,
                "enrolled": 0, "passed": 0, "inProgress": 0,
                "assigned": 0, "passRate": 0,
            })
            continue
        passed = inprogress = 0
        for lid in enrolled_ids:
            prog = db.query(models.Progress).filter_by(
                learner_id=str(lid), course_id=c.id
            ).first()
            if prog and prog.passed:
                passed += 1
            elif prog and ((prog.completed_chapters and len(prog.completed_chapters) > 0) or prog.score is not None):
                inprogress += 1
        assigned = total - passed - inprogress
        course_stats.append({
            "course": c.title[:30], "courseId": c.id,
            "enrolled": total, "passed": passed,
            "inProgress": inprogress, "assigned": assigned,
            "passRate": round((passed / total) * 100) if total else 0,
        })

    # --- enrollment trend (last 6 months) ---
    today = date.today()
    months = []
    for i in range(5, -1, -1):
        # compute start of that month
        month_date = today.replace(day=1)
        for _ in range(i):
            month_date = (month_date - timedelta(days=1)).replace(day=1)
        months.append(month_date)

    enrollment_trend = []
    for m in months:
        if m.month == 12:
            next_m = m.replace(year=m.year + 1, month=1)
        else:
            next_m = m.replace(month=m.month + 1)
        count = (db.query(models.Enrollment)
                 .filter(models.Enrollment.assigned_at >= datetime(m.year, m.month, 1, tzinfo=timezone.utc),
                         models.Enrollment.assigned_at < datetime(next_m.year, next_m.month, 1, tzinfo=timezone.utc))
                 .count())
        enrollment_trend.append({"month": m.strftime("%b %Y"), "enrollments": count})

    # --- recent certificates ---
    recent_certs = (db.query(models.Certificate)
                    .order_by(models.Certificate.issued_at.desc())
                    .limit(8).all())
    recent_cert_list = []
    for cert in recent_certs:
        user_obj = db.get(models.User, int(cert.learner_id)) if (cert.learner_id or "").isdigit() else None
        course_obj = db.query(models.Course).filter_by(id=cert.course_id).first()
        recent_cert_list.append({
            "id": cert.id,
            "learner": user_obj.full_name if user_obj else "Unknown",
            "rank": user_obj.rank if user_obj else None,
            "course": course_obj.title if course_obj else cert.course_id,
            "score": cert.score,
            "issuedAt": cert.issued_at.isoformat() if cert.issued_at else None,
        })

    # --- top-level KPIs ---
    total_crew = len(learners)
    active_crew = sum(1 for u in learners if u.is_active)
    total_enrollments = db.query(models.Enrollment).count()
    total_certs = db.query(models.Certificate).count()
    total_courses = db.query(models.Course).count()
    total_attempts = db.query(models.Attempt).count()
    pass_attempts = db.query(models.Attempt).filter_by(passed=True).count()

    return {
        "kpis": {
            "totalCrew": total_crew,
            "activeCrew": active_crew,
            "totalEnrollments": total_enrollments,
            "totalCertificates": total_certs,
            "totalCourses": total_courses,
            "totalAttempts": total_attempts,
            "passAttempts": pass_attempts,
            "overallPassRate": round((pass_attempts / total_attempts) * 100) if total_attempts else 0,
        },
        "crewByRank": rank_data,
        "crewByStatus": status_data,
        "crewByVessel": vessel_data,
        "courseStats": course_stats,
        "enrollmentTrend": enrollment_trend,
        "recentCertificates": recent_cert_list,
    }


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


@app.get("/api/admin/report.xlsx")
def admin_report_xlsx(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
    crew_search: str = None,   # filter by crew name / crew_id / rank (case-insensitive substring)
    course_id:   str = None,   # filter to a single course column
    status:      str = None,   # filter rows to those with matching status ('passed'|'in-progress'|'assigned')
):
    """Download the compliance report as a styled Excel workbook.

    Supports the same filters exposed in the UI filter bar so that the
    downloaded Excel always matches exactly what the admin sees on screen.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    courses, rows = _report(db)

    # ---- apply UI filters (mirrors the frontend filter logic) ----
    if crew_search:
        q = crew_search.strip().lower()
        rows = [r for r in rows if
                q in (r["name"] or "").lower() or
                q in (r["crewId"] or "").lower() or
                q in (r["rank"] or "").lower()]

    if course_id:
        rows = [r for r in rows if course_id in r["cells"]]
        courses = [c for c in courses if c.id == course_id]

    if status:
        if course_id:
            rows = [r for r in rows if r["cells"].get(course_id, {}).get("status") == status]
        else:
            rows = [r for r in rows
                    if any(cell["status"] == status for cell in r["cells"].values())]

    # filter indicator for the sheet subtitle
    filter_note = []
    if crew_search: filter_note.append(f'Crew: "{crew_search}"')
    if course_id:
        c_obj = next((c for c in courses if c.id == course_id), None)
        if c_obj: filter_note.append(f"Course: {c_obj.title}")
    if status:
        filter_note.append(f"Status: {status}")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Compliance Report"

    # ---- colour palette ----
    HDR_FILL   = PatternFill("solid", fgColor="1E3A5F")   # dark navy
    PASS_FILL  = PatternFill("solid", fgColor="D6F5E3")   # soft green
    WIP_FILL   = PatternFill("solid", fgColor="FFF3CD")   # amber
    ASGN_FILL  = PatternFill("solid", fgColor="F2F4F7")   # light grey
    WHITE_FILL = PatternFill("solid", fgColor="FFFFFF")   # white (for merged crew cells)
    HDR_FONT   = Font(bold=True, color="FFFFFF", size=11)
    BODY_FONT  = Font(size=10)
    BOLD_FONT  = Font(bold=True, size=10)
    thin = Side(style="thin", color="D0D5DD")
    thick_bottom = Side(style="medium", color="475467")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    border_thick_bottom = Border(left=thin, right=thin, top=thin, bottom=thick_bottom)
    center = Alignment(horizontal="center", vertical="center")
    left   = Alignment(horizontal="left",   vertical="center", wrap_text=False)

    # ---- title row (row 1): report heading + filter summary ----
    title_text = "Ozellar Marine — Compliance Report"
    if filter_note:
        title_text += f"  |  Filters: {', '.join(filter_note)}"
    ws.merge_cells("A1:H1")
    tc = ws.cell(row=1, column=1, value=title_text)
    tc.font = Font(bold=True, size=12, color="1E3A5F")
    tc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 22

    # ---- sub-title row (row 2): generated timestamp + row count ----
    ws.merge_cells("A2:H2")
    sc = ws.cell(row=2, column=1,
                 value=f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}  ·  "
                       f"{len(rows)} crew member(s) shown")
    sc.font = Font(size=9, color="5C626D")
    sc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 16

    # ---- column headers (row 3) ----
    headers = ["Crew ID", "Name", "Rank", "Active",
               "Course", "Status", "Score (%)", "Attempts", "Started On", "Passed On"]
    ws.append(headers)
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=ci)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = center
        cell.border = border
    ws.row_dimensions[3].height = 22

    status_labels = {"passed": "Passed", "in-progress": "In Progress", "assigned": "Not Started"}
    row_idx = 4
    for r in rows:
        active = "Yes" if r["isActive"] else "No"
        start_row = row_idx
        
        if not r["cells"]:
            data = [r["crewId"], r["name"], r["rank"] or "", active,
                    "(no courses assigned)", "", "", "", "", ""]
            ws.append(data)
            for ci in range(1, 11):
                c = ws.cell(row=row_idx, column=ci)
                c.fill = ASGN_FILL if ci > 4 else WHITE_FILL
                c.font = BODY_FONT
                c.alignment = left; c.border = border
            row_idx += 1
            continue

        for course in courses:
            cell_data = r["cells"].get(course.id)
            if not cell_data:
                continue
            status = cell_data["status"]
            label  = status_labels.get(status, status)
            score  = cell_data["score"] if cell_data["score"] is not None else ""
            started_on = cell_data.get("startedOn") or ""
            passed_on = cell_data.get("passedOn") or ""
            attempts = cell_data.get("attempts", 0)
            if attempts == 0: attempts = ""

            fill = PASS_FILL if status == "passed" else (WIP_FILL if status == "in-progress" else ASGN_FILL)
            data = [r["crewId"], r["name"], r["rank"] or "", active,
                    course.title, label, score, attempts, started_on, passed_on]
            ws.append(data)
            for ci, val in enumerate(data, 1):
                c = ws.cell(row=row_idx, column=ci)
                # columns 1-4 are the crew info (merged later), keep them white
                c.fill = fill if ci > 4 else WHITE_FILL
                c.font = BOLD_FONT if ci == 2 else BODY_FONT
                c.alignment = left
                c.border = border
            row_idx += 1
            
        # merge cells for crew info if they span multiple rows
        if row_idx - 1 > start_row:
            for ci in range(1, 5):
                ws.merge_cells(start_row=start_row, start_column=ci, end_row=row_idx-1, end_column=ci)
                
        # apply thick bottom border to the last row of this user's block to separate users
        for ci in range(1, 11):
            ws.cell(row=row_idx-1, column=ci).border = border_thick_bottom

    # ---- auto column widths ----
    col_widths = [14, 26, 18, 8, 36, 14, 11, 10, 14, 14]
    for ci, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(ci)].width = w

    ws.freeze_panes = "A4"  # freeze title + subtitle + header rows

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ozellar-compliance-report.xlsx"},
    )


@app.get("/api/crew/my-report.xlsx")
def crew_my_report_xlsx(status: Optional[str] = None, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Crew personal training record as a styled Excel workbook.

    One sheet titled "My Training Record" with columns:
    Course | Status | Chapters Completed | Total Chapters | Progress (%) |
    Score (%) | Grade | Time Taken (days) | Certificate ID | Passed On

    Rows are colour-coded: green = passed, amber = in-progress, grey = not started.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    if user.role == "admin":
        raise HTTPException(403, "Use /api/admin/report.xlsx for admin reports")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "My Training Record"

    # ---- colour palette ----
    HDR_FILL  = PatternFill("solid", fgColor="1E3A5F")
    PASS_FILL = PatternFill("solid", fgColor="D6F5E3")
    WIP_FILL  = PatternFill("solid", fgColor="FFF3CD")
    ASGN_FILL = PatternFill("solid", fgColor="F2F4F7")
    HDR_FONT  = Font(bold=True, color="FFFFFF", size=11)
    BODY_FONT = Font(size=10)
    BOLD_FONT = Font(bold=True, size=10)
    thin   = Side(style="thin", color="D0D5DD")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center")
    left   = Alignment(horizontal="left",   vertical="center")

    # ---- title block ----
    ws.merge_cells("A1:L1")
    title_cell = ws.cell(row=1, column=1,
                         value=f"Training Record — {user.full_name}  ·  {user.rank or ''}")
    title_cell.font = Font(bold=True, size=13, color="1E3A5F")
    title_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells("A2:L2")
    sub_cell = ws.cell(row=2, column=1,
                       value=f"Crew ID: {user.crew_id or 'N/A'}   |   Generated: {datetime.now(timezone.utc).strftime('%d %b %Y')}")
    sub_cell.font = Font(size=10, color="5C626D")
    ws.row_dimensions[2].height = 18

    headers = ["Course", "Status", "Attempts", "Chapters Done", "Total Chapters",
               "Progress (%)", "Score (%)", "Grade", "Started On", "Passed On",
               "Time Taken (days)", "Certificate ID"]
    ws.append(headers)   # row 3
    for ci, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=ci)
        c.fill = HDR_FILL; c.font = HDR_FONT
        c.alignment = center; c.border = border
    ws.row_dimensions[3].height = 22

    assigned_ids = enrolled_course_ids(db, user.id)
    courses = (db.query(models.Course).filter(models.Course.id.in_(assigned_ids))
               .order_by(models.Course.order).all()) if assigned_ids else []

    row_idx = 4
    total_passed = 0
    for c in courses:
        prog = get_progress(db, str(user.id), c.id)
        cert = (db.query(models.Certificate)
                .filter_by(learner_id=str(user.id), course_id=c.id).first())

        done_count  = len(prog.completed_chapters or []) if prog else 0
        total_ch    = len(c.chapters)
        pct         = round(done_count / total_ch * 100) if total_ch else 0
        score       = prog.score if prog else None
        passed_flag = bool(prog.passed) if prog else False

        if passed_flag:
            if not cert:
                calc_status = "Pending Approval"
                fill = WIP_FILL
            else:
                calc_status = "Passed"
                fill = PASS_FILL
                total_passed += 1
        elif prog and (done_count > 0 or score is not None):
            calc_status = "In Progress"
            fill = WIP_FILL
        else:
            calc_status = "Not Started"
            fill = ASGN_FILL

        # Apply status filter
        if status == 'completed' and calc_status != "Passed": continue
        if status == 'in-progress' and calc_status not in ["In Progress", "Pending Approval"]: continue
        if status == 'not-started' and calc_status != "Not Started": continue

        # grade letter
        grade = ""
        if score is not None:
            if score >= 90:   grade = "A+"
            elif score >= 80: grade = "A"
            elif score >= 70: grade = "B"
            elif score >= 60: grade = "C"
            else:             grade = "F"

        # time taken: enrollment assigned_at → cert issued_at (days)
        time_days = ""
        started_on = ""
        enr = (db.query(models.Enrollment)
               .filter_by(learner_id=user.id, course_id=c.id).first())
        if enr and enr.assigned_at:
            started_on = enr.assigned_at.strftime("%d %b %Y")
            if cert and cert.issued_at:
                delta = cert.issued_at - enr.assigned_at
                time_days = max(0, delta.days)

        attempts = (db.query(models.Attempt)
                    .filter_by(learner_id=user.id, course_id=c.id).count())
        if attempts == 0: attempts = ""

        cert_id   = cert.id if cert else ""
        if passed_flag and not cert:
            passed_on = "Pending Approval"
        else:
            passed_on = cert.issued_at.strftime("%d %b %Y") if cert and cert.issued_at else ""
        score_str = score if score is not None else ""

        row_data = [c.title, calc_status, attempts, done_count, total_ch,
                    pct, score_str, grade, started_on, passed_on, time_days, cert_id]
        ws.append(row_data)

        for ci, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=ci)
            cell.fill = fill
            cell.font = BOLD_FONT if ci == 1 else BODY_FONT
            cell.alignment = left
            cell.border = border
        row_idx += 1

    # ---- summary row ----
    ws.append([])
    row_idx += 1
    summary_row = row_idx
    ws.cell(row=summary_row, column=1, value="SUMMARY").font = Font(bold=True, size=10, color="1E3A5F")
    ws.cell(row=summary_row, column=2,
            value=f"{total_passed} of {len(courses)} courses passed").font = BODY_FONT

    # ---- freeze panes & auto widths ----
    col_widths = [36, 15, 10, 15, 15, 14, 11, 8, 14, 14, 18, 22]
    for ci, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(ci)].width = w

    ws.freeze_panes = "A4"  # freeze title + header rows

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=ozellar-training-{user.crew_id or user.id}.xlsx"},
    )


# Lets an admin create a brand-new course from scratch: upload a .pptx
# (one slide -> one lesson chapter), upload standalone/attached videos,
# insert non-blocking checkpoint quizzes anywhere in the chapter sequence,
# freely reorder everything, and author the mandatory graded final
# assessment. Scoped to new courses only — the 3 seeded courses stay
# managed via courses_seed.json + reseed.

def _slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-") or "course"


def _unique_course_id(db, base: str) -> str:
    cid = base
    i = 2
    while db.get(models.Course, cid):
        cid = f"{base}-{i}"
        i += 1
    return cid


def _next_chapter_order(course) -> int:
    return (max((ch.order for ch in course.chapters), default=-1)) + 1


def _next_chapter_n(course) -> int:
    return (max((ch.n or 0 for ch in course.chapters), default=0)) + 1


def admin_course_summary(course):
    return {
        "id": course.id, "slug": course.slug, "title": course.title,
        "subtitle": course.subtitle, "passMark": course.pass_mark,
        "maxAttempts": course.max_attempts,
        "chapterCount": len(course.chapters), "questionCount": len(course.questions),
    }


def admin_chapter_detail(ch):
    return {
        "id": ch.id, "kind": ch.kind, "n": ch.n, "title": ch.title,
        "image": ch.image, "videos": ch.videos, "order": ch.order,
        "quizQuestions": [{
            "id": qq.id, "q": qq.prompt, "options": qq.options,
            "answer": qq.answer, "explain": qq.explain,
        } for qq in ch.quiz_questions] if ch.kind == "quiz" else [],
    }


class CreateCourseRequest(BaseModel):
    title: str
    subtitle: str | None = None
    icon: str | None = None
    gradient: str | None = None
    durationLabel: str | None = None
    passMark: int = 80
    maxAttempts: int | None = None


class CreateQuizChapterRequest(BaseModel):
    title: str
    afterChapterId: str | None = None


class QuizQuestionIn(BaseModel):
    q: str
    options: list[str]
    answer: int
    explain: str | None = None


class SaveQuizQuestionsRequest(BaseModel):
    questions: list[QuizQuestionIn]


class SaveAssessmentRequest(BaseModel):
    passMark: int
    maxAttempts: int | None = None
    questions: list[QuizQuestionIn]


class ReorderRequest(BaseModel):
    order: list[str]


@app.get("/api/admin/courses")
def admin_list_courses(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses = db.query(models.Course).order_by(models.Course.order).all()
    return [admin_course_summary(c) for c in courses]


@app.post("/api/admin/courses")
def admin_create_course(req: CreateCourseRequest, admin: models.User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    title = req.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    cid = _unique_course_id(db, _slugify(title))
    existing_orders = [c.order for c in db.query(models.Course).all()]
    course = models.Course(
        id=cid, slug=cid, title=title, subtitle=req.subtitle,
        icon=req.icon, gradient=req.gradient, duration_label=req.durationLabel,
        status="not-started", pass_mark=req.passMark, max_attempts=req.maxAttempts,
        order=(max(existing_orders) + 1) if existing_orders else 0,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return admin_course_summary(course)


@app.get("/api/admin/courses/{course_id}")
def admin_get_course_builder(course_id: str, admin: models.User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return {
        "id": course.id, "slug": course.slug, "title": course.title,
        "subtitle": course.subtitle, "passMark": course.pass_mark,
        "maxAttempts": course.max_attempts,
        "chapters": [admin_chapter_detail(ch) for ch in
                     sorted(course.chapters, key=lambda c: c.order)],
        "assessment": {
            "passMark": course.pass_mark, "maxAttempts": course.max_attempts,
            "questions": [{
                "id": q.id, "q": q.prompt, "options": q.options,
                "answer": q.answer, "explain": q.explain,
            } for q in sorted(course.questions, key=lambda q: q.order)],
        },
    }


from fastapi import BackgroundTasks
import time

def process_pptx_background(course_id: str, pptx_path: str, original_filename: str, course_dir: str):
    db = SessionLocal()
    try:
        course = db.query(models.Course).filter(models.Course.id == course_id).first()
        if not course: return

        with tempfile.TemporaryDirectory() as tmp:
            soffice_paths = [
                "soffice",
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
                r"C:\LibreOffice\program\soffice.exe"
            ]
            
            success = False
            last_err = None
            for sp in soffice_paths:
                try:
                    subprocess.run(
                        [sp, "--headless", "--convert-to", "pdf", "--outdir", tmp, pptx_path],
                        check=True, capture_output=True, timeout=3600,
                    )
                    success = True
                    break
                except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
                    last_err = e

            if not success:
                print(f"Background PPTX conversion failed: {last_err}")
                return

            pdf_filename = os.path.splitext(os.path.basename(pptx_path))[0] + ".pdf"
            pdf_path = os.path.join(tmp, pdf_filename)
            if not os.path.exists(pdf_path):
                print(f"PDF not produced by LibreOffice. Looked for {pdf_path}")
                return

            import fitz
            from pptx import Presentation

            try:
                prs = Presentation(pptx_path)
                slide_titles = []
                slide_full_texts = []
                for slide in prs.slides:
                    text = ""
                    full_text_parts = []
                    for shape in slide.shapes:
                        if getattr(shape, "has_text_frame", False):
                            full_text_parts.append(shape.text_frame.text.strip())
                        elif getattr(shape, "shape_type", None) == 6:
                            def _get_group_text(shp):
                                res = []
                                for s in shp.shapes:
                                    if getattr(s, "has_text_frame", False):
                                        res.append(s.text_frame.text.strip())
                                    elif getattr(s, "shape_type", None) == 6:
                                        res.extend(_get_group_text(s))
                                return res
                            full_text_parts.extend(_get_group_text(shape))
                    slide_full_texts.append("\n".join(full_text_parts))

                    title_shape = slide.shapes.title
                    if title_shape and title_shape.has_text_frame:
                        text = title_shape.text_frame.text.strip()
                    
                    if not text:
                        def _get_texts(shapes):
                            res = []
                            for s in shapes:
                                if getattr(s, "shape_type", None) == 6:
                                    res.extend(_get_texts(s.shapes))
                                elif getattr(s, "has_text_frame", False):
                                    t = s.text_frame.text.strip()
                                    if len(t) > 3:
                                        res.append((getattr(s, "top", 0) or 0, t))
                            return res
                        texts = _get_texts(slide.shapes)
                        if texts:
                            texts.sort(key=lambda x: x[0])
                            text = texts[0][1].split('\n')[0].strip()
                            
                    slide_titles.append(text if text else "")
            except Exception:
                slide_titles = []
                slide_full_texts = []
            
            import zipfile
            import xml.etree.ElementTree as ET
            
            slide_videos = {}
            try:
                with zipfile.ZipFile(pptx_path, "r") as z:
                    for name in z.namelist():
                        if name.startswith("ppt/slides/_rels/slide") and name.endswith(".xml.rels"):
                            try:
                                slide_num_str = name.split("slide")[2].split(".")[0]
                                slide_idx = int(slide_num_str) - 1
                                
                                rels_data = z.read(name)
                                root = ET.fromstring(rels_data)
                                ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
                                for rel in root.findall("r:Relationship", ns):
                                    target = rel.get("Target")
                                    if target and target.startswith("../media/") and target.lower().endswith(".mp4"):
                                        media_path = "ppt/" + target[3:]
                                        if media_path in z.namelist():
                                            media_data = z.read(media_path)
                                            basename = os.path.basename(target)
                                            vid_filename = f"slide{slide_num_str}_{basename}"
                                            vid_path = os.path.join(course_dir, vid_filename)
                                            with open(vid_path, "wb") as vf:
                                                vf.write(media_data)
                                            vid_url = f"/api/uploads/{course_id}/{vid_filename}"
                                            if slide_idx not in slide_videos:
                                                slide_videos[slide_idx] = set()
                                            slide_videos[slide_idx].add(vid_url)
                            except Exception as e:
                                print(f"Error parsing {name}: {e}")
            except Exception as e:
                print(f"Error parsing PPTX zip for videos: {e}")

            doc = fitz.open(pdf_path)
            start_n = max((ch.n or 0 for ch in course.chapters), default=0)
            next_order = _next_chapter_order(course)
            
            for i, page in enumerate(doc):
                n = start_n + i + 1
                pix = page.get_pixmap(dpi=150)
                filename = f"slide{n}.png"
                pix.save(os.path.join(course_dir, filename))
                
                slide_title = slide_titles[i] if i < len(slide_titles) and slide_titles[i] else f"Slide {n}"
                vids = list(slide_videos.get(i, set()))
                
                full_text = slide_full_texts[i] if i < len(slide_full_texts) else ""
                is_quiz = ("quiz" in slide_title.lower()) or ("A. " in full_text and "B. " in full_text)
                ch_kind = "quiz" if is_quiz else "lesson"
                
                quiz_questions = []
                if is_quiz:
                    import re
                    lines = full_text.split('\n')
                    prompt_lines = []
                    options = []
                    ans_idx = 0
                    for line in lines:
                        line_s = line.strip()
                        if not line_s: continue
                        
                        ans_match = re.search(r'answer:\s*([A-E])', line_s, re.IGNORECASE)
                        if ans_match:
                            ans_idx = ord(ans_match.group(1).upper()) - ord('A')
                            continue

                        if re.match(r'^[A-E]\.', line_s):
                            options.append(line_s)
                        else:
                            if not options and line_s.lower() != "quiz":
                                prompt_lines.append(line_s)
                    
                    if options:
                        quiz_questions = [models.ChapterQuestion(
                            prompt=" ".join(prompt_lines).strip() or slide_title,
                            options=options,
                            answer=ans_idx,
                            explain="Auto-extracted from slide."
                        )]
                
                ch = models.Chapter(
                    id=f"{course_id}-slide-{n}", course_id=course_id, n=n,
                    title=slide_title,
                    sections=[], videos=vids, order=next_order + i, kind=ch_kind,
                    image=f"/api/uploads/{course_id}/{filename}",
                    quiz_questions=quiz_questions
                )
                db.add(ch)
            doc.close()
        db.commit()
        print(f"Background PPTX processing finished for {course_id}")
    except Exception as e:
        print(f"Background PPTX processing failed entirely: {e}")
    finally:
        db.close()
        if os.path.exists(pptx_path):
            os.remove(pptx_path)

@app.post("/api/admin/courses/{course_id}/upload-pptx")
async def upload_course_pptx(course_id: str, background_tasks: BackgroundTasks,
                             file: UploadFile = File(...),
                             admin: models.User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    if not (file.filename or "").lower().endswith(".pptx"):
        raise HTTPException(400, "File must be a .pptx")

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)
    
    pptx_filename = f"pending_{int(time.time())}_{file.filename}"
    pptx_path = os.path.join(course_dir, pptx_filename)
    with open(pptx_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    background_tasks.add_task(process_pptx_background, course_id, pptx_path, file.filename, course_dir)
    return {"message": "Processing started in background."}

@app.post("/api/admin/courses/{course_id}/upload-video")
async def admin_upload_video(course_id: str, file: UploadFile = File(...),
                             chapterId: str | None = Form(None), title: str | None = Form(None),
                             admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".mp4"
    prefix = f"/api/uploads/{course_id}/video"
    existing = sum(1 for ch in course.chapters for v in (ch.videos or []) if v.startswith(prefix))
    filename = f"video{existing + 1}{ext}"
    with open(os.path.join(course_dir, filename), "wb") as f:
        shutil.copyfileobj(file.file, f)
    url = f"/api/uploads/{course_id}/{filename}"

    if chapterId:
        ch = db.get(models.Chapter, chapterId)
        if not ch or ch.course_id != course_id:
            raise HTTPException(404, "Chapter not found")
        ch.videos = [*(ch.videos or []), url]
        db.commit()
        return admin_chapter_detail(ch)

    ch = models.Chapter(
        id=f"{course_id}-video-{_next_chapter_n(course)}", course_id=course_id,
        n=_next_chapter_n(course), title=(title or "Video").strip() or "Video",
        sections=[], videos=[url], order=_next_chapter_order(course), kind="lesson",
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return admin_chapter_detail(ch)


@app.post("/api/admin/courses/{course_id}/quiz-chapters")
def admin_create_quiz_chapter(course_id: str, req: CreateQuizChapterRequest,
                              admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    chapters = sorted(course.chapters, key=lambda c: c.order)

    if req.afterChapterId:
        idx = next((i for i, ch in enumerate(chapters) if ch.id == req.afterChapterId), None)
        if idx is None:
            raise HTTPException(404, "Reference chapter not found")
        insert_at = idx + 1
    else:
        insert_at = len(chapters)

    quiz = models.Chapter(
        id=f"{course_id}-quiz-{_next_chapter_n(course)}", course_id=course_id,
        n=_next_chapter_n(course), title=req.title.strip() or "Quiz",
        sections=[], videos=[], kind="quiz", order=0,
    )
    chapters.insert(insert_at, quiz)
    db.add(quiz)
    for i, ch in enumerate(chapters):
        ch.order = i
        ch.n = i + 1
    db.commit()
    db.refresh(quiz)
    return admin_chapter_detail(quiz)


@app.put("/api/admin/courses/{course_id}/chapters/{chapter_id}/quiz-questions")
def admin_save_quiz_questions(course_id: str, chapter_id: str, req: SaveQuizQuestionsRequest,
                              admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    ch = db.get(models.Chapter, chapter_id)
    if not ch or ch.course_id != course_id:
        raise HTTPException(404, "Chapter not found")
    if ch.kind != "quiz":
        raise HTTPException(400, "This chapter is not a quiz")
    db.query(models.ChapterQuestion).filter_by(chapter_id=chapter_id).delete()
    for i, q in enumerate(req.questions):
        db.add(models.ChapterQuestion(
            chapter_id=chapter_id, prompt=q.q, options=q.options,
            answer=q.answer, explain=q.explain, order=i,
        ))
    db.commit()
    db.refresh(ch)
    return admin_chapter_detail(ch)


@app.put("/api/admin/courses/{course_id}/reorder")
def admin_reorder_chapters(course_id: str, req: ReorderRequest,
                           admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if set(req.order) != {ch.id for ch in course.chapters}:
        raise HTTPException(400, "Order must include exactly the course's current chapters")
    by_id = {ch.id: ch for ch in course.chapters}
    for i, cid in enumerate(req.order):
        by_id[cid].order = i
        by_id[cid].n = i + 1
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/courses/{course_id}/chapters/{chapter_id}")
def admin_delete_chapter(course_id: str, chapter_id: str,
                         admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    ch = db.get(models.Chapter, chapter_id)
    if not ch or ch.course_id != course_id:
        raise HTTPException(404, "Chapter not found")
    prefix = f"/api/uploads/{course_id}/"
    files_to_remove = [p for p in [ch.image, *(ch.videos or [])] if p and p.startswith(prefix)]
    db.delete(ch)
    db.flush()
    # Re-index remaining chapters so 'n' and 'order' remain contiguous
    course = db.get(models.Course, course_id)
    if course:
        remaining = sorted(course.chapters, key=lambda c: c.order)
        for i, r in enumerate(remaining):
            r.order = i
            r.n = i + 1
    db.commit()
    for p in files_to_remove:
        try:
            os.remove(os.path.join(UPLOAD_DIR, course_id, os.path.basename(p)))
        except OSError:
            pass
    return {"ok": True}


@app.put("/api/admin/courses/{course_id}/assessment")
def admin_save_assessment(course_id: str, req: SaveAssessmentRequest,
                          admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    course.pass_mark = req.passMark
    course.max_attempts = req.maxAttempts
    db.query(models.Question).filter_by(course_id=course_id).delete()
    for i, q in enumerate(req.questions):
        db.add(models.Question(
            course_id=course_id, prompt=q.q, options=q.options,
            answer=q.answer, explain=q.explain, order=i,
        ))
    db.commit()
    return admin_get_course_builder(course_id, admin, db)

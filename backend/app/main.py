"""FastAPI application for the Ozellar Marine seafarer training portal.

Auth: crew log in with crew_id + date of birth (DDMMYYYY); admins with
email + password. All learner data (progress, assessments, certificates)
is tied to the authenticated user via a JWT bearer token.

Run:  uvicorn app.main:app --reload
"""
import csv
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import get_db, SessionLocal
from . import models, email_service, storage
from .video import compress_video
from .certificates import build_certificate_pdf
from .auth import (
    create_token, get_current_user, require_admin, require_super_admin, user_public,
    verify_password, hash_password, parse_ddmmyyyy, normalize_name,
    check_rate_limit, clear_rate_limit,
    # screening test auth
    create_screening_token, get_current_candidate, candidate_public,
    # orientation program approver auth
    require_vessel_approver,
    bearer, SECRET_KEY, ALGORITHM,
)
from . import orientation_ranks

# public origin used in the certificate's verification line / verify links
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://training.ozellar.com")

# admin course-builder uploads (slide images rendered from .pptx, uploaded
# videos) — served back out under /api/uploads so nginx's existing /api
# proxy (see deploy/nginx-ozellar.conf) covers it with no further config.
UPLOAD_DIR = os.getenv(
    "UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import jwt

smartpal_scheduler = None
email_scheduler = None

def send_pending_digest_job():
    # Job to scan for pending approvals and send the digest to the configured admin mailbox
    from datetime import datetime, timezone, timedelta

    with SessionLocal() as db:
        admin_email = os.getenv("ADMIN_EMAIL")
        recipients = [admin_email] if admin_email else []
        if not recipients:
            print("[send_pending_digest] Skipped: ADMIN_EMAIL not set")
            return

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
                "type": "approval",
                "exp": datetime.now(timezone.utc) + timedelta(days=7)
            }
            token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
            ap.approval_token = token
            ap.digest_sent = True

            approvals_list.append({
                "learner_name": user.full_name,
                "crew_id": user.crew_id,
                "rank": user.rank,
                "mobile_no": user.mobile_number,
                "course_title": course.title,
                "score": ap.score,
                "token": token
            })

        db.commit()
        if approvals_list:
            for recipient in recipients:
                email_service.send_digest_email(recipient, approvals_list)


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

# NOTE: We do NOT use StaticFiles for uploads because it does not support
# HTTP Range requests, which are required for HTML5 video seeking.
# Instead, we use a custom endpoint below that handles Range headers properly.

import mimetypes

@app.get("/api/uploads/{course_id}/{filename}")
def serve_upload(course_id: str, filename: str, request: Request):
    # Plain `def` on purpose: storage.get_size() is a blocking Azure round-trip.
    # As `async def` it ran on the event loop and froze every other request
    # (login, page loads) for each image/video/Range request.
    file_size = storage.get_size(course_id, filename)
    if file_size is None:
        raise HTTPException(status_code=404, detail="File not found")

    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "application/octet-stream"

    range_header = request.headers.get("range")
    if range_header:
        # Parse Range: bytes=start-end
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            chunk_size = end - start + 1

            return StreamingResponse(
                storage.stream_range(course_id, filename, start, end),
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                    "Cache-Control": "public, max-age=3600",
                }
            )

    # No range header - serve entire file
    return StreamingResponse(
        storage.stream_full(course_id, filename),
        media_type=mime_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Cache-Control": "public, max-age=3600",
        }
    )


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
        check_rate_limit(db, f"crew:{normalize_name(name)}:{dob_raw}")
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
        clear_rate_limit(db, f"crew:{normalize_name(name)}:{dob_raw}")

    elif req.mode == "admin":
        email = (req.email or "").strip().lower()
        check_rate_limit(db, f"admin:{email}")
        user = (db.query(models.User)
                .filter(models.User.email == email, models.User.role.in_(["admin", "super_admin"]))
                .first())
        if not user or not user.password_hash or not verify_password(req.password or "", user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        clear_rate_limit(db, f"admin:{email}")
    else:
        raise HTTPException(400, "Invalid login mode")

    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    return {"token": create_token(user), "user": user_public(user)}


@app.get("/api/auth/crew-search")
def crew_search(q: str, request: Request, scope: str | None = None, db: Session = Depends(get_db)):
    """Public (pre-login) name autocomplete for the crew sign-in form.
    Deliberately minimal: only name + rank (never crew_id/DOB/passport/etc.),
    active learners only, capped result count, and a per-IP rate limit
    separate from the stricter login-attempt limiter — this endpoint has no
    credential to check, just a lookup, so it needs its own looser budget
    that still blocks bulk roster scraping.

    ?scope=orientation (used by the Login page's "Orientation" tab) narrows
    suggestions to who that tab is actually for: on-sail deck/engine
    officers (who can be working through a promotion checklist — this also
    covers Master/Chief Engineer, the top rank in each ladder, so they show
    up as approvers) plus anyone with an orientation enrollment already on
    record even if no longer on sail. Everyone else (ratings, cadets,
    office staff, crew never touched by Orientation Program) is excluded —
    the plain Crew tab search is unfiltered."""
    check_rate_limit(db, f"crew-search:{request.client.host if request.client else 'unknown'}",
                     max_attempts=40, window_seconds=60)
    query = normalize_name(q)
    if len(query) < 1:
        return []
    candidates = (db.query(models.User)
                  .filter_by(role="learner", is_active=True).all())
    matches = [u for u in candidates if query in normalize_name(u.full_name)]
    if scope == "orientation":
        enrolled_ids = {e.learner_id for e in db.query(models.OrientationEnrollment.learner_id).all()}
        matches = [u for u in matches if u.id in enrolled_ids
                  or (orientation_ranks.is_eligible_crew(u.rank) and (u.emp_status or "").strip().upper() == "SAIL")]
    matches.sort(key=lambda u: (not normalize_name(u.full_name).startswith(query), u.full_name))
    return [{"name": u.full_name, "rank": u.rank} for u in matches[:8]]


@app.get("/api/auth/me")
def me(
    creds = Depends(bearer),
    db: Session = Depends(get_db),
):
    """Universal /me endpoint — handles session tokens (crew/admin) and
    test_session tokens (screening test candidates)."""
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired — please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid authentication token")

    token_type = payload.get("type", "session")
    if token_type == "session":
        user = db.get(models.User, str(payload["sub"]))
        if not user or not user.is_active:
            raise HTTPException(401, "User not found or inactive")
        return user_public(user)
    elif token_type == "test_session":
        candidate = db.get(models.ScreeningCandidate, str(payload["sub"]))
        if not candidate or not candidate.is_active:
            raise HTTPException(401, "Candidate not found or inactive")
        return candidate_public(candidate)
    else:
        raise HTTPException(401, "Invalid token type")



# ======================= COURSES =======================
def get_progress(db, learner_id, course_id):
    return (db.query(models.Progress)
            .filter_by(learner_id=learner_id, course_id=course_id).first())


def notify(db, user_id, kind, title, body=None, link=None):
    """Create an in-app notification (caller commits)."""
    db.add(models.Notification(user_id=user_id, kind=kind, title=title,
                               body=body, link=link))


def _revoke_course_completion(db, course_id):
    """When a new module is added, re-assign the course to users who already completed it,
    and notify all enrolled users."""
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        return
        
    course_name = course.title
    slug = course.slug if course.slug else course_id
    
    # 1. Reset completion for those who passed
    progress_records = db.query(models.Progress).filter(
        models.Progress.course_id == course_id,
        models.Progress.passed == True
    ).all()
    
    for p in progress_records:
        p.passed = False
        
    # 2. Notify ALL assigned users
    enrollments = db.query(models.Enrollment).filter_by(course_id=course_id).all()
    for e in enrollments:
        notify(
            db, e.learner_id, "info", "Course Updated",
            f"A new module was added to '{course_name}'. Please complete the new content.",
            f"/course/{slug}"
        )


def enrolled_course_ids(db, user_id):
    return [e.course_id for e in
            db.query(models.Enrollment).filter_by(learner_id=user_id).all()]


def require_enrollment(db, user, course_id):
    """Admins may access any course (preview); learners must be assigned it."""
    if user.role in ("admin", "super_admin"):
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
        "hasAssessment": len(course.questions) > 0,
    }
    
    # Check if certificate is pending
    cert_pending = False
    if progress and progress.passed:
        cert_pending = db.query(models.AssessmentApproval).filter_by(
            learner_id=progress.learner_id, course_id=course.id, status="pending"
        ).first() is not None
    data["certPending"] = cert_pending
    if detail:
        attempts_used = 0
        if progress:
            attempts_used = db.query(models.Attempt).filter_by(
                learner_id=progress.learner_id, course_id=course.id
            ).count()
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
            "attemptsUsed": attempts_used,
            "questions": [{
                "q": q.prompt, "options": q.options,
            } for q in course.questions],
        }
        
        # Include latest attempt if exists so the frontend can resume/show results directly
        if progress:
            latest = db.query(models.Attempt).filter_by(
                learner_id=progress.learner_id, course_id=course.id
            ).order_by(models.Attempt.created_at.desc()).first()
            if latest:
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
    lid = user.id
    q = db.query(models.Course).order_by(models.Course.order)
    if user.role not in ("admin", "super_admin"):
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
    return serialize_course(db, c, get_progress(db, user.id, c.id), detail=True)


def _maybe_auto_complete_course(db, course, progress, learner_id):
    """Courses with no final assessment pass automatically once every chapter
    is done. This also has to run when a chapter is *deleted* out from under
    a learner who had already finished everything else — otherwise their
    progress bar reads 100% but nothing ever queues the certificate for
    admin approval. Returns True if this call just flipped them to passed.
    """
    if course.questions or progress.passed:
        return False
    all_chapter_ids = {ch.id for ch in course.chapters}
    done = set(progress.completed_chapters or [])
    if not all_chapter_ids or not (done >= all_chapter_ids):
        return False
    progress.passed = True
    db.flush()  # ensure progress.id is available

    # Queue for admin approval (same flow as a passed assessment)
    from .auth import SECRET_KEY, ALGORITHM
    ap = models.AssessmentApproval(
        learner_id=learner_id, course_id=course.id,
        score=None, attempt_id=None,
    )
    db.add(ap)
    db.flush()  # get ap.id
    token_payload = {
        "sub": f"approve:{ap.id}",
        "type": "approval",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    ap.approval_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)

    notify(
        db, learner_id, "passed", "Course completed",
        f"You have completed all lessons in {course.title}. Your certificate is pending admin approval.",
        f"/my-courses",
    )
    return True


@app.post("/api/courses/{course_id}/chapters/{chapter_id}/complete")
def complete_chapter(course_id: str, chapter_id: str,
                     user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_enrollment(db, user, course_id)
    lid = user.id
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    p = get_progress(db, lid, course_id)
    if not p:
        p = models.Progress(learner_id=lid, course_id=course_id, completed_chapters=[])
        db.add(p)
    done = list(p.completed_chapters or [])
    if chapter_id not in done:
        done.append(chapter_id)
    p.completed_chapters = done

    auto_completed = _maybe_auto_complete_course(db, course, p, lid)

    db.commit()
    return {"ok": True, "completed": done, "autoCompleted": auto_completed}


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

    lid = user.id
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
            ap = models.AssessmentApproval(
                learner_id=user.id, course_id=course.id, score=score, attempt_id=attempt.id
            )
            db.add(ap)
            db.flush()
            
            # Generate the approval token immediately
            from .auth import SECRET_KEY, ALGORITHM
            token_payload = {
                "sub": f"approve:{ap.id}",
                "type": "approval",
                "exp": datetime.now(timezone.utc) + timedelta(days=7)
            }
            ap.approval_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
            
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


def _course_code(slug: str) -> str:
    """Abbreviate a course slug for certificate IDs: initials of each
    hyphen-separated word (e.g. "mental-health" -> "MH",
    "cargo-operations" -> "CO"). Single-word slugs are kept as-is since an
    initial alone would be too short to be meaningful."""
    words = slug.split("-")
    if len(words) < 2:
        return slug.upper()
    return "".join(w[0] for w in words if w).upper()


def issue_certificate(db, user, course):
    lid = user.id
    existing = (db.query(models.Certificate)
                .filter_by(learner_id=lid, course_id=course.id).first())
    if existing:
        return cert_dict(existing, user, course)
    year = datetime.now(timezone.utc).year
    
    seq_record = models.CertificateSequence()
    db.add(seq_record)
    db.flush() # flush to get seq_record.id
    
    seq = seq_record.id
    
    c = course.cert or {}
    course_code = c.get("certPrefix")
    if not course_code:
        course_code = _course_code(course.slug)
        
    cid = f"OZ-{course_code}-{year}-{seq:04d}"
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
            .filter_by(learner_id=user.id, course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    return cert_dict(cert, user, course)


def cert_pdf_data(cert, user, course):
    c = course.cert or {}
    topics = c.get("topics")
    if not topics:
        # Fallback to chapter titles if no specific topics are set
        unwanted = {
            "introduction", "summary", "conclusion", "quiz", "assessment", 
            "final assessment", "why", "why?", "how", "how?", "what", "what?", 
            "overview", "agenda", "objectives"
        }
        topics = [
            ch.title for ch in course.chapters 
            if ch.kind != "quiz" 
            and ch.title.lower().strip() not in unwanted
            and not ch.title.lower().strip().startswith("slide ")
        ]

    return {
        "id": cert.id,
        "learner": user.full_name,
        "ppNo": user.pp_no,
        "titleUpper": c.get("titleUpper") or course.title.upper(),
        "topics": topics[:8],  # max 8 topics on certificate
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else "",
        "location": os.getenv("CERT_LOCATION", "Chennai"),
        "photoPath": os.path.join(UPLOAD_DIR, "photos", f"{user.id}.jpg"),
        "verifyUrl": f"{PUBLIC_BASE_URL}/verify/{cert.id}",
        "durationHours": c.get("durationHours") or 4,
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

def _decode_approval_token(token: str) -> str:
    """Returns the AssessmentApproval id encoded in a mailed approval/rejection token, or raises."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "approval":
        raise ValueError("Invalid token type")
    sub = payload.get("sub", "")
    if not sub.startswith("approve:"):
        raise ValueError()
    return sub.split(":")[1]


def _approve_remark_form_page(ap, user, course, token: str, error: str | None = None):
    """Confirmation page shown when a super admin clicks Approve in the digest email —
    a remark is required before the certificate is actually issued."""
    score_str = f"{ap.score}%" if ap.score is not None else "N/A"
    error_html = f'<div class="error">{error}</div>' if error else ""
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Approve Certificate — Ozellar Marine Training</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body {{
                font-family: 'Inter', sans-serif; background-color: #f6f7f9; color: #16181d;
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box;
            }}
            .card {{
                background: #ffffff; padding: 36px; border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06);
                max-width: 480px; width: 100%;
            }}
            h2 {{ margin: 0 0 4px; font-size: 20px; font-weight: 700; }}
            .sub {{ margin: 0 0 20px; color: #5c626d; font-size: 13px; }}
            .info {{ background: #f6f7f9; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }}
            .info-row {{ display: flex; justify-content: space-between; font-size: 13.5px; padding: 3px 0; }}
            .info-row span:first-child {{ color: #5c626d; }}
            .info-row span:last-child {{ font-weight: 600; }}
            label {{ display: block; font-size: 12px; font-weight: 600; color: #5c626d; margin-bottom: 6px; }}
            textarea {{
                width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
                border: 1px solid #d0d5dd; font-family: inherit; font-size: 14px; resize: vertical;
            }}
            .error {{ color: #dc2626; font-size: 13px; margin: 10px 0 0; }}
            .actions {{ display: flex; gap: 10px; margin-top: 20px; }}
            .btn {{
                flex: 1; display: inline-block; text-align: center; border: none; cursor: pointer;
                background-color: #15a34a; color: white; padding: 11px 20px; border-radius: 8px;
                font-weight: 600; font-size: 14px;
            }}
            .btn:hover {{ background-color: #128a3e; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Approve Certificate</h2>
            <p class="sub">Add a remark to confirm this certificate approval.</p>
            <div class="info">
                <div class="info-row"><span>Crew Member</span><span>{user.full_name}</span></div>
                <div class="info-row"><span>Crew ID</span><span>{user.crew_id or '—'}</span></div>
                <div class="info-row"><span>Rank</span><span>{user.rank or '—'}</span></div>
                <div class="info-row"><span>Course</span><span>{course.title}</span></div>
                <div class="info-row"><span>Score</span><span>{score_str}</span></div>
            </div>
            <form method="POST" action="/api/approve">
                <input type="hidden" name="token" value="{token}">
                <label for="remark">Approval remark (required)</label>
                <textarea id="remark" name="remark" rows="3" required placeholder="e.g. Verified against onboard assessment records"></textarea>
                {error_html}
                <div class="actions">
                    <button type="submit" class="btn">Approve &amp; Issue Certificate</button>
                </div>
            </form>
        </div>
    </body>
    </html>
    """)


@app.get("/api/approve", response_class=HTMLResponse)
def approve_assessment_form(token: str, db: Session = Depends(get_db)):
    """Shows the remark-entry confirmation page linked from the digest email."""
    try:
        ap_id = _decode_approval_token(token)
    except Exception:
        return _styled_html_response("Link Expired", "This approval link is invalid or has expired.", False)

    ap = db.get(models.AssessmentApproval, ap_id)
    if not ap or ap.status != "pending":
        return _styled_html_response("Already Processed", "This approval has already been processed or does not exist.", False)

    user = db.get(models.User, ap.learner_id)
    course = db.query(models.Course).filter_by(id=ap.course_id).first()
    if not user or not course:
        return _styled_html_response("Not Found", "The learner or course for this approval could not be found.", False)

    return _approve_remark_form_page(ap, user, course, token)


@app.post("/api/approve", response_class=HTMLResponse)
def approve_assessment(token: str = Form(...), remark: str = Form(...), db: Session = Depends(get_db)):
    try:
        ap_id = _decode_approval_token(token)
    except Exception:
        return _styled_html_response("Link Expired", "This approval link is invalid or has expired.", False)

    ap = db.get(models.AssessmentApproval, ap_id)
    if not ap or ap.status != "pending":
        return _styled_html_response("Already Processed", "This approval has already been processed or does not exist.", False)

    user = db.get(models.User, ap.learner_id)
    course = db.query(models.Course).filter_by(id=ap.course_id).first()
    if not user or not course:
        return _styled_html_response("Not Found", "The learner or course for this approval could not be found.", False)

    remark = (remark or "").strip()
    if not remark:
        return _approve_remark_form_page(ap, user, course, token, error="A remark is required to approve.")

    # Generate certificate
    cert_info = issue_certificate(db, user, course)
    ap.status = "approved"
    ap.decided_at = datetime.now(timezone.utc)
    ap.remark = remark

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


@app.get("/api/preview-certificate")
def preview_assessment_certificate(token: str, db: Session = Depends(get_db)):
    """Generates a preview PDF of the certificate for an admin reviewing an approval digest email."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "approval":
            raise ValueError("Invalid token type")
        sub = payload.get("sub", "")
        if not sub.startswith("approve:"):
            raise ValueError()
        ap_id = sub.split(":")[1]
    except Exception:
        raise HTTPException(400, "Invalid or expired token")

    ap = db.get(models.AssessmentApproval, ap_id)
    if not ap:
        raise HTTPException(404, "Approval request not found")

    user = db.get(models.User, ap.learner_id)
    course = db.query(models.Course).filter_by(id=ap.course_id).first()
    
    class MockCert:
        id = "PREVIEW-ONLY"
        issued_at = datetime.now(timezone.utc)
        
    pdf = build_certificate_pdf(cert_pdf_data(MockCert(), user, course))
    filename = f"PREVIEW_{user.full_name.replace(' ', '_')}_{course.slug}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


@app.get("/api/reject", response_class=HTMLResponse)
def reject_assessment(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "approval":
            raise ValueError("Invalid token type")
        sub = payload.get("sub", "")
        if not sub.startswith("approve:"):
            raise ValueError()
        ap_id = sub.split(":")[1]
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
    p = db.query(models.Progress).filter_by(learner_id=user.id, course_id=course.id).first()
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

@app.get("/api/crew/photo")
def get_crew_photo(user: models.User = Depends(get_current_user)):
    if user.role != "learner":
        raise HTTPException(403, "Only crew members have photos")
    photo_path = os.path.join(UPLOAD_DIR, "photos", f"{user.id}.jpg")
    if not os.path.exists(photo_path):
        raise HTTPException(404, "No photo on record")
    with open(photo_path, "rb") as fh:
        return Response(fh.read(), media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=300"})

_FACE_CASCADE = None

def _get_face_cascade():
    """Lazily load (and cache) the Haar cascade used to check that an
    uploaded passport photo actually shows a clear face."""
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        import cv2
        _FACE_CASCADE = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    return _FACE_CASCADE


def _assert_clear_passport_face(image):
    """Reject photos that don't show exactly one clear, reasonably large face."""
    import cv2
    import numpy as np

    width, height = image.size
    gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
    faces = _get_face_cascade().detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(int(width * 0.15), int(height * 0.15)),
    )
    if len(faces) == 0:
        raise HTTPException(
            400,
            "No clear face detected — please reupload a passport-size photo showing your face clearly, facing the camera"
        )
    if len(faces) > 1:
        raise HTTPException(
            400,
            "More than one face detected — please reupload a passport-size photo of yourself alone"
        )

    _, _, fw, fh = faces[0]
    if (fw * fh) / (width * height) < 0.06:
        raise HTTPException(
            400,
            "Your face is too small/unclear in this photo — please reupload a closer passport-size photo showing your face clearly"
        )


@app.post("/api/crew/photo")
async def upload_crew_photo(file: UploadFile = File(...), user: models.User = Depends(get_current_user)):
    from PIL import Image, ImageOps
    if user.role != "learner":
        raise HTTPException(403, "Only crew members can upload photos")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    content = await file.read()

    try:
        image = Image.open(io.BytesIO(content))
        image.verify() # verify it's an image
    except Exception:
        raise HTTPException(400, "Invalid image file")

    # Need to reopen because verify() moves the file pointer
    image = Image.open(io.BytesIO(content))

    # Bake in the camera's EXIF rotation so the saved file is always the
    # way-up the photo actually looked (phones often store sideways pixel
    # data plus an orientation tag).
    image = ImageOps.exif_transpose(image)

    width, height = image.size
    if width < 200 or height < 200:
        raise HTTPException(400, "Photo is too small — please upload a clearer, higher-resolution photo")

    # Reject only clearly-sideways (landscape) uploads. Square and
    # portrait photos are both fine — what matters is the face being
    # upright, not a strict taller-than-wide aspect ratio.
    if width > height:
        raise HTTPException(
            400,
            "Please upload an upright passport-size photo (not landscape/rotated sideways)"
        )

    _assert_clear_passport_face(image)

    photos_dir = os.path.join(UPLOAD_DIR, "photos")
    os.makedirs(photos_dir, exist_ok=True)

    file_path = os.path.join(photos_dir, f"{user.id}.jpg")
    image.convert("RGB").save(file_path, format="JPEG", quality=85)

    return {"status": "success"}



@app.get("/api/courses/{course_id}/certificate.pdf")
def get_certificate_pdf(course_id: str, user: models.User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=user.id, course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    pdf = build_certificate_pdf(cert_pdf_data(cert, user, course))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{cert.id}.pdf"'})


@app.get("/api/admin/users/{user_id}/courses/{course_id}/certificate.pdf")
def admin_get_crew_certificate_pdf(
    user_id: str, course_id: str,
    request: Request,
    token: Optional[str] = None,
    dl: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Admin-only: download/view any crew member's issued certificate PDF.
    Accepts JWT via Authorization header OR ?token= query param (for direct <a href> links).
    """
    from .auth import SECRET_KEY, ALGORITHM
    # Resolve token: prefer header, fall back to query param
    auth_header = request.headers.get("Authorization", "")
    raw_token = auth_header.removeprefix("Bearer ").strip() or token
    if not raw_token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type", "session") != "session" or payload.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")

    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    learner = db.get(models.User, user_id)
    if not learner:
        raise HTTPException(404, "User not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=user_id, course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate issued for this crew member and course")
    pdf = build_certificate_pdf(cert_pdf_data(cert, learner, course))
    filename = f"{learner.full_name.replace(' ', '_')}_{course.slug}_{cert.id}.pdf"
    disposition = "attachment" if dl else "inline"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disposition}; filename="{filename}"'})



@app.get("/api/certificates")
def list_certificates(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    certs = db.query(models.Certificate).filter_by(learner_id=user.id).all()
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
    user = db.get(models.User, cert.learner_id)
    return {
        "valid": True, "id": cert.id,
        "holder": user.full_name if user else None,
        "course": course.title if course else None,
        "score": cert.score,
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
    }


@app.get("/api/verify/{cert_id}/pdf")
def verify_certificate_pdf(cert_id: str, db: Session = Depends(get_db)):
    """Public — streams the actual certificate PDF for a QR-code scan or
    manual verification link, no authentication required."""
    cert = db.get(models.Certificate, cert_id)
    if not cert:
        raise HTTPException(404, "Certificate not found")
    course = db.query(models.Course).filter_by(id=cert.course_id).first()
    user = db.get(models.User, cert.learner_id)
    if not course or not user:
        raise HTTPException(404, "Certificate not found")
    pdf = build_certificate_pdf(cert_pdf_data(cert, user, course))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{cert.id}.pdf"'})


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
        "createdAt": (n.created_at.isoformat() + 'Z') if n.created_at else None,
    } for n in rows]
    return {"unread": unread, "items": items}


@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: str, user: models.User = Depends(get_current_user),
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

@app.get("/api/admin/notifications")
def admin_notifications(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Return pending certificate approvals as notification items for the admin bell."""
    pending = (db.query(models.AssessmentApproval)
               .filter_by(status="pending")
               .order_by(models.AssessmentApproval.created_at.desc())
               .all())
    items = []
    for ap in pending:
        user = db.get(models.User, ap.learner_id)
        course = db.query(models.Course).filter_by(id=ap.course_id).first()
        if not user or not course:
            continue
        items.append({
            "id": ap.id,
            "learnerId": ap.learner_id,
            "courseId": ap.course_id,
            "learnerName": user.full_name,
            "courseName": course.title,
            "createdAt": (ap.created_at.isoformat() + 'Z') if ap.created_at else None,
        })
    return {"unread": len(items), "items": items}


class CreateUserRequest(BaseModel):
    role: str                       # 'learner' | 'admin' | 'super_admin'
    fullName: str
    crewId: str | None = None       # learner
    dob: str | None = None          # learner — 8 digits DDMMYYYY
    rank: str | None = None
    ppNo: str | None = None
    email: str | None = None        # admin / super_admin
    password: str | None = None     # admin / super_admin


class UpdateUserRequest(BaseModel):
    isActive: bool | None = None
    fullName: str | None = None
    rank: str | None = None
    ppNo: str | None = None
    role: str | None = None


class AssignRequest(BaseModel):
    courseId: str


class BulkAssignRequest(BaseModel):
    courseIds: list[str]


def admin_user_view(db, u):
    v = {
        "id": u.id, "role": u.role, "name": u.full_name, "rank": u.rank,
        "crewId": u.crew_id, "email": u.email, "ppNo": u.pp_no,
        "mobileNo": u.mobile_number,
        "dob": u.date_of_birth.strftime("%d%m%Y") if u.date_of_birth else None,
        "isActive": bool(u.is_active),
    }
    if u.role == "learner":
        v["assignedCount"] = db.query(models.Enrollment).filter_by(learner_id=u.id).count()
        v["passedCount"] = (db.query(models.Progress)
                            .filter_by(learner_id=u.id, passed=True).count())
    return v


@app.get("/api/admin/users")
def admin_list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Crew (learner) users only — admin/super_admin accounts are managed
    separately via /api/admin/panel/admins."""
    users = (db.query(models.User).filter_by(role="learner")
             .order_by(models.User.full_name).all())
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

    elif req.role in ("admin", "super_admin"):
        email = (req.email or "").strip().lower()
        if not email:
            raise HTTPException(400, "Email is required")
        if not req.password or len(req.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        if db.query(models.User).filter_by(email=email).first():
            raise HTTPException(400, "That email is already in use")
        user = models.User(role=req.role, email=email, full_name=name,
                           rank=(req.rank or "").strip() or None,
                           password_hash=hash_password(req.password))
    else:
        raise HTTPException(400, "Role must be 'learner', 'admin', or 'super_admin'")

    db.add(user)
    db.commit()
    db.refresh(user)
    return admin_user_view(db, user)


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: str, req: UpdateUserRequest,
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


# ============================================================
# ADMIN PANEL — Manage Admin / Super Admin users
# ============================================================

@app.get("/api/admin/panel/admins")
def admin_panel_list_admins(admin: models.User = Depends(require_admin),
                            db: Session = Depends(get_db)):
    """List all admin and super_admin users."""
    users = (db.query(models.User)
             .filter(models.User.role.in_(["admin", "super_admin"]))
             .order_by(models.User.role, models.User.full_name)
             .all())
    return [{
        "id": u.id, "role": u.role, "name": u.full_name,
        "email": u.email, "rank": u.rank,
        "isActive": bool(u.is_active),
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


@app.post("/api/admin/panel/admins")
def admin_panel_create_admin(req: CreateUserRequest,
                             admin: models.User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    """Create a new admin or super_admin user."""
    if req.role not in ("admin", "super_admin"):
        raise HTTPException(400, "Role must be 'admin' or 'super_admin'")
    name = (req.fullName or "").strip()
    if not name:
        raise HTTPException(400, "Full name is required")
    email = (req.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email is required")
    if not req.password or len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(400, "That email is already in use")
    user = models.User(
        role=req.role, email=email, full_name=name,
        rank=(req.rank or "").strip() or None,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id, "role": user.role, "name": user.full_name,
        "email": user.email, "rank": user.rank,
        "isActive": bool(user.is_active),
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


@app.patch("/api/admin/panel/admins/{user_id}")
def admin_panel_update_admin(user_id: str, req: UpdateUserRequest,
                             admin: models.User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    """Activate/deactivate or update an admin/super_admin user."""
    user = db.get(models.User, user_id)
    if not user or user.role not in ("admin", "super_admin"):
        raise HTTPException(404, "Admin user not found")
    if req.isActive is not None:
        if user.id == admin.id and req.isActive is False:
            raise HTTPException(400, "You cannot deactivate your own account")
        user.is_active = req.isActive
    if req.fullName is not None:
        user.full_name = req.fullName.strip()
    if req.rank is not None:
        user.rank = req.rank.strip() or None
    if req.role is not None:
        if req.role not in ("admin", "super_admin"):
            raise HTTPException(400, "Role must be 'admin' or 'super_admin'")
        if user.id == admin.id and req.role != user.role:
            raise HTTPException(400, "You cannot change your own role")
        user.role = req.role
    db.commit()
    return {
        "id": user.id, "role": user.role, "name": user.full_name,
        "email": user.email, "rank": user.rank,
        "isActive": bool(user.is_active),
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


@app.post("/api/admin/users/{user_id}/courses/{course_id}/reassign")
def admin_reassign_course(user_id: str, course_id: str, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
        
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
        
    enrollment = db.query(models.Enrollment).filter_by(learner_id=user_id, course_id=course_id).first()
    if not enrollment:
        raise HTTPException(400, "User is not assigned to this course")

    # Delete progress, attempts, approvals, and certificates so they start fully from scratch
    db.query(models.Progress).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.query(models.Certificate).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.query(models.AssessmentApproval).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.query(models.Attempt).filter_by(learner_id=user_id, course_id=course_id).delete()
    
    notify(
        db, user_id, "info", "Course Reassigned",
        f"You have been reassigned to '{course.title}'. Please complete it from the beginning.",
        f"/course/{course.slug or course_id}"
    )

    db.commit()
    return {"message": "Course reassigned successfully."}


class InlineApproveRequest(BaseModel):
    remark: Optional[str] = None

@app.post("/api/admin/users/{user_id}/courses/{course_id}/approve")
def admin_inline_approve(user_id: str, course_id: str,
                         body: InlineApproveRequest = InlineApproveRequest(),
                         admin: models.User = Depends(require_super_admin), db: Session = Depends(get_db)):
    """Inline approval of a pending certificate from the Admin Report page."""
    ap = db.query(models.AssessmentApproval).filter_by(
        learner_id=user_id, course_id=course_id, status="pending"
    ).first()
    if not ap:
        raise HTTPException(404, "No pending approval found for this learner/course")
    user = db.get(models.User, user_id)
    course = db.query(models.Course).filter_by(id=course_id).first()
    cert_info = issue_certificate(db, user, course)
    ap.status = "approved"
    ap.decided_at = datetime.now(timezone.utc)
    if body.remark:
        ap.remark = body.remark.strip()
    notify(db, user.id, "certificate", "Certificate Ready",
           f"Your certificate for {course.title} has been approved.",
           f"/course/{course.slug}/certificate")
    db.commit()
    cert_obj = db.get(models.Certificate, cert_info["id"])
    pdf_bytes = build_certificate_pdf(cert_pdf_data(cert_obj, user, course))
    if user.email:
        email_service.send_approval_email(user.email, user.full_name, course.title, pdf_bytes, cert_info["id"])
    return {"ok": True, "certId": cert_info["id"]}


@app.post("/api/admin/users/{user_id}/enrollments")

def admin_assign(user_id: str, req: AssignRequest,
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
def admin_unassign(user_id: str, course_id: str,
                   admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    # removing an assignment hides the course from the learner but keeps their
    # progress/attempts/certificate rows for audit
    db.query(models.Enrollment).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.commit()
    return {"ok": True}


@app.put("/api/admin/users/{user_id}/enrollments")
def admin_bulk_set_enrollments(user_id: str, req: BulkAssignRequest,
                               admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Set a learner's full course assignment list in one call — the "Manage
    courses" picker sends the exact set it wants assigned, and this diffs it
    against current enrollments instead of the admin clicking course-by-course
    (unworkable once a fleet has 50-100 courses)."""
    user = db.get(models.User, user_id)
    if not user or user.role != "learner":
        raise HTTPException(404, "Learner not found")

    valid_course_ids = {c.id for c in db.query(models.Course.id).all()}
    wanted = set(req.courseIds) & valid_course_ids
    current = {e.course_id for e in
               db.query(models.Enrollment).filter_by(learner_id=user_id).all()}

    to_add = wanted - current
    to_remove = current - wanted

    if to_remove:
        (db.query(models.Enrollment)
           .filter(models.Enrollment.learner_id == user_id,
                   models.Enrollment.course_id.in_(to_remove))
           .delete(synchronize_session=False))

    if to_add:
        courses_by_id = {c.id: c for c in
                         db.query(models.Course).filter(models.Course.id.in_(to_add)).all()}
        for cid in to_add:
            db.add(models.Enrollment(learner_id=user_id, course_id=cid, assigned_by=admin.id))
            course = courses_by_id.get(cid)
            if course:
                notify(db, user_id, "assigned", "New course assigned",
                       f"{course.title} has been assigned to you.",
                       f"/course/{course.slug}")

    db.commit()
    return {"ok": True, "added": len(to_add), "removed": len(to_remove)}


# ----- compliance reporting -----
def _report(db):
    courses = db.query(models.Course).order_by(models.Course.order).all()
    learners = (db.query(models.User).filter_by(role="learner")
                .order_by(models.User.full_name).all())
    
    enrollments = db.query(models.Enrollment).all()
    progress_all = db.query(models.Progress).all()
    certs = db.query(models.Certificate).all()
    approvals = (db.query(models.AssessmentApproval)
                 .order_by(models.AssessmentApproval.created_at).all())
    attempts_counts = db.query(models.Attempt.learner_id, models.Attempt.course_id, func.count(models.Attempt.id)).group_by(models.Attempt.learner_id, models.Attempt.course_id).all()

    e_map = {(e.learner_id, e.course_id): e for e in enrollments}
    p_map = {(p.learner_id, p.course_id): p for p in progress_all}
    c_map = {(c.learner_id, c.course_id): c for c in certs}
    # keep the most recent approval per learner/course (any status) so an
    # approved/rejected decision's remark still surfaces in the report
    ap_map = {}
    for a in approvals:
        ap_map[(a.learner_id, a.course_id)] = a
    a_map = {(l, c): count for l, c, count in attempts_counts}
    
    # Pre-compute chapter ids per course (avoids N+1 queries). Progress rows
    # keep every chapter id a learner ever completed, including ones an admin
    # has since deleted — count only ids that still exist, and cap at the
    # course's current chapter count, so a stale id can't read as e.g. "50/49".
    course_chapter_ids = {c.id: {ch.id for ch in c.chapters} for c in courses}
    course_chapter_counts = {cid: len(ids) for cid, ids in course_chapter_ids.items()}
    
    rows = []
    for lr in learners:
        assigned_courses = [c for c in courses if (lr.id, c.id) in e_map]
        cells = {}
        for c in assigned_courses:
            enr = e_map.get((lr.id, c.id))
            prog = p_map.get((lr.id, c.id))
            cert = c_map.get((lr.id, c.id))
            ap = ap_map.get((lr.id, c.id))
            attempts = a_map.get((lr.id, c.id), 0)
            
            if prog and prog.passed:
                status = "passed"
            elif prog and ((prog.completed_chapters and len(prog.completed_chapters) > 0) or prog.score is not None):
                status = "in-progress"
            else:
                status = "assigned"
            
            total_chs = course_chapter_counts.get(c.id, 0)
            valid_ids = course_chapter_ids.get(c.id, set())
            done_chs  = len(valid_ids & set(prog.completed_chapters or [])) if prog else 0
            pct       = round(done_chs / total_chs * 100) if total_chs else 0
            
            if cert and cert.issued_at:
                passed_on = cert.issued_at.strftime("%Y-%m-%d")
            elif ap and ap.created_at:
                passed_on = ap.created_at.strftime("%Y-%m-%d")
            else:
                passed_on = None
            
            cells[c.id] = {
                "status": status,
                "score": prog.score if prog else None,
                "startedOn": enr.assigned_at.strftime("%Y-%m-%d") if enr and enr.assigned_at else None,
                "passedOn": passed_on,
                "pendingApproval": bool(ap and ap.status == "pending"),
                "approvalRemark": ap.remark if ap and ap.remark else None,
                "attempts": attempts,
                "completionPct":     pct,
                "completedChapters": done_chs,
                "totalChapters":     total_chs,
            }
        
        rows.append({
            "learnerId": lr.id, "name": lr.full_name, "crewId": lr.crew_id,
            "rank": lr.rank, "mobileNo": lr.mobile_number,
            "isActive": bool(lr.is_active), "cells": cells,
        })
    return courses, rows


@app.get("/api/admin/report")
def admin_report(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses, rows = _report(db)
    return {"courses": [{"id": c.id, "title": c.title} for c in courses], "rows": rows}


@app.post("/api/admin/maintenance/reconcile-progress")
def admin_reconcile_progress(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """One-off heal for learners stuck from *past* chapter deletions (new
    deletions self-heal via admin_delete_chapter). Re-runs the no-assessment
    auto-complete check for every course/progress pair so anyone who'd
    already finished everything that still exists on the course gets moved
    to passed and queued for certificate approval."""
    healed = []
    for course in db.query(models.Course).all():
        for p in db.query(models.Progress).filter_by(course_id=course.id).all():
            if _maybe_auto_complete_course(db, course, p, p.learner_id):
                learner = db.get(models.User, p.learner_id)
                healed.append({
                    "courseId": course.id, "courseTitle": course.title,
                    "learnerId": p.learner_id,
                    "learnerName": learner.full_name if learner else None,
                })
    db.commit()
    return {"healedCount": len(healed), "healed": healed}


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
    enrollments = db.query(models.Enrollment).all()
    progress_all = db.query(models.Progress).all()
    
    e_map = defaultdict(set)
    for e in enrollments:
        e_map[e.course_id].add(e.learner_id)
        
    p_map = {(p.learner_id, p.course_id): p for p in progress_all}
    
    course_stats = []
    for c in courses:
        enrolled_ids = e_map[c.id]
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
            prog = p_map.get((lid, c.id))
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
        user_obj = db.get(models.User, cert.learner_id)
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

    # --- last crew-data sync run (cron-driven; see smartpal_sync.py) ---
    last_sync_log = (db.query(models.SyncLog)
                      .order_by(models.SyncLog.started_at.desc())
                      .first())
    last_sync = None
    if last_sync_log:
        last_sync = {
            "startedAt": last_sync_log.started_at.isoformat() if last_sync_log.started_at else None,
            "finishedAt": last_sync_log.finished_at.isoformat() if last_sync_log.finished_at else None,
            "status": last_sync_log.status,
            "recordsFetched": last_sync_log.records_fetched,
            "recordsCreated": last_sync_log.records_created,
            "recordsUpdated": last_sync_log.records_updated,
            "errorMessage": last_sync_log.error_message,
        }

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
        "lastSync": last_sync,
    }


@app.get("/api/admin/report.csv")
def admin_report_csv(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses, rows = _report(db)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Crew ID", "Name", "Rank", "Active", "Course", "Status", "Score", "Completed On", "Approval Remark"])
    for r in rows:
        active = "yes" if r["isActive"] else "no"
        if not r["cells"]:
            w.writerow([r["crewId"], r["name"], r["rank"] or "", active,
                        "(no courses assigned)", "", "", "", ""])
            continue
        for c in courses:
            cell = r["cells"].get(c.id)
            if not cell:
                continue
            w.writerow([r["crewId"], r["name"], r["rank"] or "", active, c.title,
                        cell["status"], "" if cell["score"] is None else cell["score"],
                        cell["passedOn"] or "", cell.get("approvalRemark") or ""])
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
    ws.merge_cells("A1:K1")
    tc = ws.cell(row=1, column=1, value=title_text)
    tc.font = Font(bold=True, size=12, color="1E3A5F")
    tc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 22

    # ---- sub-title row (row 2): generated timestamp + row count ----
    ws.merge_cells("A2:K2")
    sc = ws.cell(row=2, column=1,
                 value=f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}  ·  "
                       f"{len(rows)} crew member(s) shown")
    sc.font = Font(size=9, color="5C626D")
    sc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 16

    # ---- column headers (row 3) ----
    headers = ["Crew ID", "Name", "Rank", "Active",
               "Course", "Status", "Score (%)", "Attempts", "Started On", "Completed On", "Approval Remark"]
    ws.append(headers)
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=ci)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = center
        cell.border = border
    ws.row_dimensions[3].height = 22

    status_labels = {"passed": "Completed", "in-progress": "In Progress", "assigned": "Not Started"}
    row_idx = 4
    for r in rows:
        active = "Yes" if r["isActive"] else "No"
        start_row = row_idx
        
        if not r["cells"]:
            data = [r["crewId"], r["name"], r["rank"] or "", active,
                    "(no courses assigned)", "", "", "", "", "", ""]
            ws.append(data)
            for ci in range(1, 12):
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
            remark = cell_data.get("approvalRemark") or ""

            fill = PASS_FILL if status == "passed" else (WIP_FILL if status == "in-progress" else ASGN_FILL)
            data = [r["crewId"], r["name"], r["rank"] or "", active,
                    course.title, label, score, attempts, started_on, passed_on, remark]
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
        for ci in range(1, 12):
            ws.cell(row=row_idx-1, column=ci).border = border_thick_bottom

    # ---- auto column widths ----
    col_widths = [14, 26, 18, 8, 36, 14, 11, 10, 14, 14, 40]
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
    Score (%) | Grade | Time Taken (days) | Certificate ID | Completed On

    Rows are colour-coded: green = passed, amber = in-progress, grey = not started.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    if user.role in ("admin", "super_admin"):
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
               "Progress (%)", "Score (%)", "Grade", "Started On", "Completed On",
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
        prog = get_progress(db, user.id, c.id)
        cert = (db.query(models.Certificate)
                .filter_by(learner_id=user.id, course_id=c.id).first())

        valid_ids   = {ch.id for ch in c.chapters}
        done_count  = len(valid_ids & set(prog.completed_chapters or [])) if prog else 0
        total_ch    = len(c.chapters)
        pct         = round(done_count / total_ch * 100) if total_ch else 0
        score       = prog.score if prog else None
        passed_flag = bool(prog.passed) if prog else False

        if passed_flag:
            if not cert:
                calc_status = "Pending Approval"
                fill = WIP_FILL
            else:
                calc_status = "Completed"
                fill = PASS_FILL
                total_passed += 1
        elif prog and (done_count > 0 or score is not None):
            calc_status = "In Progress"
            fill = WIP_FILL
        else:
            calc_status = "Not Started"
            fill = ASGN_FILL

        # Apply status filter
        if status == 'completed' and calc_status != "Completed": continue
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


def _unique_course_slug(db, base: str) -> str:
    slug = base
    i = 2
    while db.query(models.Course).filter_by(slug=slug).first():
        slug = f"{base}-{i}"
        i += 1
    return slug


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
    targetRanks: list[str] = []
    targetUsers: list[str] = []


class UpdateCourseRequest(BaseModel):
    title: str
    subtitle: str | None = None
    durationLabel: str | None = None
    passMark: int
    maxAttempts: int | None = None
    targetRanks: list[str] = []
    targetUsers: list[str] = []


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
    c_slug = _unique_course_slug(db, _slugify(title))
    existing_orders = [c.order for c in db.query(models.Course).all()]
    course = models.Course(
        slug=c_slug, title=title, subtitle=req.subtitle,
        icon=req.icon, gradient=req.gradient, duration_label=req.durationLabel,
        status="not-started", pass_mark=req.passMark, max_attempts=req.maxAttempts,
        target_ranks=req.targetRanks, target_users=req.targetUsers,
        order=(max(existing_orders) + 1) if existing_orders else 0,
    )
    db.add(course)
    db.flush()  # Generate the UUID for course.id

    # Auto-enroll matching users immediately
    target_ranks = req.targetRanks or []
    target_users = req.targetUsers or []
    if target_ranks or target_users:
        target_ranks_upper = [r.upper() for r in target_ranks]
        users_to_enroll = db.query(models.User).filter(
            models.User.role == 'learner',
            (func.upper(models.User.rank).in_(target_ranks_upper)) | (models.User.id.in_(target_users))
        ).all()
        for u in users_to_enroll:
            enroll = models.Enrollment(learner_id=u.id, course_id=course.id, assigned_by=admin.id)
            db.add(enroll)

    db.commit()
    db.refresh(course)
    return admin_course_summary(course)


@app.put("/api/admin/courses/{course_id}")
def admin_update_course(course_id: str, req: UpdateCourseRequest, admin: models.User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
        
    title = req.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
        
    course.title = title
    course.subtitle = req.subtitle
    course.duration_label = req.durationLabel
    course.pass_mark = req.passMark
    course.max_attempts = req.maxAttempts
    course.target_ranks = req.targetRanks
    
    # Filter out legacy integer IDs (e.g., 294) to prevent database DataError
    valid_users = [str(u) for u in req.targetUsers if isinstance(u, str) and len(str(u)) > 20]
    course.target_users = valid_users
    
    db.commit()
    
    # Auto-enroll matching users immediately who are not already enrolled
    target_ranks = req.targetRanks or []
    target_users = req.targetUsers or []
    if target_ranks or target_users:
        target_ranks_upper = [r.upper() for r in target_ranks]
        users_to_enroll = db.query(models.User).filter(
            models.User.role == 'learner',
            (func.upper(models.User.rank).in_(target_ranks_upper)) | (models.User.id.in_(target_users))
        ).all()
        
        existing_enrollments = db.query(models.Enrollment).filter(models.Enrollment.course_id == course_id).all()
        existing_user_ids = {e.learner_id for e in existing_enrollments}
        
        for u in users_to_enroll:
            if u.id not in existing_user_ids:
                enroll = models.Enrollment(learner_id=u.id, course_id=course_id, assigned_by=admin.id)
                db.add(enroll)
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
        "subtitle": course.subtitle, "durationLabel": course.duration_label,
        "passMark": course.pass_mark, "maxAttempts": course.max_attempts,
        "targetRanks": course.target_ranks or [],
        "targetUsers": course.target_users or [],
        "cert": course.cert or {},
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


class SaveCertificateRequest(BaseModel):
    titleUpper: str | None = None
    topics: list[str] = []
    certPrefix: str | None = None
    durationHours: int | None = None


@app.put("/api/admin/courses/{course_id}/certificate")
def admin_save_course_certificate(course_id: str, req: SaveCertificateRequest,
                                  admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Sets the topics/title shown on every certificate issued for this course
    (see cert_pdf_data — falls back to chapter titles if this is never set)."""
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    topics = [t.strip() for t in req.topics if t and t.strip()][:8]  # cap at 8
    title_upper = (req.titleUpper or "").strip() or None
    cert_prefix = (req.certPrefix or "").strip() or None
    duration_hours = req.durationHours if req.durationHours and req.durationHours > 0 else None
    course.cert = {"titleUpper": title_upper, "topics": topics, "certPrefix": cert_prefix, "durationHours": duration_hours}
    db.commit()
    return course.cert


@app.get("/api/admin/courses/{course_id}/certificate-preview.pdf")
def admin_preview_course_certificate(
    course_id: str, request: Request,
    token: Optional[str] = None,
    titleUpper: Optional[str] = None,
    certPrefix: Optional[str] = None,
    durationHours: Optional[int] = None,
    topics: list[str] = Query([]),
    db: Session = Depends(get_db),
):
    """Renders a sample certificate for the course builder's live preview —
    accepts titleUpper/topics as query params so unsaved edits can be
    previewed before the admin clicks Save (falls back to the saved
    course.cert, then chapter titles, same as a real issued certificate)."""
    from .auth import SECRET_KEY, ALGORITHM
    auth_header = request.headers.get("Authorization", "")
    raw_token = auth_header.removeprefix("Bearer ").strip() or token
    if not raw_token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload.get("type", "session") != "session" or payload.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")

    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    clean_topics = [t.strip() for t in topics if t and t.strip()]
    if not clean_topics:
        clean_topics = (course.cert or {}).get("topics") or []
    if not clean_topics:
        unwanted = {
            "introduction", "summary", "conclusion", "quiz", "assessment",
            "final assessment", "why", "why?", "how", "how?", "what", "what?",
            "overview", "agenda", "objectives"
        }
        clean_topics = [
            ch.title for ch in course.chapters
            if ch.kind != "quiz"
            and ch.title.lower().strip() not in unwanted
            and not ch.title.lower().strip().startswith("slide ")
        ]

    class MockUser:
        full_name = "Sample Crew Member"
        pp_no = "PP-0000000"
        id = "preview"

    preview_code = (certPrefix or "").strip()
    if not preview_code:
        preview_code = (course.cert or {}).get("certPrefix")
    if not preview_code:
        preview_code = _course_code(course.slug)

    year = datetime.now(timezone.utc).year

    data = {
        "id": f"OZ-{preview_code}-{year}-0001",
        "learner": MockUser.full_name,
        "ppNo": MockUser.pp_no,
        "titleUpper": (titleUpper or "").strip() or (course.cert or {}).get("titleUpper") or course.title.upper(),
        "topics": clean_topics[:8],
        "issued": datetime.now(timezone.utc).strftime("%d %B %Y"),
        "location": os.getenv("CERT_LOCATION", "Chennai"),
        "photoPath": None,
        "verifyUrl": "",
        "durationHours": durationHours if durationHours else (course.cert or {}).get("durationHours") or 4,
    }
    pdf = build_certificate_pdf(data)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="certificate-preview.pdf"'})


from fastapi import BackgroundTasks
import time
import zipfile as _zipfile

# ---------------------------------------------------------------------------
# PPTX upload/processing job tracker
#
# The browser can measure the *upload* itself (XHR upload.onprogress), but
# everything after the last byte lands — LibreOffice rendering, video
# extraction, ffmpeg — happens in a background task with no HTTP response to
# hang progress off. This file-based store is what `GET .../pptx-status`
# reports so the admin UI can show a real stage + percentage instead of an
# indeterminate spinner that never ends when processing fails.
#
# WHY FILE-BASED (not in-memory):
#   With a single uvicorn process an in-memory dict works fine.  Under gunicorn
#   with -w N, each worker is a separate OS process with its own heap.  The
#   upload POST lands on Worker A which stores the job in A's dict; the
#   subsequent status GETs are round-robin'd to Workers B and C which have no
#   record of the job and return {stage: "idle"} — the UI then shows
#   "Processing stopped unexpectedly" even though A is happily converting.
#   Writing state to a small JSON file in the course upload directory makes it
#   visible to every worker without needing Redis or a DB schema change.
#   Writes use an atomic rename so a reader never sees a half-written file.
# ---------------------------------------------------------------------------
import threading as _threading
_pptx_job_lock = _threading.Lock()   # serialises writes within one worker process


def _pptx_job_path(course_id: str) -> str:
    """Absolute path of the per-course job-state JSON file."""
    return os.path.join(UPLOAD_DIR, course_id, "_pptx_job.json")


def _pptx_job_read(course_id: str) -> dict | None:
    """Return the current job dict, or None if no file exists."""
    try:
        with open(_pptx_job_path(course_id), "r", encoding="utf-8") as fh:
            return json.loads(fh.read())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _pptx_job_write(course_id: str, job: dict) -> None:
    """Atomically overwrite the job-state file (tmp + rename)."""
    path = _pptx_job_path(course_id)
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(job))
    os.replace(tmp, path)   # atomic on POSIX; best-effort on Windows


def _safe_unlink(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


# LibreOffice needs far longer than 2 minutes on a multi-hundred-MB deck.
PPTX_SOFFICE_TIMEOUT = int(os.getenv("PPTX_SOFFICE_TIMEOUT", "1800"))


# Media parts that LibreOffice does not need in order to draw a slide.
_PPTX_MEDIA_EXT = (".mp4", ".mov", ".avi", ".wmv", ".m4v", ".mkv",
                   ".mp3", ".wav", ".m4a", ".wma")


def _pptx_render_copy(pptx_path: str, tmp_dir: str) -> str:
    """A copy of the deck with embedded audio/video emptied out, for rendering.

    Course decks are mostly video — a 1.4 GB file can be 1.26 GB of MP4 — and
    handing all of that to LibreOffice is what made slide rendering take tens
    of minutes on big decks. The videos are extracted separately below and
    replayed by our own player, so the render copy only needs the slide
    artwork. Each media part is rewritten as a zero-byte entry rather than
    dropped, which keeps every filename and relationship intact so the package
    stays valid. Falls back to the original path if anything goes wrong.
    """
    try:
        out = os.path.join(tmp_dir, "render_" + os.path.basename(pptx_path))
        stripped = 0
        with _zipfile.ZipFile(pptx_path) as src,                 _zipfile.ZipFile(out, "w", _zipfile.ZIP_DEFLATED) as dst:
            for item in src.infolist():
                if item.filename.lower().endswith(_PPTX_MEDIA_EXT):
                    dst.writestr(item.filename, b"")
                    stripped += 1
                else:
                    with src.open(item) as f:
                        dst.writestr(item, f.read())
        if not stripped:
            _safe_unlink(out)
            return pptx_path
        before, after = os.path.getsize(pptx_path), os.path.getsize(out)
        print(f"[pptx] render copy: emptied {stripped} media parts "
              f"({before / 1048576:.0f} MB -> {after / 1048576:.0f} MB)")
        return out
    except Exception as e:
        print(f"[pptx] could not build a render copy ({e}); rendering the original")
        return pptx_path


def _pptx_job_set(course_id: str, *, stage: str, pct: int | None = None,
                  message: str = "", error: str | None = None,
                  done: bool = False, added: int | None = None):
    """Update (or create) the on-disk job state for course_id.

    Uses a threading lock + atomic rename so concurrent writes inside the same
    worker process are safe, and readers on other worker processes never see a
    partially-written file.
    """
    with _pptx_job_lock:
        job = _pptx_job_read(course_id) or {}
        job.update({
            "stage": stage,
            "message": message,
            "error": error,
            "done": done,
            "updated": time.time(),
        })
        if pct is not None:
            job["pct"] = max(0, min(100, int(pct)))
        if added is not None:
            job["added"] = added
        _pptx_job_write(course_id, job)
    return job


def process_pptx_background(course_id: str, pptx_path: str, original_filename: str, course_dir: str):
    db = SessionLocal()
    _pptx_job_set(course_id, stage="rendering", pct=5,
                  message="Rendering slides (this is the slow part on big decks)…")
    try:
        course = db.query(models.Course).filter(models.Course.id == course_id).first()
        db.close()
        if not course: return

        import string
        import random
        # Use a local temp dir to avoid Windows tempfile locking issues with soffice
        tmp = os.path.join(UPLOAD_DIR, "tmp_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=10)))
        os.makedirs(tmp, exist_ok=True)
        
        try:
            soffice_paths = [
                "soffice",
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
                r"C:\LibreOffice\program\soffice.exe"
            ]
            
            success = False
            last_err = None
            env_tmp = os.path.join(tmp, "soffice_env").replace(os.sep, "/")

            # Render from a video-free copy. This is what replaces the old
            # "skip LibreOffice entirely above 150 MB" rule: big decks now get
            # slide images too, because the part that made them big is exactly
            # the part rendering doesn't need.
            render_src = _pptx_render_copy(pptx_path, tmp)

            for sp in soffice_paths:
                try:
                    subprocess.run(
                        [sp, f"-env:UserInstallation=file:///{env_tmp}", "--headless", "--nologo", "--nofirststartwizard", "--convert-to", "pdf", "--outdir", tmp, render_src],
                        check=True, capture_output=True, timeout=PPTX_SOFFICE_TIMEOUT,
                    )
                    success = True
                    break
                except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
                    last_err = e

            pdf_filename = os.path.splitext(os.path.basename(render_src))[0] + ".pdf"
            pdf_path = os.path.join(tmp, pdf_filename)
            has_pdf = success and os.path.exists(pdf_path)
            
            if not has_pdf:
                print(f"Background PPTX conversion to PDF failed or skipped: {last_err}")
                _pptx_job_set(course_id, stage="rendering", pct=25,
                              message="Slide images unavailable — importing text only.")
            else:
                _pptx_job_set(course_id, stage="extracting", pct=35,
                              message="Extracting slide text and videos…")

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
                            text = texts[0][1].split("\n")[0].strip()
                            
                    slide_titles.append(text if text else "")
            except Exception as e:
                print(f"Failed to extract text with python-pptx: {e}")
                prs = None
                slide_titles = []
                slide_full_texts = []
            
            import zipfile
            import xml.etree.ElementTree as ET

            # Unique tag for this upload — prefixed on every extracted file so
            # that a second PPTX upload to the same course never overwrites the
            # video files produced by the first one.
            upload_tag = uuid.uuid4().hex[:8]

            # Build a mapping: zip slide part name (e.g. "ppt/slides/slide3.xml")
            # -> 0-based presentation order index.
            # python-pptx iterates prs.slides in presentation order, and each
            # slide exposes its part's name.  The zip file-system numbering
            # (slide1.xml, slide2.xml…) does NOT have to match presentation
            # order, so we must resolve the mapping explicitly before processing
            # any videos — otherwise a video on slide3.xml (which might be the
            # 5th slide shown) lands on chapter index 2 instead of 4.
            slide_part_to_prs_idx: dict[str, int] = {}
            if prs is not None:
                try:
                    for prs_idx, slide in enumerate(prs.slides):
                        # slide.part.partname is e.g. "/ppt/slides/slide3.xml"
                        part_name = slide.part.partname.lstrip("/")
                        slide_part_to_prs_idx[part_name] = prs_idx
                except Exception as e:
                    print(f"[pptx] could not build slide part map: {e}")

            slide_videos: dict[int, set] = {}
            try:
                with zipfile.ZipFile(pptx_path, "r") as z:
                    namelist_set = set(z.namelist())
                    # Count the videos up front so the progress bar can actually
                    # move through this phase. ffmpeg on a deck's worth of video
                    # is the longest part of the whole job (minutes), so a fixed
                    # percentage here reads as "stuck" even though it's working.
                    total_vids = sum(1 for n in z.namelist()
                                     if n.startswith("ppt/media/") and n.lower().endswith(".mp4"))
                    done_vids = 0
                    # media part -> served URL, so each video is only ever
                    # extracted and compressed once (see the note below).
                    processed_media: dict[str, str] = {}

                    # Sort the slide rels by their numeric slide number so that
                    # iteration order is deterministic (zip central directory
                    # order is not guaranteed to be in slide order).
                    def _slide_rels_sort_key(n):
                        try:
                            return int(n.split("slide")[2].split(".")[0])
                        except Exception:
                            return 0

                    slide_rels = sorted(
                        [n for n in z.namelist()
                         if n.startswith("ppt/slides/_rels/slide") and n.endswith(".xml.rels")],
                        key=_slide_rels_sort_key
                    )

                    for name in slide_rels:
                        try:
                            slide_num_str = name.split("slide")[2].split(".")[0]

                            # Resolve presentation-order index via the part map.
                            # The .rels file lives at ppt/slides/_rels/slideN.xml.rels
                            # and describes ppt/slides/slideN.xml.
                            slide_part_name = f"ppt/slides/slide{slide_num_str}.xml"
                            if slide_part_name in slide_part_to_prs_idx:
                                slide_idx = slide_part_to_prs_idx[slide_part_name]
                            else:
                                # Fallback: use file-system numbering (minus 1).
                                # This can still be wrong but is better than nothing.
                                slide_idx = int(slide_num_str) - 1

                            rels_data = z.read(name)
                            root = ET.fromstring(rels_data)
                            ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
                            for rel in root.findall("r:Relationship", ns):
                                target = rel.get("Target")
                                if target and target.startswith("../media/") and target.lower().endswith(".mp4"):
                                    media_path = "ppt/" + target[3:]
                                    if media_path in namelist_set:
                                        # PowerPoint writes TWO relationships
                                        # per video shape (a `video` and a
                                        # `media` ref) pointing at the same
                                        # part, so without this cache every
                                        # video is extracted and re-encoded
                                        # twice — roughly doubling the job.
                                        # Keying on the media part also means
                                        # one video reused across slides is
                                        # compressed once and shared.
                                        if media_path in processed_media:
                                            slide_videos.setdefault(slide_idx, set()).add(
                                                processed_media[media_path])
                                            continue

                                        basename = os.path.basename(target)
                                        # upload_tag prefix prevents filename
                                        # collisions when multiple PPTXes are
                                        # uploaded to the same course.
                                        vid_filename = f"{upload_tag}_slide{slide_num_str}_{basename}"
                                        vid_path = os.path.join(course_dir, vid_filename)
                                        # copy in chunks — a single embedded
                                        # MP4 can be 500 MB+, and z.read()
                                        # would hold all of it in RAM.
                                        with z.open(media_path) as src, open(vid_path, "wb") as vf:
                                            shutil.copyfileobj(src, vf, 1024 * 1024)
                                        _pptx_job_set(
                                            course_id, stage="video",
                                            pct=40 + int(20 * done_vids / max(total_vids, 1)),
                                            message=(f"Compressing video {done_vids + 1} of "
                                                     f"{total_vids} — {basename} "
                                                     f"({os.path.getsize(vid_path) // 1048576} MB). "
                                                     "Large videos take several minutes each."))
                                        final_vid_path = compress_video(vid_path)
                                        done_vids += 1
                                        if final_vid_path == vid_path:
                                            try:
                                                from qtfaststart import processor
                                                processor.process(vid_path, vid_path + ".tmp")
                                                os.replace(vid_path + ".tmp", vid_path)
                                            except Exception:
                                                pass
                                        storage.save(course_id, vid_filename, final_vid_path)
                                        vid_url = f"/api/uploads/{course_id}/{vid_filename}"
                                        processed_media[media_path] = vid_url
                                        slide_videos.setdefault(slide_idx, set()).add(vid_url)
                        except Exception as e:
                            print(f"Error parsing {name}: {e}")
            except Exception as e:
                print(f"Error parsing PPTX zip for videos: {e}")

            doc = fitz.open(pdf_path) if has_pdf else None
            num_slides = len(doc) if doc else (len(prs.slides) if prs else 0)
            
            if num_slides == 0:
                print("No slides found in PPTX or PDF")
                _pptx_job_set(course_id, stage="failed", pct=100, done=True,
                              error="No slides could be read from this file.")
                return

            # Everything above (LibreOffice render, video extraction, ffmpeg)
            # can run for 20+ minutes without issuing a single query, and
            # Postgres drops the idle SSL connection long before that — the
            # next statement then dies with "SSL connection has been closed
            # unexpectedly", losing the whole import at the last step.
            # `pool_pre_ping` can't save us here: it validates a connection when
            # it is checked OUT of the pool, and this one was checked out before
            # the long wait. We already closed the initial session at the start,
            # so now we just take a fresh one. pre_ping then guarantees the
            # replacement is actually alive.
            db = SessionLocal()
            course = db.query(models.Course).filter(models.Course.id == course_id).first()
            if not course:
                _pptx_job_set(course_id, stage="failed", pct=100, done=True,
                              error="Course no longer exists.")
                return

            start_n = max((ch.n or 0 for ch in course.chapters), default=0)
            next_order = _next_chapter_order(course)
            
            for i in range(num_slides):
                n = start_n + i + 1
                
                img_url = None
                if doc:
                    page = doc[i]
                    pix = page.get_pixmap(dpi=150)
                    filename = f"slide{n}.png"
                    img_path = os.path.join(course_dir, filename)
                    pix.save(img_path)
                    storage.save(course_id, filename, img_path)
                    img_url = f"/api/uploads/{course_id}/{filename}"
                
                slide_title = slide_titles[i] if i < len(slide_titles) and slide_titles[i] else f"Slide {n}"
                vids = list(slide_videos.get(i, set()))
                
                full_text = slide_full_texts[i] if i < len(slide_full_texts) else ""
                is_quiz = ("quiz" in slide_title.lower()) or ("A. " in full_text and "B. " in full_text)
                ch_kind = "quiz" if is_quiz else "lesson"
                
                quiz_questions = []
                if is_quiz:
                    import re
                    lines = full_text.split("\n")
                    prompt_lines = []
                    options = []
                    ans_idx = 0
                    for line in lines:
                        line_s = line.strip()
                        if not line_s: continue
                        
                        ans_match = re.search(r"answer:\s*([A-E])", line_s, re.IGNORECASE)
                        if ans_match:
                            ans_idx = ord(ans_match.group(1).upper()) - ord("A")
                            continue

                        if re.match(r"^[A-E]\.", line_s):
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
                
                import uuid
                ch = models.Chapter(
                    id=f"{course_id}-slide-{n}-{uuid.uuid4().hex[:8]}", course_id=course_id, n=n,
                    title=slide_title,
                    sections=[], videos=vids, order=next_order + i, kind=ch_kind,
                    image=img_url,
                    quiz_questions=quiz_questions
                )
                db.add(ch)
                if num_slides:
                    _pptx_job_set(course_id, stage="slides",
                                  pct=60 + int(35 * (i + 1) / num_slides),
                                  message=f"Building lesson {i + 1} of {num_slides}…")
            
            if doc:
                doc.close()
            if num_slides > 0:
                _revoke_course_completion(db, course_id)
            db.commit()
            _pptx_job_set(course_id, stage="done", pct=100, done=True,
                          added=num_slides,
                          message=f"Imported {num_slides} slides.")
            print(f"Background PPTX processing finished for {course_id}")

        finally:
            # NB: no `import shutil` here. A function-local import binds the
            # name for the *whole* function, shadowing the module-level
            # `shutil` and making every earlier use in this function an
            # UnboundLocalError (which the video extractor's except-clause
            # swallowed, leaving 0-byte video files behind).
            try:
                shutil.rmtree(tmp)
            except OSError:
                pass
            db.close()
            
    except Exception as e:
        print(f"Background PPTX processing failed entirely: {e}")
        _pptx_job_set(course_id, stage="failed", pct=100, done=True,
                      error=f"Processing failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
        if os.path.exists(pptx_path):
            try:
                os.remove(pptx_path)
            except OSError:
                pass

@app.post("/api/admin/courses/{course_id}/upload-pptx")
async def upload_course_pptx(course_id: str, background_tasks: BackgroundTasks,
                             file: UploadFile = File(...),
                             admin: models.User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    db.close()
    if not course:
        raise HTTPException(404, "Course not found")
    if not (file.filename or "").lower().endswith((".pptx", ".pptm")):
        raise HTTPException(400, "File must be a .pptx or .pptm")

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)

    pptx_filename = f"pending_{int(time.time())}_{file.filename}"
    pptx_path = os.path.join(course_dir, pptx_filename)

    # Stream the body to disk in chunks. The previous
    # `shutil.copyfileobj(file.file, f)` was a blocking, whole-file copy inside
    # an `async def` — on a 1 GB deck it froze the event loop (every other API
    # request stalled) for as long as the copy took. `await file.read(...)`
    # yields between chunks, so the rest of the API stays responsive.
    CHUNK = 4 * 1024 * 1024
    size = 0
    try:
        with open(pptx_path, "wb") as f:
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)
    except Exception as e:
        _safe_unlink(pptx_path)
        raise HTTPException(500, f"Could not save the upload: {e}")

    # Validate before accepting. A .pptx is a zip; a truncated or partially
    # copied file has no central directory and every downstream step
    # (python-pptx, LibreOffice, the video extractor) fails on it. Catching it
    # here turns a silent background failure + endless spinner into an
    # immediate, actionable error.
    try:
        with _zipfile.ZipFile(pptx_path) as z:
            names = z.namelist()
        if "ppt/presentation.xml" not in names:
            raise ValueError("missing ppt/presentation.xml")
    except Exception:
        _safe_unlink(pptx_path)
        raise HTTPException(
            400,
            f"'{file.filename}' is not a readable PowerPoint file — it looks "
            f"truncated or corrupt ({size / (1024 * 1024):.0f} MB received). "
            "Re-open it in PowerPoint and use File > Save As to write a fresh "
            "copy, then upload that.",
        )

    _pptx_job_set(course_id, stage="queued", pct=0,
                  message="Upload received — starting processing…")
    background_tasks.add_task(process_pptx_background, course_id, pptx_path, file.filename, course_dir)
    return {"message": "Processing started in background.", "bytes": size}


@app.get("/api/admin/courses/{course_id}/pptx-status")
def pptx_status(course_id: str, admin: models.User = Depends(require_admin)):
    """Progress of the background PPTX import for this course.

    Returns `{stage: "idle"}` when nothing is running — including after a
    server restart, which the UI treats as "stopped" rather than hanging.
    """
    job = _pptx_job_read(course_id)
    if not job:
        return {"stage": "idle", "pct": 0, "done": True, "error": None, "message": ""}
    return {
        "stage": job.get("stage", "queued"),
        "pct": job.get("pct", 0),
        "message": job.get("message", ""),
        "error": job.get("error"),
        "done": bool(job.get("done")),
        "added": job.get("added"),
    }

# ---------------------------------------------------------------------------
# Video upload/processing job tracker
#
# Mirrors the PPTX job tracker above. File-based so all gunicorn workers can
# read the same state without needing Redis/a schema change.
# ---------------------------------------------------------------------------
_video_job_lock = _threading.Lock()


def _video_job_path(course_id: str) -> str:
    return os.path.join(UPLOAD_DIR, course_id, "_video_job.json")


def _video_job_read(course_id: str) -> dict | None:
    try:
        with open(_video_job_path(course_id), "r", encoding="utf-8") as fh:
            return json.loads(fh.read())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _video_job_write(course_id: str, job: dict) -> None:
    path = _video_job_path(course_id)
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(job))
    os.replace(tmp, path)


def _video_job_set(course_id: str, *, stage: str, pct: int | None = None,
                   message: str = "", error: str | None = None,
                   done: bool = False, url: str | None = None,
                   chapter_id: str | None = None):
    with _video_job_lock:
        job = _video_job_read(course_id) or {}
        job.update({
            "stage": stage,
            "message": message,
            "error": error,
            "done": done,
            "updated": time.time(),
        })
        if pct is not None:
            job["pct"] = max(0, min(100, int(pct)))
        if url is not None:
            job["url"] = url
        if chapter_id is not None:
            job["chapter_id"] = chapter_id
        _video_job_write(course_id, job)
    return job


def _process_video_background(course_id: str, raw_path: str, filename: str,
                               ext: str, chapter_id: str | None, title: str | None):
    """Run ffmpeg compression and save in a background thread, then persist to DB."""
    db = SessionLocal()
    try:
        _video_job_set(course_id, stage="compressing", pct=10,
                       message="Compressing video — this can take several minutes for large files…")

        if ext.lower() == ".mp4":
            final_path = compress_video(raw_path)
            if final_path == raw_path:
                # ffmpeg unavailable/failed — try moving moov atom for fast-start
                try:
                    from qtfaststart import processor
                    processor.process(raw_path, raw_path + ".tmp")
                    os.replace(raw_path + ".tmp", raw_path)
                except Exception as e:
                    print("qtfaststart failed:", e)
        else:
            final_path = raw_path

        _video_job_set(course_id, stage="saving", pct=85,
                       message="Compression done — saving file…")

        storage.save(course_id, filename, final_path)
        url = f"/api/uploads/{course_id}/{filename}"

        course = db.query(models.Course).filter(models.Course.id == course_id).first()
        if not course:
            _video_job_set(course_id, stage="failed", pct=100, done=True,
                           error="Course no longer exists.")
            return

        if chapter_id:
            ch = db.get(models.Chapter, chapter_id)
            if ch and ch.course_id == course_id:
                ch.videos = [*(ch.videos or []), url]
                db.commit()
                _video_job_set(course_id, stage="done", pct=100, done=True,
                               url=url, chapter_id=ch.id,
                               message="Video added to existing lesson.")
                return

        # Create a new chapter
        ch = models.Chapter(
            id=f"{course_id}-video-{_next_chapter_n(course)}-{uuid.uuid4().hex[:8]}",
            course_id=course_id,
            n=_next_chapter_n(course),
            title=(title or "Video").strip() or "Video",
            sections=[], videos=[url],
            order=_next_chapter_order(course),
            kind="lesson",
        )
        db.add(ch)
        _revoke_course_completion(db, course_id)
        db.commit()
        db.refresh(ch)
        _video_job_set(course_id, stage="done", pct=100, done=True,
                       url=url, chapter_id=ch.id,
                       message="Video lesson created successfully.")
        print(f"[video] background processing finished for {course_id}")

    except Exception as e:
        print(f"[video] background processing failed: {e}")
        import traceback; traceback.print_exc()
        _video_job_set(course_id, stage="failed", pct=100, done=True,
                       error=f"Processing failed: {e}")
        # clean up raw file on failure
        if os.path.exists(raw_path):
            try:
                os.remove(raw_path)
            except OSError:
                pass
    finally:
        db.close()


@app.post("/api/admin/courses/{course_id}/upload-video")
async def admin_upload_video(course_id: str, background_tasks: BackgroundTasks,
                              file: UploadFile = File(...),
                              chapterId: str | None = Form(None),
                              title: str | None = Form(None),
                              admin: models.User = Depends(require_admin),
                              db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    db.close()
    if not course:
        raise HTTPException(404, "Course not found")

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".mp4"
    filename = f"video_{uuid.uuid4().hex[:8]}{ext}"

    # Step 1: stream body to disk immediately — return 202 as soon as it lands.
    # ffmpeg runs in the background so this HTTP request resolves right away.
    raw_path = os.path.join(course_dir, f"_upload_{uuid.uuid4().hex[:8]}{ext}")
    CHUNK = 4 * 1024 * 1024
    size = 0
    try:
        with open(raw_path, "wb") as f:
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)
    except Exception as e:
        _safe_unlink(raw_path)
        raise HTTPException(500, f"Could not save the upload: {e}")

    _video_job_set(course_id, stage="queued", pct=5,
                   message="Upload received — starting compression…")
    background_tasks.add_task(
        _process_video_background,
        course_id, raw_path, filename, ext, chapterId, title
    )
    return {"message": "Processing started in background.", "bytes": size}


@app.get("/api/admin/courses/{course_id}/upload-video-status")
def video_upload_status(course_id: str, admin: models.User = Depends(require_admin)):
    """Progress of the background video compression/import for this course.

    Returns `{stage: "idle"}` when nothing is running.
    """
    job = _video_job_read(course_id)
    if not job:
        return {"stage": "idle", "pct": 0, "done": True, "error": None, "message": "", "url": None, "chapter_id": None}
    return {
        "stage": job.get("stage", "queued"),
        "pct": job.get("pct", 0),
        "message": job.get("message", ""),
        "error": job.get("error"),
        "done": bool(job.get("done")),
        "url": job.get("url"),
        "chapter_id": job.get("chapter_id"),
    }


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
        id=f"{course_id}-quiz-{_next_chapter_n(course)}-{uuid.uuid4().hex[:8]}", course_id=course_id,
        n=_next_chapter_n(course), title=req.title.strip() or "Quiz",
        sections=[], videos=[], kind="quiz", order=0,
    )
    chapters.insert(insert_at, quiz)
    db.add(quiz)
    for i, ch in enumerate(chapters):
        ch.order = i
        ch.n = i + 1
    _revoke_course_completion(db, course_id)
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
    db.query(models.ChapterQuestion).filter_by(chapter_id=chapter_id).delete()
    db.delete(ch)
    db.flush()
    # Re-index remaining chapters so 'n' and 'order' remain contiguous
    course = db.get(models.Course, course_id)
    if course:
        remaining = sorted(course.chapters, key=lambda c: c.order)
        for i, r in enumerate(remaining):
            r.order = i
            r.n = i + 1

        # Heal anyone whose progress now covers 100% of what's left (e.g. they
        # had finished every chapter except this deleted one) — without this
        # their progress bar would read 100% but no certificate approval was
        # ever queued, since that only used to fire on the completion click.
        db.flush()
        for p in db.query(models.Progress).filter_by(course_id=course_id).all():
            _maybe_auto_complete_course(db, course, p, p.learner_id)
    db.commit()
    for p in files_to_remove:
        storage.delete(course_id, os.path.basename(p))
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


# ============================================================
# SCREENING / ENTRANCE TEST — TEST-TAKER ROUTES
# ============================================================

SCREENING_PHOTO_DIR = os.path.join(UPLOAD_DIR, "screening_photos")
os.makedirs(SCREENING_PHOTO_DIR, exist_ok=True)


class ScreeningLoginRequest(BaseModel):
    name: str
    password: str


@app.post("/api/screening/login")
def screening_login(req: ScreeningLoginRequest, db: Session = Depends(get_db)):
    """Test-taker login: full name + password."""
    name = (req.name or "").strip()
    if not name or not req.password:
        raise HTTPException(401, "Name and password are required")
    check_rate_limit(db, f"screening:{normalize_name(name)}")
    candidates = db.query(models.ScreeningCandidate).filter_by(is_active=True).all()
    target = normalize_name(name)
    match = None
    for c in candidates:
        if normalize_name(c.full_name) == target:
            if verify_password(req.password, c.password_hash):
                match = c
                break
    if not match:
        raise HTTPException(401, "Invalid name or password")
    if match.status == "submitted":
        raise HTTPException(403, "You have already submitted this test")
    clear_rate_limit(db, f"screening:{normalize_name(name)}")
    token = create_screening_token(match)
    return {"token": token, "candidate": candidate_public(match)}


@app.get("/api/screening/test")
def screening_get_test(
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Get the full test details for the current candidate (no answer keys)."""
    test = db.get(models.ScreeningTest, candidate.test_id)
    if not test or not test.is_active:
        raise HTTPException(404, "Test not found or inactive")
    attempt = candidate.attempt
    sections_data = []
    for sec in test.sections:
        s = {
            "id": sec.id, "title": sec.title,
            "type": sec.section_type, "order": sec.order,
            "passage": sec.passage,
            "questions": [
                {"id": q.id, "prompt": q.prompt, "options": q.options,
                 "imageUrls": q.image_urls or [], "order": q.order}
                for q in sec.questions
            ],
        }
        sections_data.append(s)
    # Remaining time is computed server-side against the DB clock. `started_at`
    # comes from the DB's now(), so comparing it to the DB's now() again keeps
    # both values on one wall clock — the candidate's browser timezone (and any
    # clock skew) can't shorten or extend the exam.
    remaining_seconds = None
    if attempt and attempt.started_at and not attempt.submitted_at:
        db_now = db.query(func.now()).scalar()
        started = attempt.started_at
        if db_now.tzinfo is not None:
            db_now = db_now.replace(tzinfo=None)
        if started.tzinfo is not None:
            started = started.replace(tzinfo=None)
        elapsed = (db_now - started).total_seconds()
        remaining_seconds = max(0, int(test.timer_minutes * 60 - elapsed))

    return {
        "id": test.id, "title": test.title,
        "timerMinutes": test.timer_minutes,
        "correctScore": test.correct_score,
        "wrongPenalty": test.wrong_penalty,
        "remainingSeconds": remaining_seconds,
        "sections": sections_data,
        "attempt": {
            "startedAt": attempt.started_at.isoformat() if attempt else None,
            "submittedAt": attempt.submitted_at.isoformat() if attempt and attempt.submitted_at else None,
            "status": candidate.status,
            "tabSwitchCount": attempt.tab_switch_count or 0,
            # Last autosaved (or submitted) answers — lets the client resume
            # from the server's copy if local browser storage was lost
            # (device power-off, different browser/device, cleared storage).
            "sectionAnswers": attempt.section_answers or {},
            "personalData": attempt.personal_data or {},
        } if attempt else None,
    }


@app.post("/api/screening/start")
def screening_start(
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Create the attempt row (records start time). Idempotent."""
    if candidate.status == "submitted":
        raise HTTPException(403, "Test already submitted")
    existing = candidate.attempt
    if existing:
        return {"startedAt": existing.started_at.isoformat(), "ok": True}
    attempt = models.ScreeningAttempt(
        candidate_id=candidate.id, test_id=candidate.test_id,
    )
    db.add(attempt)
    candidate.status = "in_progress"
    db.commit()
    db.refresh(attempt)
    return {"startedAt": attempt.started_at.isoformat(), "ok": True}


@app.post("/api/screening/tab-switch")
def screening_tab_switch(
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Record one instance of the candidate leaving the exam tab/window."""
    if candidate.status == "submitted":
        raise HTTPException(403, "Test already submitted")
    attempt = candidate.attempt
    if not attempt:
        raise HTTPException(400, "Test not started")
    attempt.tab_switch_count = (attempt.tab_switch_count or 0) + 1
    db.commit()
    return {"tabSwitchCount": attempt.tab_switch_count}


@app.post("/api/screening/photo")
async def screening_upload_photo(
    file: UploadFile = File(...),
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Upload passport-size photo for the candidate."""
    from PIL import Image
    data = await file.read()
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise HTTPException(400, "Invalid image file")
    dest = os.path.join(SCREENING_PHOTO_DIR, f"{candidate.id}.jpg")
    img2 = Image.open(io.BytesIO(data)).convert("RGB")
    img2.thumbnail((600, 600))
    img2.save(dest, "JPEG", quality=85)
    if candidate.attempt:
        candidate.attempt.photo_path = dest
    db.commit()
    return {"ok": True, "hasPhoto": True}


@app.get("/api/screening/photo")
def screening_get_photo(
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
):
    """Serve the signed-in candidate's own identity photo (exam header/sidebar)."""
    path = os.path.join(SCREENING_PHOTO_DIR, f"{candidate.id}.jpg")
    if not os.path.exists(path):
        raise HTTPException(404, "No photo on record")
    with open(path, "rb") as fh:
        return Response(fh.read(), media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=300"})


class ScreeningSubmitRequest(BaseModel):
    personal_data: Optional[dict] = None
    section_answers: dict  # {section_id: [int | null]}


@app.post("/api/screening/submit")
def screening_submit(
    req: ScreeningSubmitRequest,
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Grade and finalise the test. Returns the scored result."""
    if candidate.status == "submitted":
        raise HTTPException(403, "Test already submitted")
    test = db.get(models.ScreeningTest, candidate.test_id)
    if not test:
        raise HTTPException(404, "Test not found")

    attempt = candidate.attempt
    if not attempt:
        attempt = models.ScreeningAttempt(candidate_id=candidate.id, test_id=candidate.test_id)
        db.add(attempt)
        db.flush()

    correct = wrong = unanswered = 0
    section_results = []
    for sec in test.sections:
        if sec.section_type == "personal_data":
            continue
        answers = req.section_answers.get(sec.id, [])
        sq = 0; swrong = 0; sunanswered = 0
        for i, q in enumerate(sec.questions):
            chosen = answers[i] if i < len(answers) else None
            if chosen is None:
                sunanswered += 1
            elif chosen == q.answer:
                sq += 1
            else:
                swrong += 1
        correct += sq
        wrong += swrong
        unanswered += sunanswered
        section_results.append({
            "sectionId": sec.id, "title": sec.title,
            "correct": sq, "wrong": swrong, "unanswered": sunanswered,
            "total": len(sec.questions),
        })

    raw_score = correct * test.correct_score - wrong * test.wrong_penalty

    attempt.personal_data = req.personal_data
    attempt.section_answers = req.section_answers
    attempt.score = raw_score
    attempt.correct_count = correct
    attempt.wrong_count = wrong
    attempt.unanswered_count = unanswered
    attempt.submitted_at = datetime.now(timezone.utc)

    candidate.status = "submitted"
    if req.personal_data:
        mob = req.personal_data.get("mobile") or req.personal_data.get("mobileNumber")
        if mob and not candidate.mobile_number:
            candidate.mobile_number = mob
    db.commit()
    return {
        "score": raw_score, "correct": correct, "wrong": wrong,
        "unanswered": unanswered,
        "correctScore": test.correct_score,
        "wrongPenalty": test.wrong_penalty,
        "sectionResults": section_results,
        "submittedAt": attempt.submitted_at.isoformat(),
    }


@app.post("/api/screening/autosave")
def screening_autosave(
    req: ScreeningSubmitRequest,
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Periodically persist in-progress answers so a device power-off,
    crash, or connection drop mid-test doesn't lose the candidate's work.
    Never grades or finalises anything — that only happens in /submit."""
    if candidate.status == "submitted":
        raise HTTPException(403, "Test already submitted")
    attempt = candidate.attempt
    if not attempt:
        raise HTTPException(400, "Test not started")
    attempt.section_answers = req.section_answers
    if req.personal_data:
        attempt.personal_data = req.personal_data
    db.commit()
    return {"ok": True, "savedAt": datetime.now(timezone.utc).isoformat()}


@app.get("/api/screening/result")
def screening_result(
    candidate: models.ScreeningCandidate = Depends(get_current_candidate),
    db: Session = Depends(get_db),
):
    """Get the result for the current candidate (after submission)."""
    if candidate.status != "submitted":
        raise HTTPException(400, "Test not yet submitted")
    attempt = candidate.attempt
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    test = db.get(models.ScreeningTest, candidate.test_id)

    # Attemptable total comes from the graded sections, so the result page can
    # show a real "x / max" and percentage rather than dividing by nothing.
    total_questions = sum(
        len(s.questions) for s in (test.sections or [])
        if s.section_type != "personal_data"
    ) if test else 0
    max_score = total_questions * (test.correct_score if test else 4)

    time_taken_minutes = None
    if attempt.started_at and attempt.submitted_at:
        started, ended = attempt.started_at, attempt.submitted_at
        if (started.tzinfo is None) != (ended.tzinfo is None):
            started = started.replace(tzinfo=None)
            ended = ended.replace(tzinfo=None)
        time_taken_minutes = max(0, round((ended - started).total_seconds() / 60))

    return {
        "score": attempt.score, "correct": attempt.correct_count,
        "wrong": attempt.wrong_count, "unanswered": attempt.unanswered_count,
        "correctScore": test.correct_score if test else 4,
        "wrongPenalty": test.wrong_penalty if test else 1,
        "totalQuestions": total_questions,
        "maxScore": max_score,
        "timeTakenMinutes": time_taken_minutes,
        "fullName": candidate.full_name,
        "testTitle": test.title if test else None,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
    }


# ============================================================
# ADMIN — SCREENING MANAGEMENT
# ============================================================

class CreateTestRequest(BaseModel):
    title: str
    timerMinutes: int = 80
    correctScore: int = 4
    wrongPenalty: int = 1


class SectionRequest(BaseModel):
    id: Optional[str] = None
    title: str
    section_type: str = "mcq"
    passage: Optional[str] = None
    order: int = 0


class QuestionRequest(BaseModel):
    id: Optional[str] = None
    prompt: str
    options: list[str]
    answer: int
    imageUrls: Optional[list[str]] = None
    order: int = 0


class BulkQuestionsRequest(BaseModel):
    questions: list[QuestionRequest]


class CreateCandidateRequest(BaseModel):
    fullName: str
    password: str
    testId: str
    mobileNumber: Optional[str] = None


def serialize_test(t, include_sections=False, db=None):
    candidate_count = len(t.candidates) if t.candidates else 0
    submitted_count = sum(1 for c in (t.candidates or []) if c.status == "submitted")
    total_questions = sum(
        len(s.questions) for s in (t.sections or []) if s.section_type == "mcq"
    )
    data = {
        "id": t.id, "title": t.title, "timerMinutes": t.timer_minutes,
        "correctScore": t.correct_score, "wrongPenalty": t.wrong_penalty,
        "isActive": t.is_active, "createdAt": t.created_at.isoformat() if t.created_at else None,
        "candidateCount": candidate_count, "submittedCount": submitted_count,
        "totalQuestions": total_questions,
    }
    if include_sections:
        data["sections"] = [
            {
                "id": s.id, "title": s.title, "type": s.section_type,
                "passage": s.passage, "order": s.order,
                "questions": [
                    {"id": q.id, "prompt": q.prompt, "options": q.options,
                     "answer": q.answer, "imageUrls": q.image_urls or [], "order": q.order}
                    for q in s.questions
                ],
            }
            for s in (t.sections or [])
        ]
    return data


@app.get("/api/admin/screening/tests")
def admin_list_tests(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    tests = db.query(models.ScreeningTest).order_by(models.ScreeningTest.created_at.desc()).all()
    return [serialize_test(t) for t in tests]


@app.post("/api/admin/screening/tests")
def admin_create_test(req: CreateTestRequest,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = models.ScreeningTest(
        title=req.title, timer_minutes=req.timerMinutes,
        correct_score=req.correctScore, wrong_penalty=req.wrongPenalty,
    )
    db.add(test)
    db.flush()
    # Auto-create the default personal data section
    db.add(models.ScreeningSection(
        test_id=test.id, title="Personal Details",
        section_type="personal_data", order=0,
    ))
    db.commit()
    db.refresh(test)
    return serialize_test(test, include_sections=True)


@app.get("/api/admin/screening/tests/{test_id}")
def admin_get_test(test_id: str,
                   admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    return serialize_test(test, include_sections=True)

@app.post("/api/admin/screening/tests/{test_id}/duplicate")
def admin_duplicate_test(test_id: str,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    
    import re
    match = re.search(r' (\d+)$', test.title)
    if match:
        num = int(match.group(1)) + 1
        new_title = re.sub(r' \d+$', f' {num}', test.title)
    else:
        new_title = f"{test.title} 1"
    
    new_test = models.ScreeningTest(
        title=new_title,
        timer_minutes=test.timer_minutes,
        correct_score=test.correct_score,
        wrong_penalty=test.wrong_penalty,
        is_active=test.is_active,
    )
    db.add(new_test)
    db.flush()
    
    for section in test.sections:
        new_section = models.ScreeningSection(
            test_id=new_test.id,
            title=section.title,
            section_type=section.section_type,
            passage=section.passage,
            order=section.order
        )
        db.add(new_section)
        db.flush()
        
        for q in section.questions:
            new_q = models.ScreeningQuestion(
                section_id=new_section.id,
                prompt=q.prompt,
                options=q.options,
                answer=q.answer,
                image_urls=q.image_urls,
                order=q.order
            )
            db.add(new_q)
            
    db.commit()
    db.refresh(new_test)
    return serialize_test(new_test, include_sections=True)


@app.patch("/api/admin/screening/tests/{test_id}")
def admin_update_test(test_id: str, req: CreateTestRequest,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    test.title = req.title
    test.timer_minutes = req.timerMinutes
    test.correct_score = req.correctScore
    test.wrong_penalty = req.wrongPenalty
    db.commit()
    return serialize_test(test, include_sections=True)


@app.patch("/api/admin/screening/tests/{test_id}/toggle")
def admin_toggle_test(test_id: str,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    test.is_active = not test.is_active
    db.commit()
    return {"isActive": test.is_active}


@app.delete("/api/admin/screening/tests/{test_id}")
def admin_delete_test(test_id: str,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    db.delete(test)
    db.commit()
    return {"ok": True}


@app.post("/api/admin/screening/tests/{test_id}/sections")
def admin_add_section(test_id: str, req: SectionRequest,
                       admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    test = db.get(models.ScreeningTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    # Determine next order
    existing_orders = [s.order for s in test.sections]
    next_order = max(existing_orders) + 1 if existing_orders else 1
    sec = models.ScreeningSection(
        test_id=test_id, title=req.title,
        section_type=req.section_type, passage=req.passage,
        order=next_order,
    )
    db.add(sec)
    db.commit()
    db.refresh(test)
    return serialize_test(test, include_sections=True)


@app.patch("/api/admin/screening/tests/{test_id}/sections/{section_id}")
def admin_update_section(test_id: str, section_id: str, req: SectionRequest,
                          admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    sec = db.get(models.ScreeningSection, section_id)
    if not sec or sec.test_id != test_id:
        raise HTTPException(404, "Section not found")
    sec.title = req.title
    sec.passage = req.passage
    db.commit()
    test = db.get(models.ScreeningTest, test_id)
    return serialize_test(test, include_sections=True)


@app.delete("/api/admin/screening/tests/{test_id}/sections/{section_id}")
def admin_delete_section(test_id: str, section_id: str,
                          admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    sec = db.get(models.ScreeningSection, section_id)
    if not sec or sec.test_id != test_id:
        raise HTTPException(404, "Section not found")
    if sec.section_type == "personal_data":
        raise HTTPException(400, "Cannot delete the personal data section")
    db.delete(sec)
    db.commit()
    test = db.get(models.ScreeningTest, test_id)
    return serialize_test(test, include_sections=True)


@app.put("/api/admin/screening/tests/{test_id}/sections/{section_id}/questions")
def admin_save_section_questions(
    test_id: str, section_id: str, req: BulkQuestionsRequest,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Replace all questions in a section."""
    sec = db.get(models.ScreeningSection, section_id)
    if not sec or sec.test_id != test_id:
        raise HTTPException(404, "Section not found")
    db.query(models.ScreeningQuestion).filter_by(section_id=section_id).delete()
    for i, q in enumerate(req.questions):
        db.add(models.ScreeningQuestion(
            section_id=section_id, prompt=q.prompt, options=q.options,
            answer=q.answer, image_urls=q.imageUrls, order=i,
        ))
    db.commit()
    test = db.get(models.ScreeningTest, test_id)
    return serialize_test(test, include_sections=True)


@app.post("/api/admin/screening/upload-question-image")
async def admin_upload_screening_question_image(
    file: UploadFile = File(...),
    admin: models.User = Depends(require_admin),
):
    """Upload an image for a screening MCQ question (figure/diagram-based
    reasoning questions). Returns the URL to save into the question's
    imageUrl — goes through the same storage backend as everything else
    (local disk in dev, Azure Blob in prod), unlike the always-local
    candidate identity photos."""
    from PIL import Image
    data = await file.read()
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise HTTPException(400, "Invalid image file")
    img2 = Image.open(io.BytesIO(data)).convert("RGB")
    img2.thumbnail((1000, 1000))
    filename = f"{uuid.uuid4().hex}.jpg"
    tmp_path = os.path.join(UPLOAD_DIR, f"_tmp_{filename}")
    img2.save(tmp_path, "JPEG", quality=88)
    storage.save("screening-questions", filename, tmp_path)
    return {"imageUrl": f"/api/uploads/screening-questions/{filename}"}


# --- Candidates ---

@app.get("/api/admin/screening/candidates")
def admin_list_candidates(
    test_id: Optional[str] = None,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    q = db.query(models.ScreeningCandidate)
    if test_id:
        q = q.filter_by(test_id=test_id)
    candidates = q.order_by(models.ScreeningCandidate.created_at.desc()).all()
    result = []
    for c in candidates:
        test = db.get(models.ScreeningTest, c.test_id)
        att = c.attempt
        result.append({
            "id": c.id, "fullName": c.full_name, "mobileNumber": c.mobile_number,
            "status": c.status, "isActive": c.is_active,
            "testId": c.test_id, "testTitle": test.title if test else "—",
            "createdAt": c.created_at.isoformat() if c.created_at else None,
            "startedAt": att.started_at.isoformat() if att and att.started_at else None,
            "submittedAt": att.submitted_at.isoformat() if att and att.submitted_at else None,
            "score": att.score if att else None,
            "tabSwitchCount": att.tab_switch_count or 0 if att else 0,
        })
    return result


@app.post("/api/admin/screening/candidates")
def admin_create_candidate(
    req: CreateCandidateRequest,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    test = db.get(models.ScreeningTest, req.testId)
    if not test:
        raise HTTPException(404, "Test not found")
    c = models.ScreeningCandidate(
        test_id=req.testId, full_name=req.fullName.strip(),
        password_hash=hash_password(req.password),
        mobile_number=req.mobileNumber,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "id": c.id, "fullName": c.full_name, "mobileNumber": c.mobile_number,
        "status": c.status, "testId": c.test_id, "testTitle": test.title,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "startedAt": None, "submittedAt": None, "score": None,
    }


@app.patch("/api/admin/screening/candidates/{cand_id}")
def admin_update_candidate(
    cand_id: str, req: dict,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    c = db.get(models.ScreeningCandidate, cand_id)
    if not c:
        raise HTTPException(404, "Candidate not found")
    if "isActive" in req:
        c.is_active = req["isActive"]
    if "fullName" in req and req["fullName"].strip():
        c.full_name = req["fullName"].strip()
    if "mobileNumber" in req:
        c.mobile_number = req["mobileNumber"]
    if "password" in req and req["password"]:
        c.password_hash = hash_password(req["password"])
    if "testId" in req and req["testId"] and req["testId"] != c.test_id:
        new_test = db.get(models.ScreeningTest, req["testId"])
        if not new_test:
            raise HTTPException(404, "Test not found")
        # switching tests invalidates any progress/result on the old one
        if c.attempt:
            db.delete(c.attempt)
        c.test_id = req["testId"]
        c.status = "pending"
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/screening/candidates/{cand_id}")
def admin_delete_candidate(
    cand_id: str,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    c = db.get(models.ScreeningCandidate, cand_id)
    if not c:
        raise HTTPException(404, "Candidate not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


# --- Results ---

@app.get("/api/admin/screening/results")
def admin_screening_results(
    test_id: Optional[str] = None,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    q = db.query(models.ScreeningAttempt)
    if test_id:
        q = q.filter_by(test_id=test_id)
    attempts = q.order_by(models.ScreeningAttempt.submitted_at.desc()).all()
    rows = []
    for att in attempts:
        c = db.get(models.ScreeningCandidate, att.candidate_id)
        test = db.get(models.ScreeningTest, att.test_id)
        if not c:
            continue
        # Time taken
        time_taken = None
        if att.started_at and att.submitted_at:
            delta = att.submitted_at - att.started_at
            time_taken = round(delta.total_seconds() / 60, 1)
        # Total possible score
        total_q = sum(
            len(s.questions) for s in (test.sections if test else [])
            if s.section_type == "mcq"
        )
        max_score = total_q * (test.correct_score if test else 4)
        rows.append({
            "candidateId": c.id, "fullName": c.full_name,
            "mobileNumber": c.mobile_number or att.personal_data.get("mobile", "") if att.personal_data else (c.mobile_number or ""),
            "testId": att.test_id, "testTitle": test.title if test else "—",
            "startedAt": att.started_at.isoformat() if att.started_at else None,
            "submittedAt": att.submitted_at.isoformat() if att.submitted_at else None,
            "timeTakenMinutes": time_taken,
            "correct": att.correct_count or 0,
            "wrong": att.wrong_count or 0,
            "unanswered": att.unanswered_count or 0,
            "score": att.score or 0,
            "maxScore": max_score,
            "totalQuestions": total_q,
            "personalData": att.personal_data,
            "tabSwitchCount": att.tab_switch_count or 0,
        })
    return rows


@app.get("/api/admin/screening/results.xlsx")
def admin_screening_results_xlsx(
    test_id: Optional[str] = None,
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Download screening results as a styled Excel workbook."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    rows_data = admin_screening_results(test_id=test_id, admin=admin, db=db)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Screening Results"

    # Header style
    header_fill = PatternFill("solid", fgColor="1A2744")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    center = Alignment(horizontal="center", vertical="center")
    thin = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    headers = [
        "Name", "Mobile Number", "Test", "Start Time", "Submit Time",
        "Time Taken (min)", "Correct", "Wrong", "Unanswered", "Score",
        "Remark", "Shortlisted",
    ]
    ws.append(headers)
    for col_idx, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = thin
    ws.row_dimensions[1].height = 22

    alt_fill = PatternFill("solid", fgColor="EEF2FF")
    for row_i, r in enumerate(rows_data, 2):
        def fmt_dt(iso):
            if not iso:
                return ""
            try:
                from datetime import datetime as dt
                return dt.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y %H:%M")
            except Exception:
                return iso

        ws.append([
            r["fullName"], r["mobileNumber"] or "", r["testTitle"],
            fmt_dt(r["startedAt"]), fmt_dt(r["submittedAt"]),
            r["timeTakenMinutes"] or "",
            r["correct"], r["wrong"], r["unanswered"],
            r["score"],
            "",  # Remark     — to be filled manually by admin
            "",  # Shortlisted — to be filled manually by admin
        ])
        fill = alt_fill if row_i % 2 == 0 else None
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_i, column=col_idx)
            cell.border = thin
            cell.alignment = Alignment(vertical="center")
            if fill:
                cell.fill = fill

    # Column widths
    col_widths = [28, 18, 28, 20, 20, 18, 10, 10, 12, 10, 15, 30]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=screening-results.xlsx"},
    )


# ============================================================
# ORIENTATION PROGRAM
# ============================================================
# Candidates are existing crew (User rows, role='learner') — no separate
# login. Approvers (vessel Master / Chief Engineer) are the SAME crew User
# rows — no separate account either. Eligibility is computed live on every
# request from rank + emp_status + current_vessel (see
# orientation_ranks.vessel_approver_info); a Master/Chief Engineer signs in
# with the same crew_id + DOB as any other crew member. Approval is 100%
# in-app — no emails anywhere in this flow.

def orientation_program_summary(program):
    return {
        "id": program.id, "title": program.title, "subtitle": program.subtitle,
        "department": program.department, "fromRank": program.from_rank,
        "toRank": program.to_rank, "isActive": bool(program.is_active),
        "order": program.order, "taskCount": len(program.tasks),
        "enrollmentCount": len(program.enrollments),
    }


def orientation_task_detail(t):
    return {
        "id": t.id, "title": t.title, "description": t.description,
        "order": t.order, "requiresProof": bool(t.requires_proof),
    }


def _next_orientation_task_order(program) -> int:
    return (max((t.order for t in program.tasks), default=-1)) + 1


class OrientationProgramRequest(BaseModel):
    title: str
    subtitle: str | None = None
    department: str            # 'deck' | 'engine'
    fromRank: str | None = None
    toRank: str | None = None


@app.get("/api/admin/orientation/programs")
def admin_list_orientation_programs(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    programs = db.query(models.OrientationProgram).order_by(models.OrientationProgram.order).all()
    return [orientation_program_summary(p) for p in programs]


@app.post("/api/admin/orientation/programs")
def admin_create_orientation_program(req: OrientationProgramRequest,
                                     admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    if req.department not in ("deck", "engine"):
        raise HTTPException(400, "Department must be 'deck' or 'engine'")
    max_order = db.query(func.max(models.OrientationProgram.order)).scalar()
    program = models.OrientationProgram(
        title=title, subtitle=(req.subtitle or "").strip() or None,
        department=req.department, from_rank=(req.fromRank or "").strip() or None,
        to_rank=(req.toRank or "").strip() or None,
        order=(max_order + 1) if max_order is not None else 0,
    )
    db.add(program)
    db.commit()
    db.refresh(program)
    return orientation_program_summary(program)


@app.get("/api/admin/orientation/programs/{program_id}")
def admin_get_orientation_program(program_id: str, admin: models.User = Depends(require_admin),
                                  db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    return {
        **orientation_program_summary(program),
        "tasks": [orientation_task_detail(t) for t in sorted(program.tasks, key=lambda t: t.order)],
    }


@app.put("/api/admin/orientation/programs/{program_id}")
def admin_update_orientation_program(program_id: str, req: OrientationProgramRequest,
                                     admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    if req.department not in ("deck", "engine"):
        raise HTTPException(400, "Department must be 'deck' or 'engine'")
    program.title = title
    program.subtitle = (req.subtitle or "").strip() or None
    program.department = req.department
    program.from_rank = (req.fromRank or "").strip() or None
    program.to_rank = (req.toRank or "").strip() or None
    db.commit()
    return orientation_program_summary(program)


@app.patch("/api/admin/orientation/programs/{program_id}/toggle")
def admin_toggle_orientation_program(program_id: str, admin: models.User = Depends(require_admin),
                                     db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    program.is_active = not program.is_active
    db.commit()
    return {"isActive": program.is_active}


@app.delete("/api/admin/orientation/programs/{program_id}")
def admin_delete_orientation_program(program_id: str, admin: models.User = Depends(require_admin),
                                     db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    db.delete(program)
    db.commit()
    return {"ok": True}


@app.get("/api/admin/orientation/programs.xlsx")
def admin_orientation_programs_xlsx(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Export all orientation programs as an Excel workbook — one sheet per program.
    Format mirrors the reference: program title header, officer name/ID/rank row,
    then each task as Task Name + Description + Master's Initials line."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    programs = db.query(models.OrientationProgram).order_by(models.OrientationProgram.order).all()
    wb = Workbook()
    wb.remove(wb.active)  # remove default sheet

    thin = Side(style="thin")
    border_bottom = Border(bottom=thin)

    for prog in programs:
        # Sheet name: max 31 chars, no special chars
        sheet_name = (prog.title or "Program")[:31].replace("/", "-").replace("\\", "-").replace("?", "").replace("*", "").replace("[", "").replace("]", "")
        ws = wb.create_sheet(title=sheet_name)

        # Column widths
        ws.column_dimensions["A"].width = 120

        dept_label = "Engine" if prog.department == "engine" else "Deck"
        approver_role = "Chief Engineer" if prog.department == "engine" else "Master"

        # ---- Row 1: Program title header ----
        ws.append([prog.title or ""])
        title_cell = ws["A1"]
        title_cell.font = Font(bold=True, size=14)
        title_cell.alignment = Alignment(wrap_text=True)

        # ---- Row 2: Subtitle / dept ----
        subtitle = prog.subtitle or f"{dept_label} Mentoring Program"
        ws.append([subtitle])
        ws["A2"].font = Font(bold=True, size=11)

        ws.append([""])  # spacer

        # ---- Officer name/ID/rank row ----
        rank_from = prog.from_rank or ""
        rank_to = prog.to_rank or ""
        rank_label = f"{rank_from} to {rank_to}" if rank_from and rank_to else (rank_from or rank_to or dept_label)
        ws.append([f"{'Name':<54}{'ID':<40}{'Rank':<20}"])
        ws["A4"].font = Font(bold=True)
        ws["A4"].border = border_bottom

        ws.append([""])  # spacer after header

        row_num = 6
        tasks = sorted(prog.tasks, key=lambda t: t.order)
        for task in tasks:
            # Task block: Name line
            task_name_line = f"Task Name                           {task.title}"
            ws.append([task_name_line])
            tc = ws.cell(row=row_num, column=1)
            tc.font = Font(bold=True)
            tc.alignment = Alignment(wrap_text=True)
            row_num += 1

            # Description line
            desc_text = (task.description or "").strip()
            proof_note = "\n(Relevant task supporting documents to be presented during Mentoring Review at FMTI/office)" if task.requires_proof else ""
            full_desc = f"Task Description                 {desc_text}{proof_note}"
            ws.append([full_desc])
            dc = ws.cell(row=row_num, column=1)
            dc.alignment = Alignment(wrap_text=True, vertical="top")
            dc.font = Font(size=10)
            # Approximate row height based on line count
            line_count = max(1, full_desc.count("\n") + 1)
            ws.row_dimensions[row_num].height = max(15, line_count * 14)
            row_num += 1

            # Initials line
            ws.append([f"{approver_role}'s Initials:                                             Date :"])
            init_cell = ws.cell(row=row_num, column=1)
            init_cell.font = Font(bold=True, size=10)
            init_cell.border = border_bottom
            row_num += 1

            ws.append([""])  # spacer between tasks
            row_num += 1

        # Row height for title
        ws.row_dimensions[1].height = 22
        ws.row_dimensions[2].height = 18

    if not wb.sheetnames:
        # Fallback empty sheet
        wb.create_sheet("No Programs")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=orientation-programs.xlsx"},
    )



class OrientationTaskRequest(BaseModel):
    title: str
    description: str | None = None
    requiresProof: bool = False


@app.post("/api/admin/orientation/programs/{program_id}/tasks")
def admin_add_orientation_task(program_id: str, req: OrientationTaskRequest,
                               admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    task = models.OrientationTask(
        program_id=program_id, title=title, description=(req.description or "").strip() or None,
        order=_next_orientation_task_order(program),
        requires_proof=bool(req.requiresProof),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return orientation_task_detail(task)


@app.put("/api/admin/orientation/programs/{program_id}/tasks/{task_id}")
def admin_update_orientation_task(program_id: str, task_id: str, req: OrientationTaskRequest,
                                  admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    task = db.get(models.OrientationTask, task_id)
    if not task or task.program_id != program_id:
        raise HTTPException(404, "Task not found")
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    task.title = title
    task.description = (req.description or "").strip() or None
    task.requires_proof = bool(req.requiresProof)
    db.commit()
    return orientation_task_detail(task)


@app.delete("/api/admin/orientation/programs/{program_id}/tasks/{task_id}")
def admin_delete_orientation_task(program_id: str, task_id: str,
                                  admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    task = db.get(models.OrientationTask, task_id)
    if not task or task.program_id != program_id:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.flush()
    program = db.get(models.OrientationProgram, program_id)
    if program:
        remaining = sorted(program.tasks, key=lambda t: t.order)
        for i, r in enumerate(remaining):
            r.order = i
    db.commit()
    return {"ok": True}


class OrientationReorderRequest(BaseModel):
    order: list[str]


@app.put("/api/admin/orientation/programs/{program_id}/reorder")
def admin_reorder_orientation_tasks(program_id: str, req: OrientationReorderRequest,
                                    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    program = db.get(models.OrientationProgram, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    if set(req.order) != {t.id for t in program.tasks}:
        raise HTTPException(400, "Order must include exactly the program's current tasks")
    by_id = {t.id: t for t in program.tasks}
    for i, tid in enumerate(req.order):
        by_id[tid].order = i
    db.commit()
    return {"ok": True}


# ---------------- Candidates (existing crew) + enrollments ----------------

def orientation_candidate_view(db, u, program_id=None):
    q = db.query(models.OrientationEnrollment).filter_by(learner_id=u.id)
    if program_id:
        q = q.filter_by(program_id=program_id)
    enrollment = q.order_by(models.OrientationEnrollment.created_at.desc()).first()
    return {
        "id": u.id, "name": u.full_name, "rank": u.rank, "vessel": u.current_vessel,
        "empStatus": u.emp_status, "nationality": u.nationality,
        "department": orientation_ranks.department_for_rank(u.rank),
        "enrollment": ({
            "id": enrollment.id, "programId": enrollment.program_id,
            "programTitle": enrollment.program.title if enrollment.program else None,
            "status": enrollment.status,
            "vesselName": enrollment.vessel_name,
            "masterName": enrollment.master_name,
        } if enrollment else None),
    }


@app.get("/api/admin/orientation/vessels")
def admin_list_orientation_vessels(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Returns distinct vessels from crew data along with everyone currently
    on sail on that vessel with rank MASTER (deck) or CHIEF ENGINEER
    (engine). Crew data is refreshed by the daily Crew List scrape
    (crewlist_sync.py — run as an external cronjob; upserts into the same
    User rows via the shared upsert_crew_record from smartpal_sync.py), so
    a vessel can briefly carry two people at the same top rank — e.g.
    during a handover, both the outgoing and incoming Master show SAIL
    until the next day's sync catches up. We surface every match as
    a list (masters/chiefEngineers) rather than silently picking one, so
    the frontend can fall back to an admin-facing select when there's more
    than one candidate. `master`/`chiefEngineer` are kept as a single
    name for backward compatibility — populated only when exactly one
    candidate exists, null otherwise (including the ambiguous case).

    When a vessel is ambiguous, each candidate carries the real
    `signOnDate`/`reliefDate` synced from SmartPAL (confirmed present on
    both the QueryActivity and Crewlist reports — see crewlist_sync.py)
    plus a `defaultPick` flag: the candidate with the EARLIEST relief date
    is flagged `signingOffSoon` (their relief is the reason the vessel is
    ambiguous in the first place — a live handover), and `defaultPick` is
    set on the other candidate, so a picker can pre-select "whoever is
    staying" while still listing both. If relief dates are missing or
    tied, no default is guessed — the frontend falls back to requiring an
    explicit choice."""
    from .orientation_ranks import _norm
    learners = db.query(models.User).filter(
        models.User.role == "learner",
        models.User.is_active == True,
        models.User.current_vessel != None,
        models.User.emp_status == "SAIL",
    ).all()
    vessels: dict[str, dict] = {}
    for u in learners:
        v = (u.current_vessel or "").strip()
        if not v:
            continue
        if v not in vessels:
            vessels[v] = {"vessel": v, "masters": [], "chiefEngineers": [], "crewCount": 0}
        vessels[v]["crewCount"] += 1
        r = _norm(u.rank)
        candidate = {
            "id": u.id, "name": u.full_name,
            "signOnDate": u.sign_on_date.isoformat() if u.sign_on_date else None,
            "reliefDate": u.relief_date.isoformat() if u.relief_date else None,
        }
        if r == "MASTER":
            vessels[v]["masters"].append(candidate)
        elif r == "CHIEF ENGINEER":
            vessels[v]["chiefEngineers"].append(candidate)

    def annotate(candidates: list) -> list:
        if len(candidates) < 2:
            return candidates
        dated = [c for c in candidates if c["reliefDate"]]
        if len(dated) < 2 or len({c["reliefDate"] for c in dated}) < 2:
            return candidates  # missing/tied relief dates — no guess to make
        soonest = min(dated, key=lambda c: c["reliefDate"])
        soonest["signingOffSoon"] = True
        # default pick = whoever's relief is furthest out (most likely staying)
        latest = max(dated, key=lambda c: c["reliefDate"])
        latest["defaultPick"] = True
        return candidates

    result = []
    for v in sorted(vessels.values(), key=lambda x: x["vessel"]):
        v["masters"] = annotate(v["masters"])
        v["chiefEngineers"] = annotate(v["chiefEngineers"])
        v["master"] = v["masters"][0]["name"] if len(v["masters"]) == 1 else None
        v["chiefEngineer"] = v["chiefEngineers"][0]["name"] if len(v["chiefEngineers"]) == 1 else None
        result.append(v)
    return result


CANDIDATES_CAP = 2000  # generous safety bound, not a real-world limit — see docstring below


@app.get("/api/admin/orientation/candidates")
def admin_list_orientation_candidates(
    q: str = "",
    program_id: str | None = None,
    rank: str | None = None,
    vessel: str | None = None,
    on_sail: bool = False,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Existing crew eligible for Orientation Program — excludes office
    staff and any rank outside the deck/engine hierarchy (orientation_ranks.py).
    Supports filtering by ?rank=, ?vessel= and ?on_sail=true. Results are
    capped at CANDIDATES_CAP — on_sail (and every other filter) is applied
    BEFORE that cap so callers that only want onboard crew don't get an
    under-filled page just because non-matching rows ate the first N
    alphabetically. The cap used to be 50, which silently hid real crew
    once the eligible-officer count for a fleet this size (793 total crew)
    passed it — raised well above any realistic fleet size instead of
    removed outright, so a single malformed query can't return everything
    unbounded."""
    users = db.query(models.User).filter_by(role="learner", is_active=True).all()
    eligible = [u for u in users if orientation_ranks.is_eligible_crew(u.rank)]
    if q:
        query = normalize_name(q)
        eligible = [u for u in eligible if query in normalize_name(u.full_name)]
    if rank:
        rank_upper = rank.strip().upper()
        eligible = [u for u in eligible if (u.rank or "").strip().upper() == rank_upper]
    if vessel:
        vessel_upper = vessel.strip().upper()
        eligible = [u for u in eligible if (u.current_vessel or "").strip().upper() == vessel_upper]
    if on_sail:
        eligible = [u for u in eligible if (u.emp_status or "").strip().upper() == "SAIL"]
    eligible.sort(key=lambda u: u.full_name)
    return [orientation_candidate_view(db, u, program_id) for u in eligible[:CANDIDATES_CAP]]


@app.get("/api/admin/orientation/enrollments")
def admin_list_orientation_enrollments(
    program_id: str | None = None,
    status: str | None = None,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all orientation enrollments (enrolled crew only) with progress details."""
    q = db.query(models.OrientationEnrollment)
    if program_id:
        q = q.filter_by(program_id=program_id)
    if status:
        q = q.filter_by(status=status)
    enrollments = q.order_by(models.OrientationEnrollment.created_at.desc()).all()
    result = []
    for e in enrollments:
        learner = db.get(models.User, e.learner_id)
        total = len(e.completions)
        done = sum(1 for c in e.completions if c.is_completed)
        pct = round(done / total * 100) if total else 0
        result.append({
            "id": e.id,
            "learnerId": e.learner_id,
            "learnerName": learner.full_name if learner else None,
            "rank": learner.rank if learner else None,
            "vessel": e.vessel_name or (learner.current_vessel if learner else None),
            "empStatus": learner.emp_status if learner else None,
            "department": orientation_ranks.department_for_rank(learner.rank) if learner else None,
            "programId": e.program_id,
            "programTitle": e.program.title if e.program else None,
            "status": e.status,
            "vesselName": e.vessel_name,
            "masterName": e.master_name,
            "completedCount": done,
            "totalCount": total,
            "progressPct": pct,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
        })
    return result


class OrientationEnrollRequest(BaseModel):
    learnerId: str
    programId: str
    vesselName: str | None = None   # defaults to learner's current_vessel if omitted
    masterName: str | None = None   # Master/CE name snapshotted at enrollment time


@app.post("/api/admin/orientation/enrollments")
def admin_create_orientation_enrollment(req: OrientationEnrollRequest,
                                        admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    learner = db.get(models.User, req.learnerId)
    if not learner or learner.role != "learner":
        raise HTTPException(404, "Crew member not found")
    if not orientation_ranks.is_eligible_crew(learner.rank):
        raise HTTPException(400, "This crew member's rank is not eligible for Orientation Program")
    program = db.get(models.OrientationProgram, req.programId)
    if not program:
        raise HTTPException(404, "Program not found")
    existing = db.query(models.OrientationEnrollment).filter_by(
        learner_id=learner.id, program_id=program.id).first()
    if existing and existing.status in ("in_progress", "submitted"):
        raise HTTPException(400, "This crew member is already enrolled in this program")
    # Default vessel to the crew's current SmartPAL vessel if not explicitly supplied
    vessel_name = (req.vesselName or "").strip() or learner.current_vessel
    enrollment = models.OrientationEnrollment(
        program_id=program.id, learner_id=learner.id, assigned_by=admin.id, status="in_progress",
        vessel_name=vessel_name,
        master_name=(req.masterName or "").strip() or None,
    )
    db.add(enrollment)
    db.flush()
    for task in program.tasks:
        db.add(models.OrientationTaskCompletion(enrollment_id=enrollment.id, task_id=task.id))
    db.commit()
    return {"ok": True, "enrollmentId": enrollment.id}


@app.delete("/api/admin/orientation/enrollments/{enrollment_id}")
def admin_delete_orientation_enrollment(enrollment_id: str,
                                        admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    enrollment = db.get(models.OrientationEnrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    db.delete(enrollment)
    db.commit()
    return {"ok": True}


# ---------------- Results / monitoring ----------------

def orientation_enrollment_result(db, e):
    learner = db.get(models.User, e.learner_id)
    tasks = e.program.tasks if e.program else []
    total = len(tasks)
    completions_map = {c.task_id: c for c in e.completions}
    done = sum(1 for t in tasks if completions_map.get(t.id) and completions_map[t.id].is_completed)
    pct = round(done / total * 100) if total else 0

    # submittedAt: when the first task was submitted for review
    submitted_completions = [c for c in e.completions if c.status in ("pending_review", "approved", "rejected") and c.completed_at]
    submitted_at = min((c.completed_at for c in submitted_completions), default=None)

    # decidedAt: when the enrollment was finally approved/rejected — use the latest verified_at from approved tasks
    decided_at = None
    if e.status in ("approved", "rejected"):
        verified_times = [c.verified_at for c in e.completions if c.verified_at]
        decided_at = max(verified_times, default=None)

    # Legacy OrientationSubmission fallback for older enrollments
    submission = (db.query(models.OrientationSubmission)
                  .filter_by(enrollment_id=e.id)
                  .order_by(models.OrientationSubmission.submitted_at.desc()).first())
    if submission:
        if not submitted_at and submission.submitted_at:
            submitted_at = submission.submitted_at
        if not decided_at and submission.decided_at:
            decided_at = submission.decided_at

    decided_by_user = db.get(models.User, submission.decided_by) if submission and submission.decided_by else None
    department = e.program.department if e.program else None
    master_label = "Chief Engineer" if department == "engine" else "Master"
    return {
        "enrollmentId": e.id,
        "learnerName": learner.full_name if learner else None,
        "rank": learner.rank if learner else None,
        "vessel": (e.vessel_name or (learner.current_vessel if learner else None)),
        "programId": e.program_id,
        "programTitle": e.program.title if e.program else None,
        "status": e.status,
        "completedCount": done, "totalCount": total, "progressPct": pct,
        "submittedAt": submitted_at.isoformat() if submitted_at else None,
        "decidedAt": decided_at.isoformat() if decided_at else None,
        "masterLabel": master_label,
        "masterName": e.master_name,
        "approvedByName": decided_by_user.full_name if decided_by_user else None,
    }


@app.get("/api/admin/orientation/results")
def admin_orientation_results(program_id: str | None = None,
                              admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(models.OrientationEnrollment)
    if program_id:
        q = q.filter_by(program_id=program_id)
    enrollments = q.order_by(models.OrientationEnrollment.created_at.desc()).all()
    return [orientation_enrollment_result(db, e) for e in enrollments]


@app.get("/api/admin/orientation/results.xlsx")
def admin_orientation_results_xlsx(program_id: str | None = None,
                                   admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    rows = admin_orientation_results(program_id=program_id, admin=admin, db=db)

    wb = Workbook()
    ws = wb.active
    ws.title = "Orientation Results"

    columns = [
        ("Crew Name", 26), ("Rank", 18), ("Vessel", 22), ("Program", 30),
        ("Status", 14), ("Completed", 11), ("Total", 9), ("Progress %", 12),
        ("Master / CE", 22), ("Approved By", 22), ("Submitted", 18), ("Decided", 18),
    ]
    headers = [c[0] for c in columns]
    ws.append(headers)

    # ---- header styling: navy fill, white bold text, thin borders ----
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    thin = Side(style="thin", color="D9D9D9")
    for col_idx, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(bottom=thin)
    ws.row_dimensions[1].height = 22

    status_fill = {
        "approved": PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid"),
        "submitted": PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid"),
        "rejected": PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
        "in_progress": PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
    }
    status_label = {
        "approved": "Approved", "submitted": "Awaiting review",
        "rejected": "Rejected", "in_progress": "In progress",
    }
    band_fill = PatternFill(start_color="F7F9FC", end_color="F7F9FC", fill_type="solid")

    for i, r in enumerate(rows):
        row_idx = i + 2
        ws.append([
            r["learnerName"], r["rank"], r["vessel"], r["programTitle"],
            status_label.get(r["status"], r["status"]), r["completedCount"], r["totalCount"],
            r["progressPct"] / 100,
            f'{r["masterLabel"]}: {r["masterName"]}' if r["masterName"] else "—",
            r["approvedByName"] or "—",
            r["submittedAt"][:10] if r["submittedAt"] else "",
            r["decidedAt"][:10] if r["decidedAt"] else "",
        ])
        if i % 2 == 1:
            for col_idx in range(1, len(headers) + 1):
                ws.cell(row=row_idx, column=col_idx).fill = band_fill
        status_cell = ws.cell(row=row_idx, column=5)
        fill = status_fill.get(r["status"])
        if fill:
            status_cell.fill = fill
        status_cell.alignment = Alignment(horizontal="center")
        ws.cell(row=row_idx, column=8).number_format = "0%"
        for col_idx in (6, 7, 8):
            ws.cell(row=row_idx, column=col_idx).alignment = Alignment(horizontal="center")

    for i, (_, w) in enumerate(columns, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    last_row = max(len(rows) + 1, 2)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{last_row}"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=orientation-results.xlsx"},
    )


# ---------------- Candidate-facing (existing crew login) ----------------

def orientation_enrollment_detail(e):
    completions = {c.task_id: c for c in e.completions}
    tasks = sorted(e.program.tasks, key=lambda t: t.order) if e.program else []
    total = len(tasks)
    done = sum(1 for t in tasks if completions.get(t.id) and completions[t.id].is_completed)
    department = e.program.department if e.program else None
    return {
        "id": e.id, "programId": e.program_id,
        "programTitle": e.program.title if e.program else None,
        "programSubtitle": e.program.subtitle if e.program else None,
        "status": e.status,
        "vessel": e.vessel_name,
        "masterName": e.master_name,
        "masterLabel": "Chief Engineer" if department == "engine" else "Master",
        "progressPct": round(done / total * 100) if total else 0,
        "completedCount": done, "totalCount": total,
        "tasks": [{
            "id": t.id, "title": t.title, "description": t.description, "order": t.order,
            "requiresProof": bool(t.requires_proof),
            "isCompleted": bool(completions.get(t.id) and (completions[t.id].is_completed or completions[t.id].status in ("approved", "pending_review"))),
            "note": completions[t.id].note if completions.get(t.id) else None,
            "proofUrls": (completions[t.id].proof_paths or []) if completions.get(t.id) else [],
            "completedAt": (completions[t.id].completed_at.isoformat()
                           if completions.get(t.id) and completions[t.id].completed_at else None),
            "status": completions[t.id].status if completions.get(t.id) else "draft",
            "rejectionNote": getattr(completions[t.id], "rejection_note", None) if completions.get(t.id) else None,
        } for t in tasks],
    }


@app.get("/api/orientation/my-enrollment")
def get_my_orientation_enrollment(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    enrollment = (db.query(models.OrientationEnrollment)
                  .filter(models.OrientationEnrollment.learner_id == user.id,
                         models.OrientationEnrollment.status.in_(["in_progress", "submitted", "rejected", "approved"]))
                  .order_by(models.OrientationEnrollment.created_at.desc()).first())
    if not enrollment:
        return None
    return orientation_enrollment_detail(enrollment)


@app.post("/api/orientation/tasks/{task_id}/complete")
async def complete_orientation_task(task_id: str, completed: bool = Form(...),
                                    note: str | None = Form(None),
                                    files: list[UploadFile] = File(default=[]),
                                    user: models.User = Depends(get_current_user),
                                    db: Session = Depends(get_db)):
    task = db.get(models.OrientationTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    enrollment = (db.query(models.OrientationEnrollment)
                  .filter_by(learner_id=user.id, program_id=task.program_id).first())
    if not enrollment or enrollment.status not in ("in_progress", "rejected"):
        raise HTTPException(403, "You are not actively enrolled in this program")
    completion = db.query(models.OrientationTaskCompletion).filter_by(
        enrollment_id=enrollment.id, task_id=task_id).first()
    if not completion:
        completion = models.OrientationTaskCompletion(enrollment_id=enrollment.id, task_id=task_id, proof_paths=[])
        db.add(completion)
        db.flush()
    completion.is_completed = completed
    completion.completed_at = datetime.now(timezone.utc) if completed else None
    if note is not None:
        completion.note = note
    new_urls = []
    for file in files:
        if not file or not file.filename:
            continue
        ext = os.path.splitext(file.filename)[1] or ".bin"
        filename = f"{completion.id}-{uuid.uuid4().hex[:8]}{ext}"
        tmp_path = os.path.join(tempfile.gettempdir(), f"orientation-{filename}")
        with open(tmp_path, "wb") as f:
            f.write(await file.read())
        storage.save("orientation_proofs", filename, tmp_path)
        new_urls.append(f"/api/uploads/orientation_proofs/{filename}")
    if new_urls:
        completion.proof_paths = [*(completion.proof_paths or []), *new_urls]
    db.commit()
    return {"ok": True, "isCompleted": completion.is_completed, "proofUrls": completion.proof_paths or []}


class SubmitMultipleTasksRequest(BaseModel):
    task_ids: list[str]

@app.post("/api/orientation/tasks/submit-multiple")
def submit_multiple_orientation_tasks(req: SubmitMultipleTasksRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    print("Hit submit_multiple_orientation_tasks with task_ids:", req.task_ids)
    if not req.task_ids:
        return {"ok": True, "count": 0}
        
    tasks = db.query(models.OrientationTask).filter(models.OrientationTask.id.in_(req.task_ids)).all()
    if not tasks:
        raise HTTPException(404, "Tasks not found")
        
    # Assume all tasks belong to the same program for simplicity
    program_id = tasks[0].program_id
    enrollment = (db.query(models.OrientationEnrollment)
                  .filter_by(learner_id=user.id, program_id=program_id).first())
    if not enrollment or enrollment.status not in ("in_progress", "rejected", "submitted"):
        raise HTTPException(403, "Not actively enrolled")
        
    completions = db.query(models.OrientationTaskCompletion).filter(
        models.OrientationTaskCompletion.enrollment_id == enrollment.id,
        models.OrientationTaskCompletion.task_id.in_(req.task_ids)
    ).all()
    
    completion_map = {c.task_id: c for c in completions}
    
    count = 0
    for task in tasks:
        completion = completion_map.get(task.id)
        if not completion or not completion.is_completed:
            continue # Or raise error
        if task.requires_proof and not completion.proof_paths:
            continue
            
        completion.status = "pending_review"
        completion.rejection_note = None
        count += 1
        
    if count > 0:
        department = enrollment.program.department
        program_title = enrollment.program.title if enrollment.program else "Orientation Program"
        task_word = "tasks" if count > 1 else "task"
        
        for appr in find_vessel_approvers(db, user.current_vessel, department):
            notify(db, appr.id, "orientation_submitted", f"{count} {task_word} submitted for review",
                   body=f"{user.full_name} submitted {count} {task_word} in {program_title} for your review.",
                   link="/approvals")
        db.commit()
        
    return {"ok": True, "count": count}

@app.post("/api/orientation/tasks/{task_id}/submit")
def submit_orientation_task(task_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(models.OrientationTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    enrollment = (db.query(models.OrientationEnrollment)
                  .filter_by(learner_id=user.id, program_id=task.program_id).first())
    if not enrollment or enrollment.status not in ("in_progress", "rejected", "submitted"):
        raise HTTPException(403, "Not actively enrolled")
    
    completion = db.query(models.OrientationTaskCompletion).filter_by(
        enrollment_id=enrollment.id, task_id=task_id).first()
    
    if not completion or not completion.is_completed:
        raise HTTPException(400, "Task must be marked completed first")
    if task.requires_proof and not completion.proof_paths:
        raise HTTPException(400, "Attach a document/photo before submitting")
    
    completion.status = "pending_review"
    completion.rejection_note = None
    
    department = enrollment.program.department
    program_title = enrollment.program.title if enrollment.program else "Orientation Program"
    
    for appr in find_vessel_approvers(db, user.current_vessel, department):
        notify(db, appr.id, "orientation_submitted", "Task submitted for review",
               body=f"{user.full_name} submitted a task in {program_title} for your review.",
               link="/approvals")
    db.commit()
    return {"ok": True, "status": completion.status}

@app.delete("/api/orientation/tasks/{task_id}/attachments")
def delete_orientation_task_attachment(task_id: str, url: str,
                                       user: models.User = Depends(get_current_user),
                                       db: Session = Depends(get_db)):
    """Remove one attachment (by its URL) from a task's proof list. Only the
    reference is dropped — the underlying blob/file is left in place."""
    task = db.get(models.OrientationTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    enrollment = (db.query(models.OrientationEnrollment)
                  .filter_by(learner_id=user.id, program_id=task.program_id).first())
    if not enrollment or enrollment.status not in ("in_progress", "rejected"):
        raise HTTPException(403, "You are not actively enrolled in this program")
    completion = db.query(models.OrientationTaskCompletion).filter_by(
        enrollment_id=enrollment.id, task_id=task_id).first()
    if not completion:
        raise HTTPException(404, "Nothing recorded for this task yet")
    completion.proof_paths = [u for u in (completion.proof_paths or []) if u != url]
    db.commit()
    return {"ok": True, "proofUrls": completion.proof_paths or []}


def find_vessel_approvers(db, vessel: str, department: str):
    """Learner rows who currently qualify as the vessel's approver for this
    department (see orientation_ranks.vessel_approver_info) — usually the one
    onboard Master/Chief Engineer, but returns every match in case of a data
    hiccup (two people flagged SAIL at once, etc.)."""
    if not vessel:
        return []
    candidates = db.query(models.User).filter_by(
        role="learner", is_active=True, current_vessel=vessel).all()
    return [u for u in candidates
            if (info := orientation_ranks.vessel_approver_info(u)) and info["department"] == department]


# ---------------- Approver-facing (vessel Master / Chief Engineer) ----------------


def orientation_submission_detail(db, enrollment):
    learner = db.get(models.User, enrollment.learner_id) if enrollment else None
    tasks = sorted(enrollment.program.tasks, key=lambda t: t.order) if enrollment and enrollment.program else []
    completions_map = {c.task_id: c for c in enrollment.completions} if enrollment else {}
    
    tasks_out = []
    for t in tasks:
        c = completions_map.get(t.id)
        tasks_out.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "requiresProof": t.requires_proof,
            "isCompleted": c.is_completed if c else False,
            "proofUrls": c.proof_paths if c else [],
            "note": c.note if c else None,
            "completedAt": c.completed_at.isoformat() if c and c.completed_at else None,
            "status": c.status if c else "draft",
            "rejectionNote": c.rejection_note if c else None,
            # Backwards compatibility
            "verified": (c.status == "approved") if c else False,
            "verifiedAt": c.verified_at.isoformat() if c and c.verified_at else None,
        })
        
    has_pending_tasks = any(c.status == "pending_review" for c in enrollment.completions)
    approved_tasks = sum(1 for c in enrollment.completions if c.status == "approved")
    total_tasks = len(enrollment.program.tasks) if enrollment.program else 0
    
    if enrollment.status in ("approved", "rejected"):
        computed_status = enrollment.status
    elif has_pending_tasks or (total_tasks > 0 and approved_tasks == total_tasks):
        computed_status = "pending"
    else:
        computed_status = "waiting_on_crew"
    
    return {
        "id": enrollment.id,
        "enrollmentId": enrollment.id,
        "vesselName": enrollment.vessel_name,
        "vessel": enrollment.vessel_name,
        "department": enrollment.program.department if enrollment.program else "",
        "submittedAt": enrollment.created_at.isoformat(),
        "status": computed_status,
        "decidedAt": enrollment.created_at.isoformat() if computed_status != "pending" else None,
        "candidateName": learner.full_name if learner else "Unknown",
        "candidateRank": learner.rank if learner else "Unknown",
        "candidateCrewId": learner.crew_id if learner else "",
        "programTitle": enrollment.program.title if enrollment and enrollment.program else "Program",
        "learner": {
            "name": learner.full_name if learner else "Unknown",
            "rank": learner.rank if learner else "Unknown",
            "crewId": learner.crew_id if learner else "",
        },
        "program": {
            "title": enrollment.program.title if enrollment and enrollment.program else "Program",
            "subtitle": enrollment.program.subtitle if enrollment and enrollment.program else "",
        },
        "tasks": tasks_out,
        "verifiedCount": approved_tasks,
        "allVerified": total_tasks > 0 and approved_tasks == total_tasks,
    }



@app.get("/api/approver/submissions")
def approver_list_submissions(approver: models.User = Depends(require_vessel_approver), db: Session = Depends(get_db)):
    info = orientation_ranks.vessel_approver_info(approver)
    
    enrollments = (db.query(models.OrientationEnrollment)
                  .join(models.OrientationProgram)
                  .filter(
                      models.OrientationEnrollment.vessel_name == info["vessel"],
                      models.OrientationProgram.department == info["department"],
                  ).all())

    return [orientation_submission_detail(db, e) for e in enrollments]



class OrientationVerifyTaskRequest(BaseModel):
    action: str  # 'approve' | 'reject'
    note: str | None = None

@app.post("/api/approver/submissions/{submission_id}/tasks/{task_id}/verify")
def approver_verify_task(submission_id: str, task_id: str, req: OrientationVerifyTaskRequest,
                         approver: models.User = Depends(require_vessel_approver), db: Session = Depends(get_db)):
    info = orientation_ranks.vessel_approver_info(approver)
    enrollment = db.get(models.OrientationEnrollment, submission_id)
    if not enrollment or enrollment.vessel_name != info["vessel"] or enrollment.program.department != info["department"]:
        raise HTTPException(404, "Enrollment not found")
        
    completion = (db.query(models.OrientationTaskCompletion)
                  .filter_by(enrollment_id=enrollment.id, task_id=task_id).first())
    if not completion:
        raise HTTPException(404, "Task not found")
        
    if req.action == 'approve':
        completion.status = "approved"
        completion.verified = True
        completion.verified_at = datetime.now(timezone.utc)
        completion.verified_by = approver.id
    elif req.action == 'reject':
        if not req.note:
            raise HTTPException(400, "Rejection note is required")
        completion.status = "rejected"
        completion.rejection_note = req.note
        completion.verified = False
        completion.verified_at = None
        completion.verified_by = None
    else:
        raise HTTPException(400, "Invalid action")
        
    # Notify learner
    learner = db.get(models.User, enrollment.learner_id)
    task = db.get(models.OrientationTask, task_id)
    if learner and task:
        if req.action == 'approve':
            notify(db, learner.id, "orientation_task_approved", "Task approved",
                   body=f"Your task '{task.title}' was approved by {approver.full_name}.",
                   link="/orientation")
        else:
            notify(db, learner.id, "orientation_task_rejected", "Task rejected",
                   body=f"Your task '{task.title}' was rejected by {approver.full_name}. Note: {req.note}",
                   link="/orientation")
                   
    db.commit()
    return orientation_submission_detail(db, enrollment)

class OrientationDecideRequest(BaseModel):
    action: str

@app.post("/api/approver/submissions/{submission_id}/decide")
def approver_decide_submission(submission_id: str, req: OrientationDecideRequest,
                               approver: models.User = Depends(require_vessel_approver),
                               db: Session = Depends(get_db)):
    info = orientation_ranks.vessel_approver_info(approver)
    enrollment = db.get(models.OrientationEnrollment, submission_id)
    if not enrollment or enrollment.vessel_name != info["vessel"] or enrollment.program.department != info["department"]:
        raise HTTPException(404, "Enrollment not found")

    if req.action == 'approve':
        # Verify all tasks are actually approved
        all_tasks = enrollment.program.tasks
        completions = {c.task_id: c for c in enrollment.completions}
        all_approved = all(completions.get(t.id) and completions[t.id].status == "approved" for t in all_tasks)
        
        if not all_approved:
            raise HTTPException(400, "Cannot approve until all tasks are verified")
            
        enrollment.status = "approved"
        db.commit()
        
        # Notify learner
        if enrollment.learner_id:
            notify(db, enrollment.learner_id, "orientation_approved", "Orientation completed",
                   body=f"All tasks approved! Your {enrollment.program.title} is now complete.",
                   link="/orientation")
                   
        # Notify all admins
        admins = db.query(models.User).filter(
            models.User.role.in_(["super_admin", "office_admin", "admin"]),
            models.User.is_active == True
        ).all()
        for admin in admins:
            learner = db.get(models.User, enrollment.learner_id)
            learner_name = learner.full_name if learner else "A crew member"
            notify(db, admin.id, "orientation_master_approved", "Orientation fully approved by Master",
                   body=f"{approver.full_name} has fully approved the {enrollment.program.title} orientation for {learner_name} on {info['vessel']}.",
                   link="/admin/orientation/results")
                   
        db.commit()
                   
    elif req.action == 'reject':
        enrollment.status = "rejected"
        db.commit()
        
        if enrollment.learner_id:
            notify(db, enrollment.learner_id, "orientation_rejected", "Orientation rejected",
                   body=f"Your {enrollment.program.title} was rejected by {approver.full_name}.",
                   link="/orientation")
    else:
        raise HTTPException(400, "Invalid action")
        
    db.commit()
    return orientation_submission_detail(db, enrollment)

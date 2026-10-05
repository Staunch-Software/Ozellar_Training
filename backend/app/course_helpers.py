"""Course and certificate helper utilities."""
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt
from fastapi import HTTPException
from app.config import UPLOAD_DIR, PUBLIC_BASE_URL
from app import models
from app.auth import SECRET_KEY, ALGORITHM
from app.notifications_service import notify


def get_progress(db, learner_id, course_id):
    return (db.query(models.Progress)
            .filter_by(learner_id=learner_id, course_id=course_id).first())


def enrolled_course_ids(db, user_id):
    return [e.course_id for e in
            db.query(models.Enrollment).filter_by(learner_id=user_id).all()]


def require_enrollment(db, user, course_id):
    """Admins may access any course (preview); office staff too (preview mode); learners must be assigned it."""
    if user.role in ("admin", "super_admin"):
        return
    if (user.rank or "").strip().upper() == "OFFICE STAFF":
        return  # office staff can preview all courses without enrollment
    is_enrolled = db.query(models.Enrollment).filter_by(
        learner_id=user.id, course_id=course_id).first()
    if not is_enrolled:
        raise HTTPException(403, "You are not assigned to this course")


def _next_chapter_order(course) -> int:
    return (max((ch.order for ch in course.chapters), default=-1)) + 1


def _next_chapter_n(course) -> int:
    return (max((ch.n or 0 for ch in course.chapters), default=0)) + 1


def _course_code(slug: str) -> str:
    """Abbreviate a course slug for certificate IDs."""
    words = slug.split("-")
    if len(words) < 2:
        return slug.upper()
    return "".join(w[0] for w in words if w).upper()


def cert_dict(cert, user, course):
    return {
        "id": cert.id, "learner": user.full_name, "rank": user.rank, "ppNo": user.pp_no,
        "course": course.title, "score": cert.score,
        "issued": cert.issued_at.strftime("%d %B %Y") if cert.issued_at else None,
    }


def issue_certificate(db, user, course):
    lid = user.id
    existing = (db.query(models.Certificate)
                .filter_by(learner_id=lid, course_id=course.id).first())
    if existing:
        return cert_dict(existing, user, course)
    year = datetime.now(timezone.utc).year
    
    seq_record = models.CertificateSequence()
    db.add(seq_record)
    db.flush()
    
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


def cert_pdf_data(cert, user, course):
    c = course.cert or {}
    topics = c.get("topics")
    if not topics:
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


def _maybe_auto_complete_course(db, course, progress, learner_id):
    """Courses with no final assessment pass automatically once every chapter is done."""
    if course.questions or progress.passed:
        return False
    all_chapter_ids = {ch.id for ch in course.chapters}
    done = set(progress.completed_chapters or [])
    if not all_chapter_ids or not (done >= all_chapter_ids):
        return False
    progress.passed = True
    db.flush()

    ap = models.AssessmentApproval(
        learner_id=learner_id, course_id=course.id,
        score=None, attempt_id=None,
    )
    db.add(ap)
    db.flush()
    token_payload = {
        "sub": f"approve:{ap.id}",
        "type": "approval",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    ap.approval_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)

    notify(
        db, learner_id, "passed", "Course completed",
        f"You have completed all lessons in {course.title}. Your certificate is pending admin approval.",
        "/my-courses",
    )
    return True

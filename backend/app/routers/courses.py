"""Learner course viewing, chapter completion, and profile photo router."""
import io
import os
from datetime import datetime, timezone, timedelta
import jwt
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app import models
from app.auth import get_current_user, user_public, SECRET_KEY, ALGORITHM
from app.notifications_service import notify
from app.course_helpers import (
    get_progress, enrolled_course_ids, require_enrollment, _maybe_auto_complete_course
)

router = APIRouter(tags=["Courses"])


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
            "quizQuestions": [{
                "q": qq.prompt, "options": qq.options, "answer": qq.answer, "explain": qq.explain,
            } for qq in ch.quiz_questions] if ch.kind == "quiz" else [],
        } for ch in course.chapters]
        data["cert"] = course.cert
        data["assessment"] = {
            "passMark": course.pass_mark,
            "maxAttempts": course.max_attempts,
            "attemptsUsed": attempts_used,
            "questions": [{
                "q": q.prompt, "options": q.options,
            } for q in course.questions],
        }
        
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



@router.get("/api/learner")
def learner(user: models.User = Depends(get_current_user)):
    return user_public(user)


@router.get("/api/courses")
def list_courses(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    lid = user.id
    q = db.query(models.Course).order_by(models.Course.order)
    if user.role not in ("admin", "super_admin"):
        if (user.rank or "").strip().upper() == "OFFICE STAFF":
            pass
        else:
            assigned = enrolled_course_ids(db, user.id)
            if not assigned:
                return []
            q = q.filter(models.Course.id.in_(assigned))
    return [serialize_course(db, c, get_progress(db, lid, c.id)) for c in q.all()]


@router.get("/api/courses/{slug}")
def get_course(slug: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(models.Course).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Course not found")
    require_enrollment(db, user, c.id)
    return serialize_course(db, c, get_progress(db, user.id, c.id), detail=True)


@router.post("/api/courses/{course_id}/chapters/{chapter_id}/complete")
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


@router.get("/api/crew/photo")
def get_crew_photo(user: models.User = Depends(get_current_user)):
    if user.role != "learner":
        raise HTTPException(403, "Only crew members have photos")
    photo_path = os.path.join(UPLOAD_DIR, "photos", f"{user.id}.jpg")
    if not os.path.exists(photo_path):
        raise HTTPException(404, "No photo on record")
    with open(photo_path, "rb") as fh:
        return Response(fh.read(), media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=300"})


@router.post("/api/crew/photo")
async def upload_crew_photo(file: UploadFile = File(...), user: models.User = Depends(get_current_user)):
    from PIL import Image, ImageOps
    if user.role != "learner":
        raise HTTPException(403, "Only crew members can upload photos")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    content = await file.read()

    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
    except Exception:
        raise HTTPException(400, "Invalid image file")

    image = Image.open(io.BytesIO(content))
    image = ImageOps.exif_transpose(image)

    width, height = image.size
    if width < 200 or height < 200:
        raise HTTPException(400, "Photo is too small — please upload a clearer, higher-resolution photo")

    if width > height:
        raise HTTPException(
            400,
            "Please upload an upright passport-size photo (not landscape/rotated sideways)"
        )

    photos_dir = os.path.join(UPLOAD_DIR, "photos")
    os.makedirs(photos_dir, exist_ok=True)

    file_path = os.path.join(photos_dir, f"{user.id}.jpg")
    image.convert("RGB").save(file_path, format="JPEG", quality=85)

    return {"status": "success"}

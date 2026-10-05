"""Admin course builder router: CRUD, PPTX processing, video uploads, quiz editor."""
import json
import os
import re
import threading as _threading
import time
import uuid
import zipfile as _zipfile
from typing import Optional
import jwt

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form,
    Request, Query, BackgroundTasks, Response
)
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import UPLOAD_DIR
from app.database import get_db, SessionLocal
from app import models, storage
from app.video import compress_video
from app.auth import require_admin, SECRET_KEY, ALGORITHM
from app.security_upload import validate_safe_upload
from app.certificates import build_certificate_pdf
from app.course_helpers import _course_code, _maybe_auto_complete_course
from app.services.pptx_processor import (
    _pptx_job_read, _pptx_job_set, _safe_unlink, process_pptx_background,
    _next_chapter_order, _next_chapter_n, _revoke_course_completion
)

router = APIRouter(tags=["Course Builder"])


def _slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-") or "course"


def _unique_course_slug(db, base: str) -> str:
    slug = base
    i = 2
    while db.query(models.Course).filter_by(slug=slug).first():
        slug = f"{base}-{i}"
        i += 1
    return slug


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


class SaveCertificateRequest(BaseModel):
    titleUpper: str | None = None
    topics: list[str] = []
    certPrefix: str | None = None
    durationHours: int | None = None


# Video upload/processing job tracker
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
        if os.path.exists(raw_path):
            try:
                os.remove(raw_path)
            except OSError:
                pass
    finally:
        db.close()


@router.get("/api/admin/courses")
def admin_list_courses(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    courses = db.query(models.Course).order_by(models.Course.order).all()
    return [admin_course_summary(c) for c in courses]


@router.post("/api/admin/courses")
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
    db.flush()

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


@router.put("/api/admin/courses/{course_id}")
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
    
    valid_users = [str(u) for u in req.targetUsers if isinstance(u, str) and len(str(u)) > 20]
    course.target_users = valid_users
    
    db.commit()
    
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


@router.get("/api/admin/courses/{course_id}")
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


@router.put("/api/admin/courses/{course_id}/certificate")
def admin_save_course_certificate(course_id: str, req: SaveCertificateRequest,
                                  admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    topics = [t.strip() for t in req.topics if t and t.strip()][:8]
    title_upper = (req.titleUpper or "").strip() or None
    cert_prefix = (req.certPrefix or "").strip() or None
    duration_hours = req.durationHours if req.durationHours and req.durationHours > 0 else None
    course.cert = {"titleUpper": title_upper, "topics": topics, "certPrefix": cert_prefix, "durationHours": duration_hours}
    db.commit()
    return course.cert


@router.get("/api/admin/courses/{course_id}/certificate-preview.pdf")
def admin_preview_course_certificate(
    course_id: str, request: Request,
    token: Optional[str] = None,
    titleUpper: Optional[str] = None,
    certPrefix: Optional[str] = None,
    durationHours: Optional[int] = None,
    topics: list[str] = Query([]),
    db: Session = Depends(get_db),
):
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


@router.post("/api/admin/courses/{course_id}/upload-pptx")
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

    await validate_safe_upload(file)

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)

    pptx_filename = f"pending_{int(time.time())}_{file.filename}"
    pptx_path = os.path.join(course_dir, pptx_filename)

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


@router.get("/api/admin/courses/{course_id}/pptx-status")
def pptx_status(course_id: str, admin: models.User = Depends(require_admin)):
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


@router.post("/api/admin/courses/{course_id}/upload-video")
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

    await validate_safe_upload(file)

    course_dir = os.path.join(UPLOAD_DIR, course_id)
    os.makedirs(course_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".mp4"
    filename = f"video_{uuid.uuid4().hex[:8]}{ext}"

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


@router.get("/api/admin/courses/{course_id}/upload-video-status")
def video_upload_status(course_id: str, admin: models.User = Depends(require_admin)):
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


@router.post("/api/admin/courses/{course_id}/quiz-chapters")
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


@router.put("/api/admin/courses/{course_id}/chapters/{chapter_id}/quiz-questions")
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


@router.put("/api/admin/courses/{course_id}/reorder")
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


@router.delete("/api/admin/courses/{course_id}/chapters/{chapter_id}")
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

    course = db.get(models.Course, course_id)
    if course:
        remaining = sorted(course.chapters, key=lambda c: c.order)
        for i, r in enumerate(remaining):
            r.order = i
            r.n = i + 1

        db.flush()
        for p in db.query(models.Progress).filter_by(course_id=course_id).all():
            _maybe_auto_complete_course(db, course, p, p.learner_id)
    db.commit()
    for p in files_to_remove:
        storage.delete(course_id, os.path.basename(p))
    return {"ok": True}


@router.put("/api/admin/courses/{course_id}/assessment")
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

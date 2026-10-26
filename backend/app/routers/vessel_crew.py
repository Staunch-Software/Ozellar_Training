"""Vessel crew overview for the onboard Master / Chief Engineer.

Read-only: lists the crew currently on the approver's vessel with their
assigned-course progress, and lets the approver view their issued certificates.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, orientation_ranks
from app.auth import require_vessel_approver
from app.certificates import build_certificate_pdf
from app.course_helpers import cert_pdf_data

router = APIRouter(tags=["Vessel Crew"])


def _vessel_crew(db: Session, approver: models.User) -> list[models.User]:
    vessel = orientation_ranks.vessel_approver_info(approver)["vessel"]
    return (db.query(models.User)
            .filter(models.User.role == "learner",
                    models.User.id != approver.id,
                    models.User.is_active.is_(True),
                    # only crew currently onboard (SmartPAL "SAIL"), not leave/relieved
                    func.upper(func.trim(models.User.emp_status)) == "SAIL",
                    func.upper(func.trim(models.User.current_vessel)) == vessel.strip().upper())
            .order_by(models.User.full_name)
            .all())


def _crew_member(db: Session, approver: models.User, crew_id: str) -> models.User:
    member = next((u for u in _vessel_crew(db, approver) if u.id == crew_id), None)
    if not member:
        raise HTTPException(404, "Crew member not found on your vessel")
    return member


def _course_rows(db: Session, user: models.User) -> list[dict]:
    enrollments = db.query(models.Enrollment).filter_by(learner_id=user.id).all()
    progress = {p.course_id: p for p in db.query(models.Progress).filter_by(learner_id=user.id).all()}
    certs = {c.course_id: c for c in db.query(models.Certificate).filter_by(learner_id=user.id).all()}
    rows = []
    for e in enrollments:
        course = db.get(models.Course, e.course_id)
        if not course:
            continue
        p = progress.get(course.id)
        cert = certs.get(course.id)
        done_ids = set(p.completed_chapters or []) if p else set()
        total = len(course.chapters)
        completed = sum(1 for ch in course.chapters if ch.id in done_ids)
        passed = bool(p and p.passed) or cert is not None
        if passed:
            status = "completed"
        elif completed > 0 or p is not None:
            status = "in_progress"
        else:
            status = "not_started"
        rows.append({
            "courseId": course.id, "title": course.title, "slug": course.slug,
            "status": status, "chaptersDone": completed, "chaptersTotal": total,
            "progressPct": 100 if passed and not total else (round(completed / total * 100) if total else 0),
            "score": (cert.score if cert else (p.score if p else None)),
            "certificateId": cert.id if cert else None,
            "issuedAt": cert.issued_at.isoformat() if cert and cert.issued_at else None,
        })
    rows.sort(key=lambda r: ({"in_progress": 0, "not_started": 1, "completed": 2}[r["status"]], r["title"]))
    return rows


@router.get("/api/approver/vessel-crew")
def vessel_crew(approver: models.User = Depends(require_vessel_approver), db: Session = Depends(get_db)):
    info = orientation_ranks.vessel_approver_info(approver)
    crew = []
    for u in _vessel_crew(db, approver):
        courses = _course_rows(db, u)
        crew.append({
            "id": u.id, "name": u.full_name, "rank": u.rank, "crewId": u.crew_id,
            "signOnDate": u.sign_on_date.isoformat() if u.sign_on_date else None,
            "assigned": len(courses),
            "completed": sum(1 for c in courses if c["status"] == "completed"),
            "inProgress": sum(1 for c in courses if c["status"] == "in_progress"),
            "notStarted": sum(1 for c in courses if c["status"] == "not_started"),
            "courses": courses,
        })
    return {"vessel": info["vessel"], "crew": crew}


@router.get("/api/approver/vessel-crew/{crew_id}/courses/{course_id}/certificate.pdf")
def vessel_crew_certificate_pdf(crew_id: str, course_id: str,
                                approver: models.User = Depends(require_vessel_approver),
                                db: Session = Depends(get_db)):
    member = _crew_member(db, approver, crew_id)
    course = db.get(models.Course, course_id)
    cert = db.query(models.Certificate).filter_by(learner_id=member.id, course_id=course_id).first()
    if not course or not cert:
        raise HTTPException(404, "No certificate issued for this crew member and course")
    pdf = build_certificate_pdf(cert_pdf_data(cert, member, course))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{cert.id}.pdf"'})

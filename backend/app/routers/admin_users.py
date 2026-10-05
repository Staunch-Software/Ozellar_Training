"""Admin user management router: crew accounts, staff, admin panel, enrollments, and course reassignments."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import models, email_service
from app.auth import (
    require_admin, require_super_admin, verify_password, hash_password, parse_ddmmyyyy
)
from app.certificates import build_certificate_pdf
from app.notifications_service import notify
from app.course_helpers import issue_certificate, cert_pdf_data

router = APIRouter(tags=["Admin Users"])


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
    password: str | None = None
    currentPassword: str | None = None


class AssignRequest(BaseModel):
    courseId: str


class BulkAssignRequest(BaseModel):
    courseIds: list[str]


class InlineApproveRequest(BaseModel):
    remark: Optional[str] = None


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


@router.get("/api/admin/users")
def admin_list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Crew (learner) users only."""
    users = (db.query(models.User).filter_by(role="learner")
             .order_by(models.User.full_name).all())
    return [admin_user_view(db, u) for u in users]


@router.get("/api/admin/office-staff")
def admin_list_office_staff(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """List all office staff users (learners with rank 'OFFICE STAFF')."""
    users = (db.query(models.User)
             .filter(models.User.role == "learner",
                     func.upper(models.User.rank) == "OFFICE STAFF")
             .order_by(models.User.full_name).all())
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "name": u.full_name,
            "crewId": u.crew_id,
            "rank": u.rank,
            "nationality": u.nationality,
            "empStatus": u.emp_status,
            "currentVessel": u.current_vessel,
            "mobileNo": u.mobile_number,
            "isActive": bool(u.is_active),
        })
    return result


@router.post("/api/admin/users")
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


@router.patch("/api/admin/users/{user_id}")
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


@router.get("/api/admin/panel/admins")
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


@router.post("/api/admin/panel/admins")
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


@router.patch("/api/admin/panel/admins/{user_id}")
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
    if req.password is not None:
        if req.currentPassword:
            if not verify_password(req.currentPassword, user.password_hash):
                raise HTTPException(400, "Incorrect current password")
        elif user.id == admin.id:
            raise HTTPException(400, "Current password is required to change your password")
        user.password_hash = hash_password(req.password)
    db.commit()
    return {
        "id": user.id, "role": user.role, "name": user.full_name,
        "email": user.email, "rank": user.rank,
        "isActive": bool(user.is_active),
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/api/admin/users/{user_id}/courses/{course_id}/reassign")
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


@router.post("/api/admin/users/{user_id}/courses/{course_id}/approve")
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


@router.post("/api/admin/users/{user_id}/enrollments")
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


@router.delete("/api/admin/users/{user_id}/enrollments/{course_id}")
def admin_unassign(user_id: str, course_id: str,
                   admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    db.query(models.Enrollment).filter_by(learner_id=user_id, course_id=course_id).delete()
    db.commit()
    return {"ok": True}


@router.put("/api/admin/users/{user_id}/enrollments")
def admin_bulk_set_enrollments(user_id: str, req: BulkAssignRequest,
                               admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Set a learner's full course assignment list in one call."""
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

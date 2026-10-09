"""Notifications router for crew and admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import get_current_user, require_admin

router = APIRouter(tags=["Notifications"])


@router.get("/api/notifications")
def list_notifications(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(models.Notification).filter_by(user_id=user.id)
            .order_by(models.Notification.created_at.desc(), models.Notification.id.desc())
            .limit(50).all())
    unread = db.query(models.Notification).filter_by(user_id=user.id, is_read=False).count()
    items = [{
        "id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
        "isRead": bool(n.is_read),
        "createdAt": (n.created_at.isoformat() + '+05:30') if n.created_at else None,
    } for n in rows]
    return {"unread": unread, "items": items}


@router.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: str, user: models.User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/api/notifications/read-all")
def mark_all_notifications_read(user: models.User = Depends(get_current_user),
                               db: Session = Depends(get_db)):
    (db.query(models.Notification).filter_by(user_id=user.id, is_read=False)
     .update({models.Notification.is_read: True}))
    db.commit()
    return {"ok": True}


@router.get("/api/admin/notifications")
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
            "createdAt": (ap.created_at.isoformat() + '+05:30') if ap.created_at else None,
        })
    return {"unread": len(items), "items": items}

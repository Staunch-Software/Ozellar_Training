"""Course assessment submission, admin approvals/rejections, and certificates router."""
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt
from fastapi import APIRouter, Depends, HTTPException, Form, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, email_service
from app.certificates import build_certificate_pdf
from app.auth import get_current_user, SECRET_KEY, ALGORITHM
from app.notifications_service import notify
from app.course_helpers import (
    get_progress, require_enrollment, cert_dict, cert_pdf_data, issue_certificate
)

router = APIRouter(tags=["Assessments & Certificates"])


class AssessmentSubmission(BaseModel):
    answers: list[int]


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


@router.post("/api/courses/{course_id}/assessment")
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

    attempt = models.Attempt(learner_id=user.id, course_id=course_id,
                          score=score, passed=passed, answers=sub.answers)
    db.add(attempt)
    db.flush()
    
    if not p:
        p = models.Progress(learner_id=lid, course_id=course_id, completed_chapters=[])
        db.add(p)
    if p.score is None or score > p.score:
        p.score = score
    p.passed = bool(p.passed) or passed

    if passed:
        cert = None
        existing_cert = db.query(models.Certificate).filter_by(learner_id=lid, course_id=course.id).first()
        if existing_cert:
            cert = cert_dict(existing_cert, user, course)
            notify(db, user.id, "passed", "Assessment passed",
                   f"You passed {course.title} with {score}%. Your certificate is already available.",
                   f"/course/{course.slug}/certificate")
        else:
            ap = models.AssessmentApproval(
                learner_id=user.id, course_id=course.id, score=score, attempt_id=attempt.id
            )
            db.add(ap)
            db.flush()
            
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


@router.get("/api/courses/{course_id}/certificate")
def get_certificate(course_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(models.Course).filter_by(id=course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    cert = (db.query(models.Certificate)
            .filter_by(learner_id=user.id, course_id=course_id).first())
    if not cert:
        raise HTTPException(404, "No certificate — assessment not passed yet")
    return cert_dict(cert, user, course)


@router.get("/api/courses/{course_id}/certificate.pdf")
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


@router.get("/api/admin/users/{user_id}/courses/{course_id}/certificate.pdf")
def admin_get_crew_certificate_pdf(
    user_id: str, course_id: str,
    request: Request,
    token: Optional[str] = None,
    dl: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Admin-only: download/view any crew member's issued certificate PDF."""
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


@router.get("/api/certificates")
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


@router.get("/api/verify/{cert_id}")
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


@router.get("/api/verify/{cert_id}/pdf")
def verify_certificate_pdf(cert_id: str, db: Session = Depends(get_db)):
    """Public — streams the actual certificate PDF for a QR-code scan or verification link."""
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


@router.get("/api/approve", response_class=HTMLResponse)
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


@router.post("/api/approve", response_class=HTMLResponse)
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

    cert_info = issue_certificate(db, user, course)
    ap.status = "approved"
    ap.decided_at = datetime.now(timezone.utc)
    ap.remark = remark

    notify(db, user.id, "certificate", "Certificate Ready",
           f"Your certificate for {course.title} has been approved.",
           f"/course/{course.slug}/certificate")
    db.commit()

    cert_obj = db.get(models.Certificate, cert_info["id"])
    pdf_bytes = build_certificate_pdf(cert_pdf_data(cert_obj, user, course))
    if user.email:
        email_service.send_approval_email(user.email, user.full_name, course.title, pdf_bytes, cert_info["id"])

    return _styled_html_response(
        "Assessment Approved", 
        f"You have successfully approved {user.full_name} for {course.title}. Their certificate has been generated and dispatched.", 
        True
    )


@router.get("/api/preview-certificate")
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


@router.get("/api/reject", response_class=HTMLResponse)
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

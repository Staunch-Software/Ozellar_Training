"""FastAPI application for the Ozellar Marine seafarer training portal.

Auth: crew log in with crew_id + date of birth (DDMMYYYY); admins with
email + password. All learner data (progress, assessments, certificates)
is tied to the authenticated user via a JWT bearer token.

Run:  uvicorn app.main:app --reload
"""
import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import jwt

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .database import SessionLocal
from . import models, email_service
from .config import PUBLIC_BASE_URL, UPLOAD_DIR
from .routers import (
    uploads,
    auth,
    notifications,
    courses,
    assessments,
    course_builder,
    screening,
    orientation,
    admin_users,
    reporting,
    briefing,
    vessel_crew,
)

smartpal_scheduler = None
email_scheduler = None


def send_pending_digest_job():
    """Job to scan for pending approvals and send the digest to the configured admin mailbox."""
    with SessionLocal() as db:
        recipients = email_service.get_admin_recipients()
        cc_list = email_service.get_approver_cc_recipients()

        if not recipients:
            print("[send_pending_digest] Skipped: APPROVER_EMAIL/ADMIN_EMAIL not set")
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

            emp_st = (user.emp_status or "").strip().upper()
            vsl = (user.current_vessel or "").strip()
            is_onboard = emp_st in ("SAIL", "ONBOARD")
            status_label = "Onboard" if is_onboard else "Leave"
            vessel_name = vsl if (is_onboard and vsl) else None

            approvals_list.append({
                "learner_name": user.full_name,
                "crew_id": user.crew_id,
                "rank": user.rank,
                "status": status_label,
                "vessel": vessel_name,
                "vessel_status": status_label,
                "mobile_no": user.mobile_number,
                "course_title": course.title,
                "score": ap.score,
                "token": token
            })

        db.commit()
        if approvals_list:
            to_recipient = recipients[0]
            final_ccs = [c for c in cc_list if c.lower() != to_recipient.lower()]
            for extra in recipients[1:]:
                if extra.lower() != to_recipient.lower() and extra not in final_ccs:
                    final_ccs.append(extra)

            email_service.send_digest_email(
                admin_email=to_recipient,
                approvals=approvals_list,
                cc_emails=final_ccs
            )
            print(f"[send_pending_digest] Sent digest for {len(approvals_list)} approvals to {to_recipient} (CC: {', '.join(final_ccs) if final_ccs else '(none)'})")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global smartpal_scheduler, email_scheduler

    # Start Schedulers
    from .smartpal_sync import schedule_jobs

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

# Register routers
app.include_router(uploads.router)
app.include_router(auth.router)
app.include_router(notifications.router)
app.include_router(courses.router)
app.include_router(assessments.router)
app.include_router(course_builder.router)
app.include_router(screening.router)
app.include_router(orientation.router)
app.include_router(admin_users.router)
app.include_router(reporting.router)
app.include_router(briefing.router)
app.include_router(vessel_crew.router)

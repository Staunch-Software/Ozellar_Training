"""One-off: send a digest for every pending approval right now.

Run once from backend/:
    ./venv/Scripts/python.exe backfill_digest.py

Reuses main.send_pending_digest_job, so after this the normal
APPROVAL_DIGEST_INTERVAL_MINUTES scheduled job just picks up new approvals
as usual (digest_sent is already True for everything sent here).
"""
from app.database import SessionLocal
from app import models
from app.main import send_pending_digest_job

def reset_and_send():
    with SessionLocal() as db:
        pending = db.query(models.AssessmentApproval).filter_by(status="pending").all()
        for ap in pending:
            ap.digest_sent = False
        db.commit()
        print(f"Reset digest_sent=False for {len(pending)} pending approvals.")
        
    # Now send the digest (this will pick up all the ones we just reset)
    send_pending_digest_job()

if __name__ == "__main__":
    reset_and_send()
    print("Backfill digest done.")

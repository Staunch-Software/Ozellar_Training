"""One-off: send a digest for every pending approval right now.

Run once from backend/:
    ./venv/Scripts/python.exe backfill_digest.py

Reuses main.send_pending_digest_job, so after this the normal
APPROVAL_DIGEST_INTERVAL_MINUTES scheduled job just picks up new approvals
as usual (digest_sent is already True for everything sent here).
"""
from app.main import send_pending_digest_job

if __name__ == "__main__":
    send_pending_digest_job()
    print("Backfill digest done.")

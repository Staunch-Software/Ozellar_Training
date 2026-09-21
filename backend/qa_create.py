"""
QA Test User Setup Script
=========================
Creates a QA crew member + approver (Master) for testing the orientation flow.

Usage:
    python qa_create.py

Login credentials printed at the end.
"""
import sys
import datetime
from app.database import SessionLocal
from app import models

db  = SessionLocal()

# -- helpers ------------------------------------------------------------------
def upsert_user(**kwargs):
    u = db.query(models.User).filter_by(email=kwargs["email"]).first()
    if u:
        print(f"  [exists] {u.full_name} ({u.email})")
        return u
    u = models.User(**kwargs)
    db.add(u)
    db.flush()
    print(f"  [created] {u.full_name} ({u.email})")
    return u

# -- pick a real orientation program ------------------------------------------
program = db.query(models.OrientationProgram).filter_by(is_active=True).first()
if not program:
    print("ERROR: No active orientation program found. Create one in the admin panel first.")
    sys.exit(1)

VESSEL = "QA Test Vessel"
print(f"\nUsing program : {program.title} ({program.department})")
print(f"Using vessel  : {VESSEL}\n")

# -- 1. Crew member (learner) --------------------------------------------------
crew = upsert_user(
    email          = "qa.crew@ozellar-test.com",
    full_name      = "QA CREW MEMBER",
    role           = "learner",
    rank           = "SECOND OFFICER" if program.department == "deck" else "SECOND ENGINEER",
    current_vessel = VESSEL,
    date_of_birth  = datetime.date(1990, 1, 1),
    is_active      = True,
)

# -- 2. Approver (Master / Chief Engineer) -------------------------------------
approver_rank = "MASTER" if program.department == "deck" else "CHIEF ENGINEER"
approver = upsert_user(
    email          = "qa.master@ozellar-test.com",
    full_name      = "QA MASTER",
    role           = "learner",        # approvers are learners with a qualifying rank
    rank           = approver_rank,
    current_vessel = VESSEL,
    emp_status     = "SAIL",           # required so vessel_approver_info() recognises them
    date_of_birth  = datetime.date(1980, 2, 2),
    is_active      = True,
)

# -- 3. Enroll crew in the orientation program ---------------------------------
enrollment = (db.query(models.OrientationEnrollment)
              .filter_by(learner_id=crew.id, program_id=program.id).first())
if enrollment:
    print(f"  [exists] Enrollment already present (status={enrollment.status})")
else:
    enrollment = models.OrientationEnrollment(
        learner_id  = crew.id,
        program_id  = program.id,
        vessel_name = VESSEL,
        master_name = approver.full_name,
        status      = "in_progress",
    )
    db.add(enrollment)
    print(f"  [created] Enrollment for {crew.full_name}")

db.commit()
db.close()

print("\n?  QA users ready!")
print("-" * 40)
print(f"  Crew     : QA CREW MEMBER   / 01011990")
print(f"  Approver : QA MASTER        / 02021980")
print("-" * 40)
print("Run  python qa_cleanup.py  to delete everything when done.\n")

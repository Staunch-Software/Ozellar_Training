"""QA test-flow setup: creates one throwaway program + crew so you can walk
the whole Orientation Program flow end to end (enroll -> checklist ->
submit -> Master review/approve) without touching any real crew or the
real "2nd Officer to Chief Officer" program.

Everything this script creates is tagged so qa_test_teardown.py can find
and remove exactly these rows, nothing else:
  - vessel name:  "QA Test Vessel"
  - crew_id prefix: "QATEST-"
  - program title: "3rd Officer to 2nd Officer" (subtitle marks it as QA)

Creates:
  - 1 Master        (QA TEST MASTER)        -> approver for the program
  - 1 Third Officer  (QA TEST THIRD OFFICER) -> matches the program's
                                                 fromRank, should show up
                                                 in the Enroll modal
  - 1 Third Engineer (QA TEST THIRD ENGINEER) -> wrong department/rank,
                                                 should NOT show up when
                                                 enrolling into this deck
                                                 program (good negative
                                                 test for the rank filter)
  - 1 OrientationProgram "3rd Officer to 2nd Officer" (deck) with 5 tasks,
    one of which requires proof (so you can also test the
    attachment-required submit gate)

Run from backend/:  ./venv/Scripts/python.exe qa_test_setup.py
"""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app import models

VESSEL = "QA Test Vessel"
PROGRAM_TITLE = "3rd Officer to 2nd Officer"

CREW = [
    dict(crew_id="QATEST-M1", full_name="QA TEST MASTER", rank="MASTER",
         dob=date(1980, 1, 1)),
    dict(crew_id="QATEST-3O1", full_name="QA TEST THIRD OFFICER", rank="THIRD OFFICER",
         dob=date(1995, 1, 1)),
    dict(crew_id="QATEST-3E1", full_name="QA TEST THIRD ENGINEER", rank="THIRD ENGINEER",
         dob=date(1996, 1, 1)),
]

TASKS = [
    ("Familiarise with Bridge Equipment", "List and identify the function of all navigation equipment on the bridge.", False),
    ("Chart Correction", "Carry out chart corrections for 2 charts as per the latest Notice to Mariners.", False),
    ("Cargo Watchkeeping", "Assist Chief Officer during cargo operations for one full watch and record observations.", False),
    ("Emergency Steering Drill", "Participate in an emergency steering gear changeover drill and attach the drill report.", True),
    ("Collision Regulations", "Explain the actions to be taken under COLREGs Rule 15 (crossing situation) with a diagram.", False),
]


def run():
    db = SessionLocal()
    try:
        existing = db.query(models.OrientationProgram).filter_by(title=PROGRAM_TITLE).first()
        if existing:
            print(f"A program titled '{PROGRAM_TITLE}' already exists (id={existing.id}) — "
                  "aborting so this script doesn't collide with real content. "
                  "Run qa_test_teardown.py first if this is leftover QA data.")
            return

        crew_by_rank = {}
        for c in CREW:
            existing_user = db.query(models.User).filter_by(crew_id=c["crew_id"]).first()
            if existing_user:
                print(f"Crew '{c['crew_id']}' already exists — reusing it.")
                crew_by_rank[c["rank"]] = existing_user
                continue
            user = models.User(
                role="learner", crew_id=c["crew_id"], full_name=c["full_name"],
                rank=c["rank"], date_of_birth=c["dob"], is_active=True,
                password_hash=None, emp_status="SAIL", current_vessel=VESSEL,
                nationality="Indian",
            )
            db.add(user)
            crew_by_rank[c["rank"]] = user

        program = models.OrientationProgram(
            title=PROGRAM_TITLE, subtitle="QA test program — safe to delete",
            department="deck", from_rank="Third Officer", to_rank="Second Officer",
            is_active=True, order=99,
        )
        db.add(program)
        db.flush()

        for i, (title, desc, requires_proof) in enumerate(TASKS):
            db.add(models.OrientationTask(
                program_id=program.id, title=title, description=desc,
                order=i, requires_proof=requires_proof,
            ))

        db.commit()

        master = crew_by_rank["MASTER"]
        third_officer = crew_by_rank["THIRD OFFICER"]
        third_engineer = crew_by_rank["THIRD ENGINEER"]

        print("\n=== QA test data created ===")
        print(f"Program: '{PROGRAM_TITLE}' (id={program.id}) — 5 tasks, 1 requires an attachment")
        print(f"Vessel: {VESSEL}\n")
        print("Login as Master (approver) — Crew tab, name + DOB:")
        print(f"  Name: {master.full_name}   DOB: {master.date_of_birth.strftime('%d%m%Y')}")
        print("\nLogin as Third Officer (should be enrollable into the new program):")
        print(f"  Name: {third_officer.full_name}   DOB: {third_officer.date_of_birth.strftime('%d%m%Y')}")
        print("\nThird Engineer exists too, for a negative test — open Enroll Officer and")
        print("confirm this person does NOT show up when the program filter is active:")
        print(f"  Name: {third_engineer.full_name}   DOB: {third_engineer.date_of_birth.strftime('%d%m%Y')}")
        print("\nWhen done testing, run: ./venv/Scripts/python.exe qa_test_teardown.py")
    finally:
        db.close()


if __name__ == "__main__":
    run()

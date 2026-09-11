"""Removes everything qa_test_setup.py created — and nothing else. Matches
strictly by the same tags the setup script used:
  - crew_id starting with "QATEST-"
  - program titled "3rd Officer to 2nd Officer"

Safe to run even if you enrolled/submitted/approved during testing — it
deletes enrollments (and their completions/submissions, via cascade)
before deleting the program or the crew rows, and clears any
notifications those crew received, so nothing is left orphaned.

Run from backend/:  ./venv/Scripts/python.exe qa_test_teardown.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app import models

PROGRAM_TITLE = "3rd Officer to 2nd Officer"
CREW_ID_PREFIX = "QATEST-"


def run():
    db = SessionLocal()
    try:
        test_users = db.query(models.User).filter(models.User.crew_id.like(f"{CREW_ID_PREFIX}%")).all()
        test_user_ids = [u.id for u in test_users]

        # 1. Enrollments for the test crew (covers any program, not just the
        #    QA one, in case they got enrolled elsewhere during testing) —
        #    cascades to their completions and submissions.
        removed_enrollments = 0
        if test_user_ids:
            enrollments = (db.query(models.OrientationEnrollment)
                          .filter(models.OrientationEnrollment.learner_id.in_(test_user_ids)).all())
            for e in enrollments:
                db.delete(e)
                removed_enrollments += 1
            db.commit()

        # 2. The QA program itself (cascades its tasks). Refuse if somehow a
        #    non-QA crew member enrolled in it — that would mean real data
        #    depends on it and this script shouldn't silently blow it away.
        program = db.query(models.OrientationProgram).filter_by(title=PROGRAM_TITLE).first()
        removed_program = False
        if program:
            other_enrollments = [e for e in program.enrollments if e.learner_id not in test_user_ids]
            if other_enrollments:
                print(f"'{PROGRAM_TITLE}' still has {len(other_enrollments)} enrollment(s) from "
                      "non-QA crew — leaving the program in place. Remove those manually first "
                      "if you really want this program gone.")
            else:
                db.delete(program)
                db.commit()
                removed_program = True

        # 3. Notifications for the test crew (FK'd to users.id, would block
        #    deleting the users otherwise).
        removed_notifications = 0
        if test_user_ids:
            removed_notifications = (db.query(models.Notification)
                                     .filter(models.Notification.user_id.in_(test_user_ids))
                                     .delete(synchronize_session=False))
            db.commit()

        # 4. The test crew rows themselves.
        for u in test_users:
            db.delete(u)
        db.commit()

        print("=== QA teardown complete ===")
        print(f"Removed {removed_enrollments} enrollment(s) (+ their completions/submissions)")
        print(f"Removed program '{PROGRAM_TITLE}': {'yes' if removed_program else 'no (see note above)'}")
        print(f"Removed {removed_notifications} notification(s)")
        print(f"Removed {len(test_users)} test crew row(s): {', '.join(u.full_name for u in test_users) or '(none found)'}")
    finally:
        db.close()


if __name__ == "__main__":
    run()

"""
QA Test User Cleanup Script
===========================
Deletes the QA users created by qa_create.py and all their related data.

Usage:
    python qa_cleanup.py
"""
from app.database import SessionLocal
from app import models

db = SessionLocal()

def delete_user(email):
    u = db.query(models.User).filter_by(email=email).first()
    if u:
        # Delete enrollments
        enrollments = db.query(models.OrientationEnrollment).filter_by(learner_id=u.id).all()
        for e in enrollments:
            db.query(models.OrientationTaskCompletion).filter_by(enrollment_id=e.id).delete()
            db.delete(e)
            
        # Delete notifications
        db.query(models.Notification).filter_by(user_id=u.id).delete()
        
        db.delete(u)
        print(f"Deleted {u.full_name} ({email}) and their data.")
    else:
        print(f"Not found: {email}")

print("Cleaning up QA test data...\n")

delete_user("qa.crew@ozellar-test.com")
delete_user("qa.master@ozellar-test.com")

db.commit()
db.close()

print("\n? Cleanup complete!")

from app.database import SessionLocal
from app import models

db = SessionLocal()

print("Deleting all related records for all courses...")
db.query(models.Enrollment).delete()
db.query(models.Progress).delete()
db.query(models.Attempt).delete()
db.query(models.Certificate).delete()
db.query(models.AssessmentApproval).delete()

print("Deleting all courses...")
db.query(models.Course).delete()

db.commit()
db.close()
print("All courses deleted successfully!")

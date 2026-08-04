from app.database import SessionLocal
from app import models

db = SessionLocal()

# 1. Find User 'Sujil'
user = db.query(models.User).filter(models.User.full_name.ilike('%Sujil%')).first()
if user:
    print(f"Found user: {user.full_name}. Deleting related records...")
    # Manually delete related records to prevent foreign key errors
    db.query(models.Enrollment).filter(models.Enrollment.learner_id == str(user.id)).delete()
    db.query(models.Progress).filter(models.Progress.learner_id == str(user.id)).delete()
    db.query(models.Attempt).filter(models.Attempt.learner_id == user.id).delete()
    db.query(models.Certificate).filter(models.Certificate.learner_id == str(user.id)).delete()
    db.query(models.Notification).filter(models.Notification.user_id == user.id).delete()
    db.query(models.AssessmentApproval).filter(models.AssessmentApproval.learner_id == user.id).delete()
    
    print("Deleting user...")
    db.delete(user)
else:
    print("Could not find a user named Sujil.")

# 2. Find Course
course_title = "Health & Safety Manual (HSM)"
course = db.query(models.Course).filter(models.Course.title == course_title).first()
if course:
    print(f"Found course: {course.title}. Deleting related records...")
    db.query(models.Enrollment).filter(models.Enrollment.course_id == course.id).delete()
    db.query(models.Progress).filter(models.Progress.course_id == course.id).delete()
    db.query(models.Attempt).filter(models.Attempt.course_id == course.id).delete()
    db.query(models.Certificate).filter(models.Certificate.course_id == course.id).delete()
    db.query(models.AssessmentApproval).filter(models.AssessmentApproval.course_id == course.id).delete()
    
    print("Deleting course...")
    db.delete(course)
else:
    print(f"Could not find course '{course_title}'.")

db.commit()
db.close()
print("Deletion complete.")

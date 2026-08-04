from app.database import SessionLocal
from app import models

db = SessionLocal()

# 1. Find and Delete User 'Sujil'
user = db.query(models.User).filter(models.User.full_name.ilike('%Sujil%')).first()
if user:
    print(f"Found user: {user.full_name}. Deleting...")
    db.delete(user)
else:
    print("Could not find a user named Sujil.")

# 2. Find and Delete the Course (Change the title here if needed!)
course_title = "Health & Safety Manual (HSM)"
course = db.query(models.Course).filter(models.Course.title == course_title).first()
if course:
    print(f"Found course: {course.title}. Deleting...")
    db.delete(course)
else:
    print(f"Could not find course '{course_title}'.")

# Save changes
db.commit()
db.close()
print("Deletion complete.")

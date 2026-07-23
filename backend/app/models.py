"""SQLAlchemy models — the data model from the build plan:
Course -> Chapter -> Block, Course -> Assessment -> Question,
Learner -> Progress / Attempt -> Certificate."""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, ForeignKey, JSON, DateTime, Date,
    UniqueConstraint, func
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    """Crew (learners) log in with crew_id + date of birth (DDMMYYYY);
    admins log in with email + password."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String, nullable=False)              # 'learner' | 'admin'
    crew_id = Column(String, unique=True, index=True)  # learner login id
    email = Column(String, unique=True, index=True)    # admin login id
    full_name = Column(String, nullable=False)
    rank = Column(String)                              # learner rank / admin title
    date_of_birth = Column(Date)                       # learner credential
    pp_no = Column(String)                             # for the certificate
    password_hash = Column(String)                     # admin credential (bcrypt)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    subtitle = Column(String)
    icon = Column(String)
    gradient = Column(String)
    duration_label = Column(String)
    status = Column(String, default="not-started")
    status_note = Column(String)
    pass_mark = Column(Integer, default=80)
    max_attempts = Column(Integer)   # null = unlimited (admin-configurable)
    cert = Column(JSON)          # {titleUpper, topics[]} for the certificate
    order = Column(Integer, default=0)

    chapters = relationship("Chapter", back_populates="course",
                            order_by="Chapter.order", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="course",
                             order_by="Question.order", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(String, primary_key=True)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    n = Column(Integer)              # lesson number
    chapter_label = Column(String)
    title = Column(String, nullable=False)
    intro = Column(Text)             # one-line lead
    sections = Column(JSON)          # [{heading, items:[...]}]
    figure = Column(Text)            # description of a diagram/visual, if any
    image = Column(String)           # /slides/<id>/slideN.png (original slide)
    videos = Column(JSON)            # ["/media/<id>/..."]
    order = Column(Integer, default=0)

    course = relationship("Course", back_populates="chapters")


class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    options = Column(JSON)       # ["a","b","c","d"]
    answer = Column(Integer)     # index of correct option
    explain = Column(Text)
    order = Column(Integer, default=0)

    course = relationship("Course", back_populates="questions")


class Progress(Base):
    """One row per learner+course, tracking completed chapters and result."""
    __tablename__ = "progress"
    id = Column(Integer, primary_key=True, autoincrement=True)
    learner_id = Column(String, index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    completed_chapters = Column(JSON, default=list)
    score = Column(Integer)
    passed = Column(Boolean, default=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Certificate(Base):
    __tablename__ = "certificates"
    id = Column(String, primary_key=True)   # e.g. OM-CARGO-2026-0417
    learner_id = Column(String, index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    score = Column(Integer)
    issued_at = Column(DateTime, server_default=func.now())


class Enrollment(Base):
    """A course assigned to a learner. Courses only appear for learners they
    are enrolled in; admins assign/unassign them. `learner_id` / `assigned_by`
    are integer FKs to users.id."""
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("learner_id", "course_id", name="uq_enrollment_learner_course"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    learner_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"))   # admin who assigned (nullable)
    assigned_at = Column(DateTime, server_default=func.now())


class Attempt(Base):
    """One row per assessment submission — the audit trail behind Progress.
    Progress holds the latest/best result; Attempt keeps the full history for
    compliance (score, pass/fail, timestamp) and attempt-limit enforcement."""
    __tablename__ = "attempts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    learner_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    score = Column(Integer)
    passed = Column(Boolean, default=False)
    answers = Column(JSON)       # the submitted answer indices, for audit
    created_at = Column(DateTime, server_default=func.now())


class Notification(Base):
    """In-app notification for a user (course assigned, assessment result,
    certificate issued). Surfaced via the top-nav bell."""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    kind = Column(String)                 # 'assigned' | 'passed' | 'failed' | 'certificate'
    title = Column(String, nullable=False)
    body = Column(String)
    link = Column(String)                 # optional in-app path
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

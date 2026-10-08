"""Course, chapter, question, progress, and enrollment database models."""
import uuid
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, ForeignKey, JSON, DateTime,
    UniqueConstraint, func
)
from sqlalchemy.orm import relationship
from ..database import Base


class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    target_ranks = Column(JSON)  # ["Captain", "Chief Engineer"] etc.
    target_users = Column(JSON)  # [1, 5, 12] specific user IDs (or crew IDs)
    order = Column(Integer, default=0)

    chapters = relationship("Chapter", back_populates="course",
                            order_by="Chapter.order", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="course",
                             order_by="Question.order", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    kind = Column(String, nullable=False, default="lesson")  # 'lesson' | 'quiz'

    course = relationship("Course", back_populates="chapters")
    quiz_questions = relationship("ChapterQuestion", back_populates="chapter",
                                  order_by="ChapterQuestion.order",
                                  cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    options = Column(JSON)       # ["a","b","c","d"]
    answer = Column(Integer)     # index of correct option
    explain = Column(Text)
    order = Column(Integer, default=0)

    course = relationship("Course", back_populates="questions")


class ChapterQuestion(Base):
    """Non-blocking checkpoint quiz question attached to a chapter (kind='quiz').
    Unlike Question (the graded final assessment), these are ungraded — the
    answer/explain are safe to send to the client and there is no Attempt
    trail; a quiz chapter's 'done' state is just 'viewed', same as a lesson."""
    __tablename__ = "chapter_questions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chapter_id = Column(String, ForeignKey("chapters.id"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    options = Column(JSON)
    answer = Column(Integer)
    explain = Column(Text)
    order = Column(Integer, default=0)

    chapter = relationship("Chapter", back_populates="quiz_questions")


class Progress(Base):
    """One row per learner+course, tracking completed chapters and result."""
    __tablename__ = "progress"
    __table_args__ = (UniqueConstraint("learner_id", "course_id", name="uq_progress_learner_course"),)
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    completed_chapters = Column(JSON, default=list)
    score = Column(Integer)
    passed = Column(Boolean, default=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Enrollment(Base):
    """A course assigned to a learner. Courses only appear for learners they
    are enrolled in; admins assign/unassign them. `learner_id` / `assigned_by`
    are integer FKs to users.id."""
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("learner_id", "course_id", name="uq_enrollment_learner_course"),)
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    assigned_by = Column(String, ForeignKey("users.id"))   # admin who assigned (nullable)
    assigned_at = Column(DateTime, server_default=func.now())

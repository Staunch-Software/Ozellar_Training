"""SQLAlchemy models — the data model from the build plan:
Course -> Chapter -> Block, Course -> Assessment -> Question,
Learner -> Progress / Attempt -> Certificate."""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, ForeignKey, JSON, DateTime, func
)
from sqlalchemy.orm import relationship
from .database import Base


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

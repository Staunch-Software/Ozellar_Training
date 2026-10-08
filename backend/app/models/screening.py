"""Screening entrance test, section, question, candidate, and attempt database models."""
import uuid
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import relationship
from ..database import Base


class ScreeningTest(Base):
    """A screening / entrance test definition created by admin."""
    __tablename__ = "screening_tests"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    timer_minutes = Column(Integer, nullable=False, default=80)
    correct_score = Column(Integer, nullable=False, default=4)   # points for correct answer
    wrong_penalty = Column(Integer, nullable=False, default=1)   # deducted for wrong answer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    sections = relationship("ScreeningSection", back_populates="test",
                            order_by="ScreeningSection.order",
                            cascade="all, delete-orphan")
    candidates = relationship("ScreeningCandidate", back_populates="test",
                              cascade="all, delete-orphan")
    # attempts also carry a test_id, so they must go with the test — otherwise
    # deleting a test that has been sat by anyone fails on the FK.
    attempts = relationship("ScreeningAttempt", cascade="all, delete-orphan")


class ScreeningSection(Base):
    """A section within a screening test (personal data form or MCQ)."""
    __tablename__ = "screening_sections"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    test_id = Column(String, ForeignKey("screening_tests.id"), nullable=False)
    title = Column(String, nullable=False)
    # 'personal_data' = fixed personal info form; 'mcq' = multiple-choice questions
    section_type = Column(String, nullable=False, default="mcq")
    passage = Column(Text)      # optional reading passage for comprehension sections
    order = Column(Integer, default=0)

    test = relationship("ScreeningTest", back_populates="sections")
    questions = relationship("ScreeningQuestion", back_populates="section",
                             order_by="ScreeningQuestion.order",
                             cascade="all, delete-orphan")


class ScreeningQuestion(Base):
    """An MCQ question within a screening section."""
    __tablename__ = "screening_questions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    section_id = Column(String, ForeignKey("screening_sections.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    options = Column(JSON)      # ["option a", "option b", "option c", "option d"]
    answer = Column(Integer)    # 0-based index of the correct option
    image_urls = Column(JSON)   # optional list of image paths, shown labelled a/b/c/... (visual/reasoning questions)
    order = Column(Integer, default=0)

    section = relationship("ScreeningSection", back_populates="questions")


class ScreeningCandidate(Base):
    """A test-taker login created by admin for a specific screening test."""
    __tablename__ = "screening_candidates"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    test_id = Column(String, ForeignKey("screening_tests.id"), nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    mobile_number = Column(String)
    # 'pending' | 'in_progress' | 'submitted'
    status = Column(String, default="pending")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    test = relationship("ScreeningTest", back_populates="candidates")
    # attempt.candidate_id is NOT NULL, so deleting a candidate has to delete
    # their attempt rather than orphan it.
    attempt = relationship("ScreeningAttempt", back_populates="candidate",
                           uselist=False, cascade="all, delete-orphan")


class ScreeningAttempt(Base):
    """One attempt per candidate — created when they start the test."""
    __tablename__ = "screening_attempts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String, ForeignKey("screening_candidates.id"),
                          nullable=False, unique=True)
    test_id = Column(String, ForeignKey("screening_tests.id"), nullable=False)
    started_at = Column(DateTime, server_default=func.now())
    submitted_at = Column(DateTime)
    personal_data = Column(JSON)      # Section 1 form fields {name, mobile, ...}
    section_answers = Column(JSON)    # {section_id: [answer_idx_or_null, ...]}
    score = Column(Integer)           # raw score (correct*4 - wrong*1)
    correct_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)
    unanswered_count = Column(Integer, default=0)
    photo_path = Column(String)       # relative path to candidate passport photo
    tab_switch_count = Column(Integer, default=0)  # times the candidate left the exam tab/window

    candidate = relationship("ScreeningCandidate", back_populates="attempt")

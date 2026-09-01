"""SQLAlchemy models — the data model from the build plan:
Course -> Chapter -> Block, Course -> Assessment -> Question,
Learner -> Progress / Attempt -> Certificate."""
import uuid
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
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    # SmartPAL crew-data sync (see smartpal_sync.py) — emp_id is the stable
    # internal key upserts match on; crew_id (above) stays the human-facing
    # login ID, populated from SmartPAL's empNo. These columns are never
    # touched by anything except the sync job.
    emp_id = Column(Integer, unique=True, index=True)
    nationality = Column(String)
    emp_status = Column(String)                        # SmartPAL empStatus, e.g. Active/SAIL/LEAVE
    current_vessel = Column(String)                    # SmartPAL vslName
    seamen_book_no = Column(String)
    birth_place = Column(String)
    smartpal_synced_at = Column(DateTime, nullable=True)


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


class Certificate(Base):
    __tablename__ = "certificates"
    id = Column(String, primary_key=True)   # e.g. OM-CARGO-2026-0417
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    score = Column(Integer)
    issued_at = Column(DateTime, server_default=func.now())


class CertificateSequence(Base):
    """Atomic sequence generator for certificate IDs."""
    __tablename__ = "certificate_sequences"
    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, server_default=func.now())


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


class Attempt(Base):
    """One row per assessment submission — the audit trail behind Progress.
    Progress holds the latest/best result; Attempt keeps the full history for
    compliance (score, pass/fail, timestamp) and attempt-limit enforcement."""
    __tablename__ = "attempts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    score = Column(Integer)
    passed = Column(Boolean, default=False)
    answers = Column(JSON)       # the submitted answer indices, for audit
    created_at = Column(DateTime, server_default=func.now())


class SyncLog(Base):
    """One row per SmartPAL crew-data sync run (see smartpal_sync.py),
    scheduled 7am/7pm IST. Written unconditionally, success or failure."""
    __tablename__ = "sync_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime)
    status = Column(String, nullable=False)   # 'success' | 'failed' | 'partial'
    records_fetched = Column(Integer, default=0)
    records_created = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    error_message = Column(Text)


class Notification(Base):
    """In-app notification for a user (course assigned, assessment result,
    certificate issued). Surfaced via the top-nav bell."""
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    kind = Column(String)                 # 'assigned' | 'passed' | 'failed' | 'certificate'
    title = Column(String, nullable=False)
    body = Column(String)
    link = Column(String)                 # optional in-app path
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class AssessmentApproval(Base):
    """Pending approval queue: one row per passed assessment awaiting admin sign-off."""
    __tablename__ = "assessment_approvals"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), index=True, nullable=False)
    score = Column(Integer)
    attempt_id = Column(String, ForeignKey("attempts.id"))
    status = Column(String, default="pending")  # 'pending' | 'approved' | 'rejected'
    digest_sent = Column(Boolean, default=False)  # included in a digest email?
    approval_token = Column(String, unique=True, index=True)  # signed JWT for one-click action
    decided_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class RateLimit(Base):
    """Database-backed rate limiter for login attempts."""
    __tablename__ = "rate_limits"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    identifier = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)


# ============================================================
# SCREENING / ENTRANCE TEST  (new feature)
# ============================================================

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

    candidate = relationship("ScreeningCandidate", back_populates="attempt")

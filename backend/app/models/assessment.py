"""Assessment attempt, approval, and certificate database models."""
import uuid
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, DateTime, func
from ..database import Base


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
    remark = Column(String, nullable=True)  # optional admin note on approval
    created_at = Column(DateTime, server_default=func.now())

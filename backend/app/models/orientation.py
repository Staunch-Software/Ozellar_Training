"""Orientation programs, tasks, completions, enrollments, and submissions database models."""
import uuid
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, ForeignKey, JSON, DateTime,
    UniqueConstraint, func
)
from sqlalchemy.orm import relationship
from ..database import Base


class OrientationProgram(Base):
    """A promotion checklist (one per rank step, e.g. '3rd Officer -> 2nd
    Officer'), admin-created and built up with OrientationTask rows."""
    __tablename__ = "orientation_programs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    subtitle = Column(String)
    department = Column(String, nullable=False)   # 'deck' | 'engine'
    from_rank = Column(String)
    to_rank = Column(String)
    is_active = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    tasks = relationship("OrientationTask", back_populates="program",
                         order_by="OrientationTask.order", cascade="all, delete-orphan")
    enrollments = relationship("OrientationEnrollment", back_populates="program",
                               cascade="all, delete-orphan")


class OrientationTask(Base):
    __tablename__ = "orientation_tasks"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey("orientation_programs.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)     # numbered sub-steps, as text
    order = Column(Integer, default=0)
    requires_proof = Column(Boolean, default=False)  # if True, crew must attach a document/photo

    program = relationship("OrientationProgram", back_populates="tasks")


class OrientationEnrollment(Base):
    """A crew member (existing User) assigned to work through one
    OrientationProgram. Mirrors Enrollment (courses)."""
    __tablename__ = "orientation_enrollments"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey("orientation_programs.id"), nullable=False)
    learner_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    assigned_by = Column(String, ForeignKey("users.id"))
    status = Column(String, default="in_progress")  # in_progress | submitted | approved | rejected
    # Snapshotted at enrollment time from crew's SmartPAL data so context is
    # preserved even if the crew member transfers vessels later.
    vessel_name = Column(String, nullable=True)   # current_vessel at enrollment time
    master_name = Column(String, nullable=True)   # Master (deck) or Chief Engineer (engine) at enrollment time
    created_at = Column(DateTime, server_default=func.now())

    program = relationship("OrientationProgram", back_populates="enrollments")
    completions = relationship("OrientationTaskCompletion", back_populates="enrollment",
                               cascade="all, delete-orphan")
    submissions = relationship("OrientationSubmission", back_populates="enrollment",
                               cascade="all, delete-orphan")


class OrientationTaskCompletion(Base):
    """One row per enrollment x task."""
    __tablename__ = "orientation_task_completions"
    __table_args__ = (UniqueConstraint("enrollment_id", "task_id", name="uq_orientation_completion"),)
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    enrollment_id = Column(String, ForeignKey("orientation_enrollments.id"), nullable=False, index=True)
    task_id = Column(String, ForeignKey("orientation_tasks.id"), nullable=False)
    is_completed = Column(Boolean, default=False)
    proof_paths = Column(JSON, default=list)   # list[str] — zero or more attachment URLs
    note = Column(Text)                        # free-text remarks the candidate adds
    completed_at = Column(DateTime)
    # The review status for this specific task
    status = Column(String, default="draft") # draft | pending_review | approved | rejected
    rejection_note = Column(Text, nullable=True)
    # Per-task sign-off by the reviewing Master/Chief Engineer
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime, nullable=True)
    verified_by = Column(String, ForeignKey("users.id"), nullable=True)

    enrollment = relationship("OrientationEnrollment", back_populates="completions")


class OrientationSubmission(Base):
    """Created when a candidate submits a fully-completed checklist for
    approval. vessel_name/department are snapshotted at submit time so a
    later change to the candidate's vessel doesn't retarget a pending
    review. Approved/rejected in-app by the matching Approver, no email."""
    __tablename__ = "orientation_submissions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    enrollment_id = Column(String, ForeignKey("orientation_enrollments.id"), nullable=False, index=True)
    vessel_name = Column(String)
    department = Column(String, nullable=False)   # 'deck' | 'engine'
    submitted_at = Column(DateTime, server_default=func.now())
    status = Column(String, default="pending")     # pending | approved | rejected
    decided_at = Column(DateTime)
    decided_by = Column(String, ForeignKey("users.id"))

    enrollment = relationship("OrientationEnrollment", back_populates="submissions")

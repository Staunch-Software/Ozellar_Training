"""Domain-driven database models package for Ozellar Marine Training.

Re-exports all models so `from app import models` or `from app.models import ...`
works identically across the entire application and external scripts.
"""
from .user import User, RateLimit, SyncLog
from .course import Course, Chapter, Question, ChapterQuestion, Progress, Enrollment
from .assessment import Certificate, CertificateSequence, Attempt, AssessmentApproval
from .orientation import (
    OrientationProgram,
    OrientationTask,
    OrientationEnrollment,
    OrientationTaskCompletion,
    OrientationSubmission,
)
from .screening import (
    ScreeningTest,
    ScreeningSection,
    ScreeningQuestion,
    ScreeningCandidate,
    ScreeningAttempt,
)
from .notification import Notification

__all__ = [
    # User / Auth / Sync
    "User",
    "RateLimit",
    "SyncLog",
    # Courses
    "Course",
    "Chapter",
    "Question",
    "ChapterQuestion",
    "Progress",
    "Enrollment",
    # Assessments & Certificates
    "Certificate",
    "CertificateSequence",
    "Attempt",
    "AssessmentApproval",
    # Orientation Checklist
    "OrientationProgram",
    "OrientationTask",
    "OrientationEnrollment",
    "OrientationTaskCompletion",
    "OrientationSubmission",
    # Screening Tests
    "ScreeningTest",
    "ScreeningSection",
    "ScreeningQuestion",
    "ScreeningCandidate",
    "ScreeningAttempt",
    # Notifications
    "Notification",
]

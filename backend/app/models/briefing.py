"""Pre-joining briefing for senior officers (form OF-MA-010)."""
import uuid
from sqlalchemy import (Column, String, Text, DateTime, Date, JSON, ForeignKey,
                        UniqueConstraint, func)
from sqlalchemy.orm import relationship
from ..database import Base


class Briefing(Base):
    """One per senior officer per joining.
    status: in_progress -> awaiting_directors -> awaiting_crew -> completed"""
    __tablename__ = "briefings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by = Column(String, ForeignKey("users.id"))
    rank = Column(String)                     # snapshot at assignment
    joining_vessel = Column(String)
    briefing_date = Column(Date)
    status = Column(String, nullable=False, default="in_progress", index=True)
    # Technical Director / Managing Director approvals (name + timestamp = signature)
    td_user_id = Column(String, ForeignKey("users.id"))
    td_name = Column(String)
    td_at = Column(DateTime)
    md_user_id = Column(String, ForeignKey("users.id"))
    md_name = Column(String)
    md_at = Column(DateTime)
    # Senior officer's final comments + acknowledgement
    crew_comments = Column(Text)
    crew_ack_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    sections = relationship("BriefingSection", back_populates="briefing",
                            cascade="all, delete-orphan",
                            order_by="BriefingSection.department")


class BriefingSection(Base):
    """One department's checklist. answers = {item_key: {response, remarks}}."""
    __tablename__ = "briefing_sections"
    __table_args__ = (UniqueConstraint("briefing_id", "department",
                                       name="uq_briefing_section_dept"),)
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    briefing_id = Column(String, ForeignKey("briefings.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    department = Column(String, nullable=False)   # qhse|marine|technical|manning_it_accounts
    briefer_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    answers = Column(JSON, default=dict)
    status = Column(String, nullable=False, default="pending")   # pending | approved
    approved_by_name = Column(String)
    approved_at = Column(DateTime)

    briefing = relationship("Briefing", back_populates="sections")

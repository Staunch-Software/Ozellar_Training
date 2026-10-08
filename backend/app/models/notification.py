"""Notification database model."""
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, func
from ..database import Base


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

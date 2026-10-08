"""User, authentication, and sync log database models."""
import uuid
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, func
from ..database import Base


class User(Base):
    """Crew (learners) log in with crew_id + date of birth (DDMMYYYY);
    admins log in with email + password."""
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    role = Column(String, nullable=False)              # 'learner' | 'admin' | 'super_admin'
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
    sign_on_date = Column(Date)                         # SmartPAL signOnDate — current tour start
    relief_date = Column(Date)                          # SmartPAL reliefDate — expected sign-off date
    seamen_book_no = Column(String)
    birth_place = Column(String)
    smartpal_synced_at = Column(DateTime, nullable=True)
    # Crewing/SeafarerDetails/GetPersonalDetails (per-crew profile call, not
    # in the bulk QueryActivity response) — email/phones live on the
    # seafarer's profile page, fetched one empId at a time after the bulk
    # sync. Named smartpal_email (not `email` above) since `email` is the
    # admin login credential and is unique-constrained; SmartPAL's crew
    # email must never collide with or overwrite that.
    smartpal_email = Column(String)
    permanent_phone_1 = Column(String)
    permanent_phone_2 = Column(String)
    local_phone_1 = Column(String)
    local_phone_2 = Column(String)
    permanent_mobile = Column(String)
    local_mobile = Column(String)
    # Resolved single "the" mobile number: Permanent Mobile if set, else
    # Local Mobile (the seafarer's present/current mobile) — per instruction.
    mobile_number = Column(String)


class RateLimit(Base):
    """Database-backed rate limiter for login attempts."""
    __tablename__ = "rate_limits"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    identifier = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)


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

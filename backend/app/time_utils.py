"""Centralized time and timezone utility functions for Ozellar Training.
Standardizes all timezone conversions to Indian Standard Time (IST, UTC+5:30).
"""
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def to_ist_iso(dt: Optional[datetime]) -> Optional[str]:
    """Serializes datetime into unambiguous ISO 8601 string with +05:30 IST offset.
    Database connections enforce Asia/Kolkata session timezone, so naive timestamps
    in the database represent IST wall-clock time. If tzinfo is None, we attach
    the +05:30 IST offset. If tzinfo is present, we convert to IST.
    """
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "+05:30"
    return dt.astimezone(IST).isoformat()

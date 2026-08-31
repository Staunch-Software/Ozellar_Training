"""One-off maintenance: rename existing certificate IDs to the new
abbreviated course-code format (e.g. OZ-MENTAL-HEALTH-2026-0001 ->
OZ-MH-2026-0001), preserving the original year and sequence number.

Dry-run by default (prints the mapping, changes nothing). Pass --apply to
actually commit the renames.

Safe to run: no other table has a foreign key to certificates.id.
"""
import sys

from app.main import _course_code
from app.database import SessionLocal
from app import models


def main(apply: bool):
    db = SessionLocal()
    certs = db.query(models.Certificate).all()

    updates = []
    for cert in certs:
        course = db.get(models.Course, cert.course_id)
        if not course:
            print(f"SKIP {cert.id}: course {cert.course_id} not found")
            continue
        parts = cert.id.split("-")
        year, seq = parts[-2], parts[-1]
        new_id = f"OZ-{_course_code(course.slug)}-{year}-{seq}"
        if new_id != cert.id:
            updates.append((cert, new_id))

    if not updates:
        print("Nothing to rename — all certificate IDs already match the current format.")
        return

    print(f"{'OLD ID':45s} -> NEW ID")
    for cert, new_id in updates:
        print(f"{cert.id:45s} -> {new_id}")
    print(f"\n{len(updates)} certificate(s) would be renamed.")

    # Collision check: every resulting ID must be unique (old ids not being
    # renamed + new ids being assigned).
    staying_ids = {c.id for c in certs} - {cert.id for cert, _ in updates}
    new_ids = [n for _, n in updates]
    if len(new_ids) != len(set(new_ids)):
        print("\nABORT: duplicate new IDs among the renames themselves.")
        return
    collisions = staying_ids & set(new_ids)
    if collisions:
        print(f"\nABORT: new ID(s) collide with an existing certificate: {collisions}")
        return

    if not apply:
        print("\nDry run only — nothing changed. Re-run with --apply to commit.")
        return

    for cert, new_id in updates:
        cert.id = new_id
    db.commit()
    print(f"\nApplied. {len(updates)} certificate(s) renamed.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)

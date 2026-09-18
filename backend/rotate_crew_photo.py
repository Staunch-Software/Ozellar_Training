"""Manually rotate a single crew member's stored photo — for cases like a
photo that's landscape/sideways with no usable EXIF tag, so
fix_photo_orientation.py can't auto-correct it, but the fix is just a
plain 90/180/270 rotation.

Usage (from backend/, with the project venv):
    # 1. Generate preview rotations to look at first (does NOT touch the original)
    ./venv/bin/python rotate_crew_photo.py <crew_id> --preview

    # 2. Once you know which one looks right, apply it (backs up the original)
    ./venv/bin/python rotate_crew_photo.py <crew_id> --apply --degrees 90

<crew_id> is the crew's login ID (e.g. 000295), not the internal user id.
--degrees is how far to rotate CLOCKWISE (90, 180, or 270).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image
from fastapi import HTTPException

from app.database import SessionLocal
from app import models
from app.main import UPLOAD_DIR, _assert_clear_passport_face

PHOTOS_DIR = os.path.join(UPLOAD_DIR, "photos")
PREVIEW_DIR = os.path.join(PHOTOS_DIR, "_rotate_preview")


def find_photo_path(crew_id):
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(crew_id=crew_id).first()
        if not user:
            sys.exit(f"No user found with crew_id={crew_id}")
        path = os.path.join(PHOTOS_DIR, f"{user.id}.jpg")
        if not os.path.exists(path):
            sys.exit(f"No stored photo at {path}")
        return user, path
    finally:
        db.close()


def rotate(image, degrees_clockwise):
    # PIL's rotate() is counter-clockwise, so negate for a clockwise angle.
    return image.rotate(-degrees_clockwise, expand=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("crew_id")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--degrees", type=int, choices=[90, 180, 270])
    args = ap.parse_args()

    user, path = find_photo_path(args.crew_id)
    print(f"{user.full_name} ({user.crew_id}) — {path}")

    if args.preview:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        original = Image.open(path)
        for deg in (90, 180, 270):
            out = os.path.join(PREVIEW_DIR, f"{args.crew_id}_{deg}.jpg")
            rotate(original, deg).convert("RGB").save(out, format="JPEG", quality=85)
            print(f"  wrote preview: {out}")
        print("\nDownload these, pick the one that looks upright, then re-run with"
              " --apply --degrees <N>.")
        return

    if args.apply:
        if not args.degrees:
            sys.exit("--apply requires --degrees 90|180|270")
        backup = path + ".orig.bak"
        if not os.path.exists(backup):
            Image.open(path).save(backup, format="JPEG")
            print(f"  backed up original to {backup}")

        rotated = rotate(Image.open(path), args.degrees)
        width, height = rotated.size
        try:
            if width < 200 or height < 200:
                raise HTTPException(400, "too small")
            if width > height:
                raise HTTPException(400, "still landscape after this rotation — try a different --degrees value")
            _assert_clear_passport_face(rotated)
        except HTTPException as e:
            sys.exit(f"Rotation by {args.degrees} does not pass validation: {e.detail}\n"
                      f"Original is untouched (backup at {backup}). Try a different --degrees value.")

        rotated.convert("RGB").save(path, format="JPEG", quality=85)
        print(f"  rotated {args.degrees} deg clockwise and saved — passes validation")
        return

    print("Nothing to do — pass --preview or --apply.")


if __name__ == "__main__":
    main()

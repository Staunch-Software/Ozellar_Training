"""One-off maintenance: re-process every already-stored crew photo in
uploads/photos with the same rules POST /api/crew/photo now enforces
(EXIF-rotate upright, must not be landscape/sideways, must show one
clear face).

Photos uploaded before that validation existed may be sideways (EXIF
rotation never applied) or otherwise invalid. This script:
  - auto-fixes orientation in place where the image is otherwise valid
  - leaves alone (and reports) photos that fail validation even after
    rotation, since those need the crew member to reupload

Run from backend/ with the project venv:
    ./venv/Scripts/python.exe fix_photo_orientation.py          # dry run
    ./venv/Scripts/python.exe fix_photo_orientation.py --apply  # write fixes
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image, ImageOps

from app.database import SessionLocal
from app import models
from app.main import _assert_clear_passport_face
from fastapi import HTTPException

PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "uploads", "photos")


def crew_label(db, user_id):
    user = db.get(models.User, user_id)
    if not user:
        return f"(no matching user, id={user_id})"
    return f"{user.full_name} ({user.crew_id or user.id})"


def main():
    apply = "--apply" in sys.argv
    db = SessionLocal()
    fixed, unchanged, invalid = [], [], []

    for path in sorted(glob.glob(os.path.join(PHOTOS_DIR, "*.jpg"))):
        user_id = os.path.splitext(os.path.basename(path))[0]
        label = crew_label(db, user_id)

        image = Image.open(path)
        rotated = ImageOps.exif_transpose(image)
        was_rotated = rotated.size != image.size or rotated.tobytes() != image.tobytes()

        try:
            width, height = rotated.size
            if width < 200 or height < 200:
                raise HTTPException(400, "too small")
            if width > height:
                raise HTTPException(400, "landscape/rotated sideways")
            _assert_clear_passport_face(rotated)
        except HTTPException as e:
            invalid.append((label, path, e.detail))
            continue

        if was_rotated:
            fixed.append((label, path))
            if apply:
                rotated.convert("RGB").save(path, format="JPEG", quality=85)
        else:
            unchanged.append((label, path))

    print(f"\n{'APPLIED' if apply else 'DRY RUN'} - {len(fixed)} to fix, {len(unchanged)} already fine, {len(invalid)} need reupload\n")

    if fixed:
        print("Rotated in place:" if apply else "Would rotate:")
        for label, path in fixed:
            print(f"  {label} - {os.path.basename(path)}")

    if invalid:
        print("\nCannot auto-fix, crew member must reupload:")
        for label, path, reason in invalid:
            print(f"  {label} - {os.path.basename(path)} - {reason}")

    if not apply and fixed:
        print("\nRe-run with --apply to write these fixes.")

    db.close()


if __name__ == "__main__":
    main()

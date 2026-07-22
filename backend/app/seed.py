"""Seed the database from courses_seed.json (the single source of truth,
generated from the frontend seed data). Run:  python -m app.seed"""
import json
import os
from .database import Base, engine, SessionLocal
from . import models

SEED_FILE = os.path.join(os.path.dirname(__file__), "courses_seed.json")


def run():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with open(SEED_FILE, encoding="utf-8") as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        for ci, c in enumerate(data["courses"]):
            course = models.Course(
                id=c["id"], slug=c["slug"], title=c["title"],
                subtitle=c.get("subtitle"), icon=c.get("icon"),
                gradient=c.get("gradient"), duration_label=c.get("durationLabel"),
                status=c.get("status", "not-started"), status_note=c.get("statusNote"),
                pass_mark=c["assessment"]["passMark"], cert=c.get("cert"), order=ci,
            )
            db.add(course)
            for chi, ch in enumerate(c["chapters"]):
                db.add(models.Chapter(
                    id=ch["id"], course_id=c["id"], n=ch.get("n"),
                    chapter_label=ch.get("chapterLabel"), title=ch["title"],
                    intro=ch.get("intro", ""), sections=ch.get("sections", []),
                    figure=ch.get("figure", ""), image=ch.get("image"),
                    videos=ch.get("videos", []), order=chi,
                ))
            for qi, q in enumerate(c["assessment"]["questions"]):
                db.add(models.Question(
                    course_id=c["id"], prompt=q["q"], options=q["options"],
                    answer=q["answer"], explain=q.get("explain"), order=qi,
                ))
        db.commit()
        print(f"Seeded {len(data['courses'])} courses.")
    finally:
        db.close()


if __name__ == "__main__":
    run()

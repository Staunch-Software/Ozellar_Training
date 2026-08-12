import os
import sys
import uuid
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
engine = create_engine(DATABASE_URL)

def is_uuid(val):
    try:
        uuid.UUID(str(val))
        return True
    except ValueError:
        return False

def main():
    is_postgres = "postgresql" in DATABASE_URL
    print(f"Using database: {DATABASE_URL} (PostgreSQL: {is_postgres})")

    course_fks = [
        ("chapters", "course_id"),
        ("questions", "course_id"),
        ("progress", "course_id"),
        ("certificates", "course_id"),
        ("enrollments", "course_id"),
        ("attempts", "course_id"),
        ("assessment_approvals", "course_id"),
    ]
    chapter_fks = [
        ("chapter_questions", "chapter_id")
    ]

    with engine.connect() as conn:
        with conn.begin():
            # Find all non-UUID courses
            courses = conn.execute(text("SELECT id FROM courses")).fetchall()
            non_uuid_courses = [r[0] for r in courses if not is_uuid(r[0])]
            
            # Find all non-UUID chapters
            chapters = conn.execute(text("SELECT id FROM chapters")).fetchall()
            non_uuid_chapters = [r[0] for r in chapters if not is_uuid(r[0])]
            
            if not non_uuid_courses and not non_uuid_chapters:
                print("All Course and Chapter IDs are already UUIDs.")
                return

            print(f"Found {len(non_uuid_courses)} non-UUID courses and {len(non_uuid_chapters)} non-UUID chapters.")
            
            # Generate mappings
            mapping = {}
            for cid in non_uuid_courses:
                mapping[cid] = str(uuid.uuid4())
            for cid in non_uuid_chapters:
                mapping[cid] = str(uuid.uuid4())
                
            if is_postgres:
                # 1. Drop constraints
                for table, col in course_fks:
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT {fk_name}"))
                        print(f"Dropped {fk_name} on {table}")
                    except Exception:
                        pass
                for table, col in chapter_fks:
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT {fk_name}"))
                        print(f"Dropped {fk_name} on {table}")
                    except Exception:
                        pass
                        
            elif "sqlite" in DATABASE_URL:
                conn.execute(text("PRAGMA foreign_keys=OFF;"))

            # 2. Update Courses and everything referencing courses
            for old_id in non_uuid_courses:
                new_id = mapping[old_id]
                conn.execute(text("UPDATE courses SET id = :new WHERE id = :old"), {"new": new_id, "old": old_id})
                for table, col in course_fks:
                    conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"), {"new": new_id, "old": old_id})
            
            # Update Chapters and everything referencing chapters
            for old_id in non_uuid_chapters:
                new_id = mapping[old_id]
                conn.execute(text("UPDATE chapters SET id = :new WHERE id = :old"), {"new": new_id, "old": old_id})
                for table, col in chapter_fks:
                    conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"), {"new": new_id, "old": old_id})
                    
            # 3. Handle JSON completed_chapters in progress table
            import json
            progress_rows = conn.execute(text("SELECT id, completed_chapters FROM progress")).fetchall()
            for pid, completed in progress_rows:
                if completed:
                    try:
                        comp_list = json.loads(completed) if isinstance(completed, str) else completed
                        updated_list = [mapping.get(c, c) for c in comp_list]
                        if isinstance(completed, str):
                            conn.execute(text("UPDATE progress SET completed_chapters = :val WHERE id = :pid"), 
                                       {"val": json.dumps(updated_list), "pid": pid})
                        else:
                            conn.execute(text("UPDATE progress SET completed_chapters = :val WHERE id = :pid"), 
                                       {"val": json.dumps(updated_list), "pid": pid})
                    except Exception as e:
                        print(f"Error parsing progress {pid}: {e}")

            # 4. Re-add constraints
            if is_postgres:
                for table, col in course_fks:
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {fk_name} FOREIGN KEY ({col}) REFERENCES courses(id)"))
                        print(f"Re-added {fk_name} on {table}")
                    except Exception as e:
                        print(f"Warning adding {fk_name}: {e}")
                
                for table, col in chapter_fks:
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {fk_name} FOREIGN KEY ({col}) REFERENCES chapters(id)"))
                        print(f"Re-added {fk_name} on {table}")
                    except Exception as e:
                        print(f"Warning adding {fk_name}: {e}")
                        
            elif "sqlite" in DATABASE_URL:
                conn.execute(text("PRAGMA foreign_keys=ON;"))

    print("Remaining migrations completed successfully.")

if __name__ == "__main__":
    main()

import json
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
engine = create_engine(DATABASE_URL)

MAPPING_FILE = "course_id_mapping.json"

def main():
    if not os.path.exists(MAPPING_FILE):
        print(f"Error: {MAPPING_FILE} not found.")
        sys.exit(1)
        
    with open(MAPPING_FILE, "r", encoding="utf-8") as f:
        mapping = json.load(f)
        
    is_postgres = "postgresql" in DATABASE_URL
    print(f"Using database: {DATABASE_URL} (PostgreSQL: {is_postgres})")

    # In PostgreSQL, we must temporarily drop constraints
    # List of constraints pointing to courses.id
    course_fks = [
        ("chapters", "course_id"),
        ("questions", "course_id"),
        ("progress", "course_id"),
        ("certificates", "course_id"),
        ("enrollments", "course_id"),
        ("attempts", "course_id"),
        ("assessment_approvals", "course_id"),
    ]
    # List of constraints pointing to chapters.id
    chapter_fks = [
        ("chapter_questions", "chapter_id")
    ]

    with engine.connect() as conn:
        with conn.begin():
            if is_postgres:
                # 1. Drop constraints
                for table, col in course_fks:
                    # In postgres, Alembic default FK name is often table_col_fkey
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT {fk_name}"))
                        print(f"Dropped {fk_name} on {table}")
                    except Exception as e:
                        print(f"Warning dropping {fk_name}: {e}")
                
                for table, col in chapter_fks:
                    fk_name = f"{table}_{col}_fkey"
                    try:
                        conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT {fk_name}"))
                        print(f"Dropped {fk_name} on {table}")
                    except Exception as e:
                        print(f"Warning dropping {fk_name}: {e}")
                        
            elif "sqlite" in DATABASE_URL:
                conn.execute(text("PRAGMA foreign_keys=OFF;"))
                print("Disabled SQLite foreign keys.")

            # 2. Update Courses and Chapters IDs
            # First, update courses and everything referencing courses
            for old_id, new_id in mapping.items():
                # If it's a course ID
                if '-' in old_id and 'l' not in old_id and old_id in ['cargo-ops', 'hsm', 'cyber'] or 'l' not in old_id: # rough heuristic, we can just attempt update on courses
                    conn.execute(text("UPDATE courses SET id = :new WHERE id = :old"), {"new": new_id, "old": old_id})
                    for table, col in course_fks:
                        conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"), {"new": new_id, "old": old_id})
                
                # Now try chapters
                conn.execute(text("UPDATE chapters SET id = :new WHERE id = :old"), {"new": new_id, "old": old_id})
                for table, col in chapter_fks:
                    conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"), {"new": new_id, "old": old_id})
                    
            # 3. Handle JSON completed_chapters in progress table
            print("Updating JSON completed_chapters in progress table...")
            progress_rows = conn.execute(text("SELECT id, completed_chapters FROM progress")).fetchall()
            for pid, completed in progress_rows:
                if completed:
                    try:
                        # SQLite returns string for JSON, Postgres returns dict/list
                        comp_list = json.loads(completed) if isinstance(completed, str) else completed
                        updated_list = [mapping.get(c, c) for c in comp_list]
                        # Write back
                        if isinstance(completed, str):
                            conn.execute(text("UPDATE progress SET completed_chapters = :val WHERE id = :pid"), 
                                       {"val": json.dumps(updated_list), "pid": pid})
                        else:
                            import json as j
                            conn.execute(text("UPDATE progress SET completed_chapters = :val WHERE id = :pid"), 
                                       {"val": j.dumps(updated_list), "pid": pid})
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

    print("Migration completed successfully.")

if __name__ == "__main__":
    main()

import os
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
is_postgres = "postgres" in DATABASE_URL.lower()

# SQLite needs a special flag
connect_args = {"check_same_thread": False} if not is_postgres else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

tables_with_fks = {
    'users': [
        ('progress', 'learner_id'),
        ('certificates', 'learner_id'),
        ('enrollments', 'learner_id'),
        ('enrollments', 'assigned_by'),
        ('attempts', 'learner_id'),
        ('notifications', 'user_id'),
        ('assessment_approvals', 'learner_id'),
    ],
    'attempts': [
        ('assessment_approvals', 'attempt_id'),
    ],
    'questions': [],
    'chapter_questions': [],
    'progress': [],
    'certificate_sequences': [],
    'enrollments': [],
    'sync_logs': [],
    'notifications': [],
    'assessment_approvals': [],
    'rate_limits': []
}

def migrate_ids():
    from sqlalchemy import inspect
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    with engine.begin() as conn:
        print(f"Connected to {'PostgreSQL' if is_postgres else 'SQLite'}")
        
        if not is_postgres:
            conn.execute(text("PRAGMA foreign_keys = OFF;"))
        else:
            # Drop PostgreSQL Foreign Key Constraints temporarily
            print("Temporarily dropping Foreign Key constraints...")
            for main_table, fks in tables_with_fks.items():
                if main_table not in existing_tables: continue
                for ref_table, ref_col in fks:
                    if ref_table not in existing_tables: continue
                    constraint_name = f"{ref_table}_{ref_col}_fkey"
                    conn.execute(text(f"ALTER TABLE {ref_table} DROP CONSTRAINT IF EXISTS {constraint_name}"))

        total_updates = 0
        
        for table, fks in tables_with_fks.items():
            if table not in existing_tables: continue
            
            # Find old stringified integer IDs (length < 30)
            result = conn.execute(text(f"SELECT id FROM {table} WHERE length(id) < 30")).fetchall()
            old_ids = [r[0] for r in result if r[0] is not None]
            
            if not old_ids:
                continue
                
            print(f"Found {len(old_ids)} old IDs in '{table}'. Migrating to UUIDs...")
            
            for old_id in old_ids:
                new_uuid = str(uuid.uuid4())
                
                # Update Foreign Keys first
                for ref_table, ref_col in fks:
                    if ref_table not in existing_tables: continue
                    conn.execute(text(f"UPDATE {ref_table} SET {ref_col} = :new_uuid WHERE {ref_col} = :old_id"),
                                 {"new_uuid": new_uuid, "old_id": old_id})
                
                # Update Primary Key
                conn.execute(text(f"UPDATE {table} SET id = :new_uuid WHERE id = :old_id"),
                             {"new_uuid": new_uuid, "old_id": old_id})
                total_updates += 1

        if not is_postgres:
            conn.execute(text("PRAGMA foreign_keys = ON;"))
        else:
            # Recreate PostgreSQL Foreign Key Constraints
            print("Recreating Foreign Key constraints...")
            for main_table, fks in tables_with_fks.items():
                if main_table not in existing_tables: continue
                for ref_table, ref_col in fks:
                    if ref_table not in existing_tables: continue
                    constraint_name = f"{ref_table}_{ref_col}_fkey"
                    conn.execute(text(f"ALTER TABLE {ref_table} ADD CONSTRAINT {constraint_name} FOREIGN KEY ({ref_col}) REFERENCES {main_table}(id)"))

        print(f"Migration successful! Converted {total_updates} old IDs to UUIDs.")

if __name__ == "__main__":
    try:
        migrate_ids()
    except Exception as e:
        print(f"An error occurred during migration: {e}")

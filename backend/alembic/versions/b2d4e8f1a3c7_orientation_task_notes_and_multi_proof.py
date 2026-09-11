"""orientation_task_notes_and_multi_proof

Revision ID: b2d4e8f1a3c7
Revises: 9f3c7b2e5a1d
Create Date: 2026-09-11 00:00:00.000000

Candidates can now attach more than one proof file per task and leave a
free-text note. Replaces the single `proof_path` string with a `proof_paths`
JSON list and adds `note`. Existing single-proof rows are migrated into the
new list column before the old column is dropped.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d4e8f1a3c7'
down_revision: Union[str, None] = '9f3c7b2e5a1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('proof_paths', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('note', sa.Text(), nullable=True))

    # Carry forward any existing single proof into the new list column.
    op.execute("""
        UPDATE orientation_task_completions
        SET proof_paths = json_build_array(proof_path)
        WHERE proof_path IS NOT NULL
    """)

    with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
        batch_op.drop_column('proof_path')


def downgrade() -> None:
    with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('proof_path', sa.String(), nullable=True))

    op.execute("""
        UPDATE orientation_task_completions
        SET proof_path = proof_paths ->> 0
        WHERE proof_paths IS NOT NULL AND json_array_length(proof_paths) > 0
    """)

    with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
        batch_op.drop_column('proof_paths')
        batch_op.drop_column('note')

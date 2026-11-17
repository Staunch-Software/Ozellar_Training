"""add_approval_note_to_orientation_task_completions

Revision ID: 52db5a20ffc6
Revises: a7c3e91d4b20
Create Date: 2026-11-17 10:13:34.336511

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52db5a20ffc6'
down_revision: Union[str, None] = 'a7c3e91d4b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c['name'] for c in insp.get_columns('orientation_task_completions')}
    if 'approval_note' not in cols:
        with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
            batch_op.add_column(sa.Column('approval_note', sa.Text(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c['name'] for c in insp.get_columns('orientation_task_completions')}
    if 'approval_note' in cols:
        with op.batch_alter_table('orientation_task_completions', schema=None) as batch_op:
            batch_op.drop_column('approval_note')

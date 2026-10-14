"""add interview_remark and is_shortlisted to screening_candidates

Revision ID: 6617691ebd96
Revises: 07a72ca088fd
Create Date: 2026-10-14 12:14:01.425045

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6617691ebd96'
down_revision: Union[str, None] = '07a72ca088fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c['name'] for c in insp.get_columns('screening_candidates')]
    if 'interview_remark' not in columns:
        op.add_column('screening_candidates', sa.Column('interview_remark', sa.Text(), nullable=True))
    if 'is_shortlisted' not in columns:
        op.add_column('screening_candidates', sa.Column('is_shortlisted', sa.Boolean(), server_default=sa.text('false'), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c['name'] for c in insp.get_columns('screening_candidates')]
    if 'is_shortlisted' in columns:
        op.drop_column('screening_candidates', 'is_shortlisted')
    if 'interview_remark' in columns:
        op.drop_column('screening_candidates', 'interview_remark')

"""add remark to assessment approvals

Revision ID: 16bf66fb3642
Revises: e6d48fbd2878
Create Date: 2026-09-10 10:28:32.319709

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16bf66fb3642'
down_revision: Union[str, None] = 'e6d48fbd2878'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assessment_approvals', sa.Column('remark', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('assessment_approvals', 'remark')

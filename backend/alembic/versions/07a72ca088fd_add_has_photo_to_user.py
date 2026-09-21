"""Add has_photo to User

Revision ID: 07a72ca088fd
Revises: e83061317af2
Create Date: 2026-09-21 11:58:03.630076

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '07a72ca088fd'
down_revision: Union[str, None] = 'e83061317af2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add has_photo column to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('has_photo', sa.Boolean(), server_default='false', nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('has_photo')

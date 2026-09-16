"""add smartpal profile contact fields to users

Revision ID: a064f726a87d
Revises: 6090629ef6e6
Create Date: 2026-09-16 14:50:27.879257

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a064f726a87d'
down_revision: Union[str, None] = '6090629ef6e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('smartpal_email', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('permanent_phone_1', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('permanent_phone_2', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('local_phone_1', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('local_phone_2', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('permanent_mobile', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('local_mobile', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('mobile_number', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('mobile_number')
        batch_op.drop_column('local_mobile')
        batch_op.drop_column('permanent_mobile')
        batch_op.drop_column('local_phone_2')
        batch_op.drop_column('local_phone_1')
        batch_op.drop_column('permanent_phone_2')
        batch_op.drop_column('permanent_phone_1')
        batch_op.drop_column('smartpal_email')

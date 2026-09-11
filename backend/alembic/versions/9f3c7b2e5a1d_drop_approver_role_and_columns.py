"""drop_approver_role_and_columns

Revision ID: 9f3c7b2e5a1d
Revises: cf24b050da4f
Create Date: 2026-09-11 00:00:00.000000

Orientation Program approvers (vessel Master / Chief Engineer) no longer
have a separate role='approver' account — eligibility is now derived live
from an ordinary crew (role='learner') row's rank + emp_status +
current_vessel (see app/orientation_ranks.py:vessel_approver_info). Existing
role='approver' rows have no rank/current_vessel/emp_status populated (the
crew sync never touches them) and would become permanently inert once the
columns backing their login/matching logic are dropped, so they're deleted
first.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f3c7b2e5a1d'
down_revision: Union[str, None] = 'cf24b050da4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # An approver row may already be referenced as decided_by on a real
    # submission it reviewed — null that out (the submission itself, its
    # status and decided_at timestamp are untouched) so the row can be
    # deleted without violating the FK.
    op.execute("""
        UPDATE orientation_submissions SET decided_by = NULL
        WHERE decided_by IN (SELECT id FROM users WHERE role = 'approver')
    """)
    op.execute("DELETE FROM users WHERE role = 'approver'")
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('approver_department')
        batch_op.drop_column('approver_vessel')


def downgrade() -> None:
    # Data loss is expected: the role='approver' rows deleted in upgrade()
    # are not recreated.
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('approver_vessel', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('approver_department', sa.String(), nullable=True))

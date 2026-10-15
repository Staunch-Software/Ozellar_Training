"""pre-joining briefing tables + admin module access columns

Revision ID: a7c3e91d4b20
Revises: 6617691ebd96
Create Date: 2026-10-15 10:00:00.000000

users.modules NULL means "all modules" (see auth.user_modules), so existing
admins keep full access without a backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3e91d4b20'
down_revision: Union[str, None] = '6617691ebd96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    user_cols = {c['name'] for c in insp.get_columns('users')}
    if 'modules' not in user_cols:
        op.add_column('users', sa.Column('modules', sa.JSON(), nullable=True))
    if 'department' not in user_cols:
        op.add_column('users', sa.Column('department', sa.String(), nullable=True))
    if 'designation' not in user_cols:
        op.add_column('users', sa.Column('designation', sa.String(), nullable=True))

    tables = set(insp.get_table_names())
    if 'briefings' not in tables:
        op.create_table(
            'briefings',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('learner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('assigned_by', sa.String(), sa.ForeignKey('users.id')),
            sa.Column('rank', sa.String()),
            sa.Column('joining_vessel', sa.String()),
            sa.Column('briefing_date', sa.Date()),
            sa.Column('status', sa.String(), nullable=False, server_default='in_progress'),
            sa.Column('td_user_id', sa.String(), sa.ForeignKey('users.id')),
            sa.Column('td_name', sa.String()),
            sa.Column('td_at', sa.DateTime()),
            sa.Column('md_user_id', sa.String(), sa.ForeignKey('users.id')),
            sa.Column('md_name', sa.String()),
            sa.Column('md_at', sa.DateTime()),
            sa.Column('crew_comments', sa.Text()),
            sa.Column('crew_ack_at', sa.DateTime()),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_briefings_learner_id', 'briefings', ['learner_id'])
        op.create_index('ix_briefings_status', 'briefings', ['status'])
    if 'briefing_sections' not in tables:
        op.create_table(
            'briefing_sections',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('briefing_id', sa.String(),
                      sa.ForeignKey('briefings.id', ondelete='CASCADE'), nullable=False),
            sa.Column('department', sa.String(), nullable=False),
            sa.Column('briefer_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('answers', sa.JSON()),
            sa.Column('status', sa.String(), nullable=False, server_default='pending'),
            sa.Column('approved_by_name', sa.String()),
            sa.Column('approved_at', sa.DateTime()),
            sa.UniqueConstraint('briefing_id', 'department', name='uq_briefing_section_dept'),
        )
        op.create_index('ix_briefing_sections_briefing_id', 'briefing_sections', ['briefing_id'])
        op.create_index('ix_briefing_sections_briefer_id', 'briefing_sections', ['briefer_id'])


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if 'briefing_sections' in tables:
        op.drop_table('briefing_sections')
    if 'briefings' in tables:
        op.drop_table('briefings')
    user_cols = {c['name'] for c in insp.get_columns('users')}
    for col in ('designation', 'department', 'modules'):
        if col in user_cols:
            op.drop_column('users', col)

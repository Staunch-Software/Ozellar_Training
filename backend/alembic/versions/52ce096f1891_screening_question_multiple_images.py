"""screening_question_multiple_images

Revision ID: 52ce096f1891
Revises: ceb54b614113
Create Date: 2026-08-31 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52ce096f1891'
down_revision: Union[str, None] = 'ceb54b614113'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No production candidate has answered an image-based question yet (the
    # only row that ever set image_url is content re-seeded by
    # backend/seed_engine_cadet_test.py), so this is a straight swap rather
    # than a data carry-forward.
    op.add_column('screening_questions', sa.Column('image_urls', sa.JSON(), nullable=True))
    op.drop_column('screening_questions', 'image_url')


def downgrade() -> None:
    op.add_column('screening_questions', sa.Column('image_url', sa.String(), nullable=True))
    op.drop_column('screening_questions', 'image_urls')

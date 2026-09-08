"""entity is_foundational flag, review_card snoozed_until

Revision ID: a1b2c3d4e5f6
Revises: f192e54db63d
Create Date: 2026-09-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f192e54db63d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'entities',
        sa.Column('is_foundational', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('review_cards', sa.Column('snoozed_until', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('review_cards', 'snoozed_until')
    op.drop_column('entities', 'is_foundational')

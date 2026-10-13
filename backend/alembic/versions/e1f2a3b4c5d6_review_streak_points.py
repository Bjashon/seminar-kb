"""review card streak: counts points, not answers

"Easy" now moves a card towards level 2 faster than "good" (2 points for a
good, 3 for an easy, 6 promote), so a streak earned under the old rule --
one per answer -- is doubled to keep what it was worth.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("UPDATE review_cards SET streak = streak * 2")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE review_cards SET streak = streak / 2")

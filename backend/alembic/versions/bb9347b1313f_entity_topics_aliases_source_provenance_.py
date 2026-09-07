"""entity topics, aliases, source provenance, review levels

Revision ID: bb9347b1313f
Revises: 286fe1620952
Create Date: 2026-09-07 18:00:21.770410

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb9347b1313f'
down_revision: Union[str, Sequence[str], None] = '286fe1620952'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('entities') as batch_op:
        batch_op.add_column(sa.Column('aliases', sa.JSON(), nullable=False, server_default='[]'))
        batch_op.add_column(sa.Column('topic', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('topic_order', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('source_label', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('source_document', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('source_page', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_entities_topic'), ['topic'], unique=False)

    with op.batch_alter_table('entity_links') as batch_op:
        batch_op.create_unique_constraint('uq_entity_link_pair', ['from_entity_id', 'to_entity_id'])

    with op.batch_alter_table('review_cards') as batch_op:
        batch_op.add_column(sa.Column('level', sa.Integer(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('streak', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('review_cards') as batch_op:
        batch_op.drop_column('streak')
        batch_op.drop_column('level')

    with op.batch_alter_table('entity_links') as batch_op:
        batch_op.drop_constraint('uq_entity_link_pair', type_='unique')

    with op.batch_alter_table('entities') as batch_op:
        batch_op.drop_index(batch_op.f('ix_entities_topic'))
        batch_op.drop_column('source_page')
        batch_op.drop_column('source_document')
        batch_op.drop_column('source_label')
        batch_op.drop_column('topic_order')
        batch_op.drop_column('topic')
        batch_op.drop_column('aliases')

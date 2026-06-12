"""add_indexes

Revision ID: d60a6eb1dd79
Revises: c59a5ea0cc68
Create Date: 2026-06-11 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd60a6eb1dd79'
down_revision: Union[str, None] = 'c59a5ea0cc68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create GIN index for full-text search on chunks.content
    op.create_index(
        'ix_chunks_content_fts',
        'chunks',
        [sa.text("to_tsvector('english', content)")],
        postgresql_using='gin'
    )

    # 2. Create HNSW index on embeddings.embedding column for cosine distance
    # We cast to halfvec(3072) to bypass the pgvector 2000-dimension limit for standard vector indexes.
    op.execute(
        "CREATE INDEX ix_embeddings_embedding_hnsw ON embeddings "
        "USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index('ix_embeddings_embedding_hnsw', table_name='embeddings')
    op.drop_index('ix_chunks_content_fts', table_name='chunks')

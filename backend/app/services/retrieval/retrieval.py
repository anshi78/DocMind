import uuid
import sqlalchemy as sa
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.db.models import Chunk, Embedding, Document, DocumentVersion
from app.services.embeddings.embeddings import EmbeddingService


class RetrievalService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def retrieve_relevant_chunks(
        self,
        query: str,
        org_id: uuid.UUID,
        document_scope: list[uuid.UUID] | None = None,
        limit: int = 8,
    ) -> list[tuple[Chunk, float]]:
        """
        Perform hybrid search (pgvector semantic search + BM25 keyword search)
        and fuse findings using Reciprocal Rank Fusion (RRF).
        Returns a list of tuples containing the Chunk and its fused relevance score.
        """
        if not query.strip():
            return []

        # Step 1: Run semantic and keyword searches in parallel/sequence
        semantic_results = await self._semantic_search(query, org_id, document_scope)
        keyword_results = await self._keyword_search(query, org_id, document_scope)

        # Step 2: Reciprocal Rank Fusion (RRF)
        # We assign ranks (1-indexed) based on their order in each list
        k = 60  # RRF constant
        rrf_scores = {}
        chunks_map = {}

        # Process semantic ranks
        for rank, (chunk, similarity) in enumerate(semantic_results, 1):
            chunk_id = chunk.id
            chunks_map[chunk_id] = chunk
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

        # Process keyword ranks
        for rank, (chunk, rank_score) in enumerate(keyword_results, 1):
            chunk_id = chunk.id
            chunks_map[chunk_id] = chunk
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

        # Step 3: Sort chunks by RRF score descending
        sorted_chunk_ids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)

        # Map back to Chunk objects and normalize score for the UI
        # Max theoretical RRF score with 2 lists is: (1/(60+1)) + (1/(60+1)) = 2/61 ≈ 0.0327
        # We will normalize to a 0.0 to 1.0 range based on the top theoretical score.
        max_rrf = 2.0 / (k + 1)
        results = []
        for cid in sorted_chunk_ids[:limit]:
            chunk = chunks_map[cid]
            # Normalize RRF score to 0.5 - 0.99 for consistent UI display
            normalized_score = min(0.99, 0.5 + (rrf_scores[cid] / max_rrf) * 0.49)
            results.append((chunk, normalized_score))

        return results

    async def _semantic_search(
        self,
        query: str,
        org_id: uuid.UUID,
        document_scope: list[uuid.UUID] | None = None,
    ) -> list[tuple[Chunk, float]]:
        """Perform pgvector similarity search on chunk embeddings."""
        try:
            # Embed the query
            query_embeddings = await self.embedding_service.get_embeddings([query])
            if not query_embeddings:
                return []
            query_vector = query_embeddings[0]

            # Construct query: join Chunk -> Embedding -> DocumentVersion -> Document
            distance = Embedding.embedding.cosine_distance(query_vector)
            
            stmt = (
                select(Chunk, distance.label("distance"))
                .join(Embedding, Embedding.chunk_id == Chunk.id)
                .join(DocumentVersion, DocumentVersion.id == Chunk.version_id)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(
                    Document.org_id == org_id,
                    Document.deleted_at.is_(None),
                    DocumentVersion.status == "completed"
                )
            )

            if document_scope:
                stmt = stmt.where(Document.id.in_(document_scope))

            # Order by cosine distance ascending (lower distance is more similar)
            stmt = stmt.order_by(sa.asc("distance")).limit(settings.MAX_RETRIEVAL_RESULTS)
            
            res = await self.db.execute(stmt)
            results = res.all()
            
            # Convert to Chunk + similarity score
            return [(row[0], 1.0 - float(row[1])) for row in results]
        except Exception as e:
            # Fallback gracefully if pgvector is not initialized or fails
            import structlog
            structlog.get_logger().error("Semantic search failed", error=str(e))
            return []

    async def _keyword_search(
        self,
        query: str,
        org_id: uuid.UUID,
        document_scope: list[uuid.UUID] | None = None,
    ) -> list[tuple[Chunk, float]]:
        """Perform PostgreSQL full-text keyword search on chunk contents."""
        # Clean query for tsquery compatibility (join words with &)
        words = [w.strip() for w in query.replace("'", "").split() if w.strip()]
        if not words:
            return []
            
        # We can construct a simple websearch or plain match:
        # plainto_tsquery converts string to list of words connected with AND.
        tsquery = func.plainto_tsquery("english", query)
        tsvector = func.to_tsvector("english", Chunk.content)
        
        stmt = (
            select(Chunk, func.ts_rank(tsvector, tsquery).label("rank"))
            .join(DocumentVersion, DocumentVersion.id == Chunk.version_id)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(
                Document.org_id == org_id,
                Document.deleted_at.is_(None),
                DocumentVersion.status == "completed",
                tsvector.op("@@")(tsquery)
            )
        )

        if document_scope:
            stmt = stmt.where(Document.id.in_(document_scope))

        stmt = stmt.order_by(sa.desc("rank")).limit(settings.MAX_RETRIEVAL_RESULTS)
        
        res = await self.db.execute(stmt)
        results = res.all()
        
        return [(row[0], float(row[1])) for row in results]

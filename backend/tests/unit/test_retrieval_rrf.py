import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.retrieval.retrieval import RetrievalService
from app.db.models import Chunk


@pytest.mark.asyncio
async def test_rrf_fusion_logic():
    # Mock database session
    db_mock = MagicMock()
    
    # Create service instance
    service = RetrievalService(db_mock)
    
    # Mock EmbeddingService inside RetrievalService
    service.embedding_service = MagicMock()
    
    # Create mock chunks
    chunk1 = MagicMock(spec=Chunk)
    chunk1.id = 1
    chunk1.content = "This matches both lanes"
    chunk1.meta = {"document_name": "DocA"}
    chunk1.chunk_index = 0

    chunk2 = MagicMock(spec=Chunk)
    chunk2.id = 2
    chunk2.content = "This is semantic only"
    chunk2.meta = {"document_name": "DocB"}
    chunk2.chunk_index = 1

    chunk3 = MagicMock(spec=Chunk)
    chunk3.id = 3
    chunk3.content = "This is keyword only"
    chunk3.meta = {"document_name": "DocC"}
    chunk3.chunk_index = 2
    
    # Mock search results: tuples of (Chunk, rank_score/similarity_score)
    # Ranks:
    # Semantic Search: chunk2 (Rank 1), chunk1 (Rank 2)
    # Keyword Search: chunk1 (Rank 1), chunk3 (Rank 2)
    
    # Setup mocks
    service._semantic_search = AsyncMock(return_value=[
        (chunk2, 0.9),
        (chunk1, 0.8)
    ])
    service._keyword_search = AsyncMock(return_value=[
        (chunk1, 4.5),
        (chunk3, 3.2)
    ])
    
    # Execute retrieval
    results = await service.retrieve_relevant_chunks("query text", org_id=MagicMock(), limit=3)
    
    # Assert RRF results order:
    # chunk1: Rank 2 (semantic) and Rank 1 (keyword).
    #   Score: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 = 0.03252
    # chunk2: Rank 1 (semantic) only.
    #   Score: 1/(60+1) = 1/61 = 0.01639
    # chunk3: Rank 2 (keyword) only.
    #   Score: 1/(60+2) = 1/62 = 0.01613
    
    # Ordered RRF should be: chunk1 first, then chunk2, then chunk3
    assert len(results) == 3
    assert results[0][0].id == 1
    assert results[1][0].id == 2
    assert results[2][0].id == 3
    
    # Verify relevance scores are normalized and sorted descending
    assert results[0][1] > results[1][1]
    assert results[1][1] > results[2][1]

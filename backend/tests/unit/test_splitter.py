import pytest
from app.services.ingestion.splitter import TokenSplitter


def test_token_splitter_basic():
    splitter = TokenSplitter(chunk_size=10, chunk_overlap=2)
    text = "This is a basic sentence to test the token splitter implementation."
    
    # Calculate total tokens
    tokens_count = splitter.count_tokens(text)
    assert tokens_count > 0

    chunks = splitter.split_text(text)
    
    # Assert we have chunks
    assert len(chunks) > 0
    
    # Verify each chunk is under the chunk_size limit
    for chunk in chunks:
        assert splitter.count_tokens(chunk) <= splitter.chunk_size


def test_token_splitter_paragraphs():
    splitter = TokenSplitter(chunk_size=8, chunk_overlap=2)
    text = "Paragraph one.\n\nParagraph two with more words.\n\nParagraph three."
    
    chunks = splitter.split_text(text)
    assert len(chunks) >= 2
    
    # Check that paragraph structure is split nicely on delimiters if possible
    assert any("Paragraph one" in c for c in chunks)
    assert any("Paragraph two" in c for c in chunks)
    assert any("Paragraph three" in c for c in chunks)


def test_token_splitter_empty_text():
    splitter = TokenSplitter(chunk_size=50, chunk_overlap=10)
    assert splitter.split_text("") == []
    assert splitter.split_text("   ") == []


def test_token_splitter_oversized_word():
    splitter = TokenSplitter(chunk_size=5, chunk_overlap=1)
    # This single word/string of tokens will exceed chunk_size
    text = "Supercalifragilisticexpialidocious"
    
    chunks = splitter.split_text(text)
    assert len(chunks) > 0
    for chunk in chunks:
        # Should be forced to split even if no natural separators exist
        assert splitter.count_tokens(chunk) <= splitter.chunk_size

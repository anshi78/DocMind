import asyncio
from typing import Literal
import google.generativeai as genai
import structlog
from openai import AsyncOpenAI

from app.core.config import settings

logger = structlog.get_logger()


def pad_vector(vector: list[float], target_dim: int = 3072) -> list[float]:
    """Pad a vector with zeros to match target dimensions, or truncate if larger."""
    current_dim = len(vector)
    if current_dim < target_dim:
        return vector + [0.0] * (target_dim - current_dim)
    elif current_dim > target_dim:
        return vector[:target_dim]
    return vector


class EmbeddingService:
    def __init__(self, provider: Literal["openai", "gemini"] | None = None):
        self.provider = provider or settings.DEFAULT_EMBEDDING_PROVIDER
        
        # Graceful fallback: if gemini selected but no API key, use openai
        if self.provider == "gemini" and not settings.GEMINI_API_KEY:
            logger.warning("Gemini embedding provider selected but GEMINI_API_KEY is not set. Falling back to OpenAI.")
            self.provider = "openai"
        
        # Initialize OpenAI Client
        self.openai_client = None
        if self.provider == "openai" or settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            
        # Initialize Gemini Client
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of texts using the configured provider.
        Auto-pads all embeddings to 3072 dimensions to match the DB schema.
        """
        if not texts:
            return []

        if self.provider == "openai":
            return await self._get_openai_embeddings(texts)
        elif self.provider == "gemini":
            return await self._get_gemini_embeddings(texts)
        else:
            raise ValueError(f"Unsupported embedding provider: {self.provider}")

    async def _get_openai_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not self.openai_client:
            raise ValueError("OpenAI API key is not configured")
        
        # OpenAI text-embedding-3-small outputs 1536 dimensions
        # text-embedding-3-large outputs 3072 dimensions
        model = settings.OPENAI_EMBEDDING_MODEL
        dimensions = settings.OPENAI_EMBEDDING_DIMENSIONS
        
        # If the model supports dimensions parameter (embedding-3 family), we specify it.
        # But to be safe and match DB exactly, we can request 3072 for text-embedding-3-large,
        # or let the endpoint default and then pad.
        kwargs = {"input": texts, "model": model}
        if "text-embedding-3" in model:
            # We can request the target 3072 dimensions directly from the API if it's large!
            if "large" in model:
                kwargs["dimensions"] = 3072
            else:
                kwargs["dimensions"] = dimensions

        logger.info("Generating OpenAI embeddings", count=len(texts), model=model)
        
        response = await self.openai_client.embeddings.create(**kwargs)
        raw_embeddings = [data.embedding for data in response.data]
        
        return [pad_vector(emb, 3072) for emb in raw_embeddings]

    async def _get_gemini_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not settings.GEMINI_API_KEY:
            raise ValueError("Gemini API key is not configured")
            
        model = settings.GEMINI_EMBEDDING_MODEL
        logger.info("Generating Gemini embeddings", count=len(texts), model=model)
        
        # google-generativeai package calls are blocking, so we execute in a thread pool
        def _embed():
            response = genai.embed_content(
                model=model,
                content=texts,
                task_type="retrieval_document"
            )
            return response.get("embedding", [])

        raw_embeddings = await asyncio.to_thread(_embed)
        
        # If single text embedded, raw_embeddings is a list of floats.
        # If list of texts embedded, raw_embeddings is a list of lists of floats.
        if raw_embeddings and not isinstance(raw_embeddings[0], list):
            raw_embeddings = [raw_embeddings]
            
        return [pad_vector(emb, 3072) for emb in raw_embeddings]

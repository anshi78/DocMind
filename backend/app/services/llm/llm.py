import asyncio
from typing import AsyncGenerator, Literal
import google.generativeai as genai
import structlog
from openai import AsyncOpenAI

from app.core.config import settings

logger = structlog.get_logger()


class LLMService:
    def __init__(self, provider: Literal["openai", "gemini"] | None = None):
        self.provider = provider or settings.DEFAULT_LLM_PROVIDER
        
        # Graceful fallback: if gemini selected but no API key, use openai
        if self.provider == "gemini" and not settings.GEMINI_API_KEY:
            logger.warning("Gemini LLM provider selected but GEMINI_API_KEY is not set. Falling back to OpenAI.")
            self.provider = "openai"
        
        # Initialize OpenAI Client
        self.openai_client = None
        if self.provider == "openai" or settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            
        # Initialize Gemini Client
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)

    async def stream_chat(
        self,
        system_instruction: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completions from the configured LLM provider.
        """
        if self.provider == "openai":
            async for chunk in self._stream_openai(system_instruction, user_message, history):
                yield chunk
        elif self.provider == "gemini":
            async for chunk in self._stream_gemini(system_instruction, user_message, history):
                yield chunk
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    async def _stream_openai(
        self,
        system_instruction: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        if not self.openai_client:
            raise ValueError("OpenAI API key is not configured")

        messages = [{"role": "system", "content": system_instruction}]
        
        if history:
            for msg in history:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
                
        messages.append({"role": "user", "content": user_message})
        
        model = settings.OPENAI_CHAT_MODEL
        logger.info("Streaming OpenAI chat response", model=model)
        
        response = await self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            temperature=0.2,
        )
        
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_gemini(
        self,
        system_instruction: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        if not settings.GEMINI_API_KEY:
            raise ValueError("Gemini API key is not configured")

        model_name = settings.GEMINI_CHAT_MODEL
        logger.info("Streaming Gemini chat response", model=model_name)

        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction
        )

        # Build contents structure for Gemini (history + current query)
        contents = []
        if history:
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [msg["content"]]
                })
        contents.append({"role": "user", "parts": [user_message]})

        # Run synchronous generation stream in a thread pool to avoid blocking the async loop
        def _generate():
            return model.generate_content(contents=contents, stream=True)

        response = await asyncio.to_thread(_generate)
        
        for chunk in response:
            try:
                text = chunk.text
                if text:
                    yield text
            except Exception as e:
                logger.warning("Error reading Gemini chunk text", error=str(e))
                continue

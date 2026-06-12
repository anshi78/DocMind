from functools import lru_cache
from typing import Literal
from pydantic import AnyHttpUrl, EmailStr, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "DocuMind"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    SECRET_KEY: str
    ALLOWED_HOSTS: list[str] = ["*"]

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    # Database
    DATABASE_URL: str | None = None
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "documind"
    POSTGRES_PASSWORD: str = "documind"
    POSTGRES_DB: str = "documind"

    @computed_field
    @property
    def db_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://"
            )
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field
    @property
    def db_url_sync(self) -> str:
        return self.db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 20

    # Auth
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    API_KEY_PREFIX: str = "dm_live_"

    # AI
    OPENAI_API_KEY: str
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str | None = None
    GEMINI_EMBEDDING_MODEL: str = "models/text-embedding-004"
    GEMINI_EMBEDDING_DIMENSIONS: int = 768
    GEMINI_CHAT_MODEL: str = "gemini-1.5-flash"
    DEFAULT_EMBEDDING_PROVIDER: Literal["openai", "gemini"] = "openai"
    DEFAULT_LLM_PROVIDER: Literal["openai", "gemini"] = "openai"

    @model_validator(mode="after")
    def validate_provider_keys(self) -> "Settings":
        """Ensure required API keys are present for the selected AI providers."""
        import warnings
        if self.DEFAULT_EMBEDDING_PROVIDER == "gemini" and not self.GEMINI_API_KEY:
            warnings.warn(
                "DEFAULT_EMBEDDING_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. "
                "Falling back to 'openai'.",
                stacklevel=2,
            )
            object.__setattr__(self, "DEFAULT_EMBEDDING_PROVIDER", "openai")
        if self.DEFAULT_LLM_PROVIDER == "gemini" and not self.GEMINI_API_KEY:
            warnings.warn(
                "DEFAULT_LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set. "
                "Falling back to 'openai'.",
                stacklevel=2,
            )
            object.__setattr__(self, "DEFAULT_LLM_PROVIDER", "openai")
        return self

    # RAG
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    MAX_RETRIEVAL_RESULTS: int = 20
    FINAL_CONTEXT_CHUNKS: int = 8
    MAX_CONTEXT_TOKENS: int = 6000
    EMBEDDING_BATCH_SIZE: int = 100

    # Storage
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_PATH: str = "./data/uploads"
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_S3_BUCKET: str | None = None
    AWS_S3_REGION: str = "us-east-1"
    MAX_FILE_SIZE_MB: int = 50

    @computed_field
    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    # Billing
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None

    # Email
    SENDGRID_API_KEY: str | None = None
    EMAIL_FROM: str = "noreply@documind.ai"
    EMAIL_FROM_NAME: str = "DocuMind"

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Monitoring
    SENTRY_DSN: str | None = None
    LOG_LEVEL: str = "INFO"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

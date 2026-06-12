import os
from pathlib import Path

import structlog

from app.core.config import settings

logger = structlog.get_logger()


class StorageService:
    def __init__(self):
        self.base_path = Path(settings.STORAGE_LOCAL_PATH)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def upload(self, key: str, content: bytes, content_type: str) -> str:
        file_path = self.base_path / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)
        logger.info("File uploaded", key=key, size=len(content))
        return key

    async def download(self, key: str) -> bytes:
        file_path = self.base_path / key
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {key}")
        return file_path.read_bytes()

    async def delete(self, key: str) -> None:
        file_path = self.base_path / key
        if file_path.exists():
            file_path.unlink()
            logger.info("File deleted", key=key)

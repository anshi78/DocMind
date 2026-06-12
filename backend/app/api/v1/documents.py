import io
import os
import uuid
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import pypdf
import structlog

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError, FileTooLargeError, UnsupportedFileTypeError, InsufficientPlanError
from app.api.deps import get_db, get_current_user, get_current_org
from app.db.base import AsyncSessionLocal
from app.db.models import User, Organization, Document, DocumentVersion, Chunk, Embedding
from app.services.storage.local import StorageService
from app.services.ingestion.splitter import TokenSplitter
from app.services.embeddings.embeddings import EmbeddingService
from app.services.billing.billing_service import BillingService

logger = structlog.get_logger()
router = APIRouter()
storage_service = StorageService()

# Pydantic Schemas
class DocumentVersionResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version_num: int
    storage_key: str
    size_bytes: int
    status: str
    error_message: str | None
    meta: dict
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    extension: str
    created_at: datetime
    updated_at: datetime
    latest_version: DocumentVersionResponse | None = None

    class Config:
        from_attributes = True


async def get_latest_version(doc: Document) -> DocumentVersionResponse | None:
    if not doc.versions:
        return None
    latest = max(doc.versions, key=lambda v: v.version_num)
    return DocumentVersionResponse.model_validate(latest)


async def process_document_bg(doc_id: uuid.UUID, version_id: uuid.UUID):
    """
    Background task to process the uploaded file, chunk it, generate mock embeddings,
    and save them to the database.
    """
    db: AsyncSession = AsyncSessionLocal()
    try:
        # 1. Fetch the version
        result = await db.execute(
            select(DocumentVersion)
            .options(selectinload(DocumentVersion.document))
            .where(DocumentVersion.id == version_id)
        )
        version = result.scalars().first()
        if not version:
            logger.error("Document version not found in background processing", version_id=str(version_id))
            return

        version.status = "processing"
        await db.commit()

        # 2. Download content from storage
        file_bytes = await storage_service.download(version.storage_key)
        
        # 3. Extract text
        text = ""
        ext = version.document.extension.lower()
        if ext == "pdf":
            try:
                pdf_file = io.BytesIO(file_bytes)
                reader = pypdf.PdfReader(pdf_file)
                text_parts = []
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                text = "\n\n".join(text_parts)
            except Exception as pdf_err:
                raise ValidationError(f"Failed to parse PDF document: {str(pdf_err)}")
        elif ext in ["md", "markdown"]:
            text = file_bytes.decode("utf-8", errors="ignore")
        else:
            text = file_bytes.decode("utf-8", errors="ignore")

        if not text.strip():
            raise ValidationError("Document does not contain any readable text")

        # 4. Chunking
        splitter = TokenSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP
        )
        chunks = splitter.split_text(text)

        if not chunks:
            raise ValidationError("No readable chunks extracted from the document.")

        # 5. Generate embeddings in batches
        embedding_service = EmbeddingService()
        embeddings = []
        
        batch_size = settings.EMBEDDING_BATCH_SIZE
        for idx in range(0, len(chunks), batch_size):
            batch_texts = chunks[idx : idx + batch_size]
            batch_embs = await embedding_service.get_embeddings(batch_texts)
            embeddings.extend(batch_embs)

        # 6. Insert chunks & embeddings
        for i, (chunk_content, emb_vector) in enumerate(zip(chunks, embeddings)):
            db_chunk = Chunk(
                version_id=version.id,
                chunk_index=i,
                content=chunk_content,
                meta={"document_name": version.document.name},
            )
            db.add(db_chunk)
            await db.flush() # Populate chunk ID

            db_embedding = Embedding(
                chunk_id=db_chunk.id,
                model=embedding_service.provider,
                dimensions=3072,
                embedding=emb_vector,
            )
            db.add(db_embedding)

        # 7. Update status
        version.status = "completed"
        version.error_message = None
        await db.commit()
        logger.info("Document processed successfully in background", doc_id=str(doc_id))

    except Exception as e:
        logger.exception("Failed to process document in background", version_id=str(version_id))
        try:
            # Re-fetch version inside rollback handler to mark it failed safely
            result = await db.execute(select(DocumentVersion).where(DocumentVersion.id == version_id))
            version = result.scalars().first()
            if version:
                version.status = "failed"
                version.error_message = str(e)
                await db.commit()
        except Exception as commit_err:
            logger.error("Failed to update status to failed", err=str(commit_err))
    finally:
        await db.close()


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.org_id == org.id, Document.deleted_at.is_(None))
    )
    docs = result.scalars().all()
    
    responses = []
    for doc in docs:
        latest = await get_latest_version(doc)
        responses.append(
            DocumentResponse(
                id=doc.id,
                org_id=doc.org_id,
                name=doc.name,
                extension=doc.extension,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
                latest_version=latest,
            )
        )
    return responses


@router.post("", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    # 1. Validate File type
    filename = file.filename or "uploaded_file"
    _, ext = os.path.splitext(filename)
    ext = ext.lstrip(".").lower()
    
    if ext not in ["pdf", "md", "markdown"]:
        raise UnsupportedFileTypeError(file.content_type or f"application/{ext}")

    # Enforce plan limits before accepting upload
    await BillingService.enforce_limit(db, org, "max_documents")
    await BillingService.enforce_limit(db, org, "max_storage_mb")

    # Read file content for sizing check
    content = await file.read()
    size_bytes = len(content)
    max_bytes = settings.max_file_size_bytes
    if size_bytes > max_bytes:
        raise FileTooLargeError(size_bytes, max_bytes)

    # 2. Check if document with same name exists under organization
    result = await db.execute(
        select(Document)
        .where(Document.org_id == org.id, Document.name == filename, Document.deleted_at.is_(None))
    )
    doc = result.scalars().first()
    
    version_num = 1
    if doc:
        # Update existing document version number
        v_result = await db.execute(
            select(DocumentVersion).where(DocumentVersion.document_id == doc.id)
        )
        versions = v_result.scalars().all()
        if versions:
            version_num = max(v.version_num for v in versions) + 1
    else:
        # Create new document record
        doc = Document(
            org_id=org.id,
            name=filename,
            extension=ext,
        )
        db.add(doc)
        await db.flush() # Populate doc ID

    # 3. Save to storage
    storage_key = f"{org.id}/{doc.id}/v{version_num}/{filename}"
    await storage_service.upload(storage_key, content, file.content_type or "application/octet-stream")

    # 4. Create DocumentVersion record
    version = DocumentVersion(
        document_id=doc.id,
        version_num=version_num,
        storage_key=storage_key,
        size_bytes=size_bytes,
        status="pending",
        meta={"user_id": str(current_user.id), "document_name": filename},
    )
    db.add(version)
    
    await db.commit()
    await db.refresh(doc)
    await db.refresh(version)

    # 5. Add process background task
    background_tasks.add_task(process_document_bg, doc.id, version.id)

    latest_response = DocumentVersionResponse.model_validate(version)
    return DocumentResponse(
        id=doc.id,
        org_id=doc.org_id,
        name=doc.name,
        extension=doc.extension,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        latest_version=latest_response,
    )


class SearchResultItem(BaseModel):
    chunk_id: uuid.UUID
    document_name: str
    content: str
    relevance_score: float
    chunk_index: int


@router.get("/search", response_model=list[SearchResultItem])
async def search_documents(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    from app.services.retrieval.retrieval import RetrievalService
    
    retrieval_service = RetrievalService(db)
    matched_chunks = await retrieval_service.retrieve_relevant_chunks(
        query=q,
        org_id=org.id,
        limit=10,
    )
    
    results = []
    for chunk, relevance_score in matched_chunks:
        results.append(
            SearchResultItem(
                chunk_id=chunk.id,
                document_name=chunk.meta.get("document_name", "Unknown"),
                content=chunk.content,
                relevance_score=relevance_score,
                chunk_index=chunk.chunk_index
            )
        )
    return results


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == id, Document.org_id == org.id, Document.deleted_at.is_(None))
    )
    doc = result.scalars().first()
    if not doc:
        raise NotFoundError("Document", str(id))

    # Soft delete the document
    doc.deleted_at = datetime.utcnow()
    
    # Delete version files from storage in background/synchronously
    for version in doc.versions:
        try:
            await storage_service.delete(version.storage_key)
        except Exception as err:
            logger.error("Failed to delete storage file", key=version.storage_key, err=str(err))

    await db.commit()
    return None

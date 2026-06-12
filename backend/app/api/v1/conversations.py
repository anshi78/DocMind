from app.db.base import AsyncSessionLocal
import asyncio
import json
import time
import uuid
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import httpx
import structlog

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError, AuthorizationError, InsufficientPlanError
from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import User, Organization, Conversation, Message, Citation, Chunk, Document, DocumentVersion, UsageEvent
from app.services.retrieval.retrieval import RetrievalService
from app.services.llm.llm import LLMService
from app.services.billing.billing_service import BillingService

logger = structlog.get_logger()
router = APIRouter()

# Pydantic Schemas
class ConversationCreate(BaseModel):
    title: str | None = None
    document_scope: list[uuid.UUID] | None = None

class ConversationResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    document_scope: list[uuid.UUID] | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CitationChunkResponse(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    chunk_index: int
    content: str
    meta: dict

    class Config:
        from_attributes = True

class CitationResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    chunk_id: uuid.UUID
    relevance_score: float
    position: int
    chunk: CitationChunkResponse | None = None

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    model: str | None = None
    tokens_input: int | None = None
    tokens_output: int | None = None
    latency_ms: int | None = None
    from_cache: bool = False
    created_at: datetime
    citations: list[CitationResponse] = []

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    role: str
    content: str

class StreamInput(BaseModel):
    content: str


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.org_id == org.id,
            Conversation.user_id == current_user.id,
            Conversation.deleted_at.is_(None)
        )
        .order_by(Conversation.created_at.desc())
    )
    conversations = result.scalars().all()
    return [ConversationResponse.model_validate(c) for c in conversations]


@router.post("", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    conversation = Conversation(
        org_id=org.id,
        user_id=current_user.id,
        title=data.title or "New Chat",
        document_scope=data.document_scope,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return ConversationResponse.model_validate(conversation)


@router.get("/{id}", response_model=ConversationResponse)
async def get_conversation(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.id == id,
            Conversation.org_id == org.id,
            Conversation.user_id == current_user.id,
            Conversation.deleted_at.is_(None)
        )
    )
    conversation = result.scalars().first()
    if not conversation:
        raise NotFoundError("Conversation", str(id))
    return ConversationResponse.model_validate(conversation)


@router.get("/{id}/messages", response_model=list[MessageResponse])
async def get_messages(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    # Verify conversation permissions
    c_result = await db.execute(
        select(Conversation).where(
            Conversation.id == id,
            Conversation.org_id == org.id,
            Conversation.user_id == current_user.id
        )
    )
    if not c_result.scalars().first():
        raise NotFoundError("Conversation", str(id))

    # Retrieve messages with citations and chunks
    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.citations)
            .selectinload(Citation.chunk)
        )
        .where(Message.conversation_id == id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    
    return [MessageResponse.model_validate(m) for m in messages]


@router.post("/{id}/messages", response_model=MessageResponse)
async def add_message(
    id: uuid.UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    # Verify conversation
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == id,
            Conversation.org_id == org.id,
            Conversation.user_id == current_user.id
        )
    )
    conv = result.scalars().first()
    if not conv:
        raise NotFoundError("Conversation", str(id))

    # Save user message
    db_msg = Message(
        conversation_id=id,
        role=data.role,
        content=data.content,
    )
    db.add(db_msg)
    await db.commit()
    await db.refresh(db_msg)

    # Return user message (citations will be empty for user message)
    return MessageResponse(
        id=db_msg.id,
        conversation_id=db_msg.conversation_id,
        role=db_msg.role,
        content=db_msg.content,
        created_at=db_msg.created_at,
        citations=[]
    )


@router.post("/{id}/chat/stream")
async def stream_chat_response(
    id: uuid.UUID,
    data: StreamInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    # 1. Verify conversation
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == id,
            Conversation.org_id == org.id,
            Conversation.user_id == current_user.id
        )
    )
    conv = conv_result.scalars().first()
    if not conv:
        raise NotFoundError("Conversation", str(id))

    # Enforce monthly query limit before executing LLM call
    try:
        await BillingService.enforce_limit(db, org, "max_queries_per_month")
    except InsufficientPlanError:
        raise

    # Update conversation title if default
    if conv.title == "New Chat" or conv.title == "New Chat...":
        conv.title = data.content[:40] + "..."
        await db.commit()

    # 2. Retrieve context from documents using RetrievalService
    retrieval_service = RetrievalService(db)
    retrieved_results = []
    
    # Check if there are completed document versions under organization
    doc_query = select(Document.id).where(Document.org_id == org.id, Document.deleted_at.is_(None))
    if conv.document_scope:
        doc_query = doc_query.where(Document.id.in_(conv.document_scope))
    
    doc_ids_res = await db.execute(doc_query)
    doc_ids = doc_ids_res.scalars().all()
    
    if doc_ids:
        retrieved_results = await retrieval_service.retrieve_relevant_chunks(
            query=data.content,
            org_id=org.id,
            document_scope=doc_ids,
            limit=settings.FINAL_CONTEXT_CHUNKS,
        )

    # Create generator to stream SSE response
    async def sse_generator():
        start_time = time.time()
        
        # Build prompt using context
        context_str = ""
        if retrieved_results:
            context_str = "\n\n".join(
                f"Source [{idx}]: (Document: {c.meta.get('document_name', 'Unknown')})\n{c.content}"
                for idx, (c, score) in enumerate(retrieved_results, 1)
            )
            
        system_prompt = (
            "You are DocuMind Assistant, a highly precise Retrieval-Augmented Generation (RAG) assistant.\n"
            "Your goal is to answer the user's questions truthfully and accurately, relying ONLY on the provided Context source passages.\n"
            "If the provided Context does not contain the answer or is empty, state clearly that you cannot find the answer in the uploaded documents.\n"
            "For any factual statements you make, you MUST cite the source using the exact format [idx] corresponding to the source passage index (e.g. [1], [2]).\n"
            "Do not combine citations (e.g. write [1][2] instead of [1,2]). Do not cite sources that do not exist or were not used.\n\n"
            f"--- Context ---\n{context_str}\n--- End Context ---"
        )
        
        # Retrieve past conversation messages for chat history context
        hist_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == id)
            .order_by(Message.created_at.asc())
            .limit(10)
        )
        past_messages = hist_result.scalars().all()
        history = [{"role": msg.role, "content": msg.content} for msg in past_messages]

        full_reply = ""
        llm_service = LLMService()

        try:
            async for chunk in llm_service.stream_chat(system_prompt, data.content, history):
                full_reply += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        except Exception as llm_err:
            logger.exception("LLM generation stream failed", error=str(llm_err))
            error_msg = "\n\n[Error: Connection to AI generation service was interrupted.]"
            full_reply += error_msg
            yield f"data: {json.dumps({'content': error_msg})}\n\n"

        # Calculate token counts
        try:
            import tiktoken
            enc = tiktoken.get_encoding("cl100k_base")
            tokens_in = len(enc.encode(system_prompt)) + len(enc.encode(data.content))
            tokens_out = len(enc.encode(full_reply))
        except Exception:
            tokens_in = len(system_prompt) // 4
            tokens_out = len(full_reply) // 4

        # Parse citations used in the reply text
        import re
        cited_indices = set(int(num) for num in re.findall(r"\[(\d+)\]", full_reply))

        # Save assistant message to DB
        async with AsyncSessionLocal() as write_db:
            db_msg = Message(
                conversation_id=id,
                role="assistant",
                content=full_reply,
                model=settings.DEFAULT_LLM_PROVIDER,
                latency_ms=int((time.time() - start_time) * 1000),
                tokens_input=tokens_in,
                tokens_output=tokens_out,
            )
            write_db.add(db_msg)
            await write_db.flush() # Populate msg ID
            
            # Save Citations that were actually referenced in the response
            for idx, (c, score) in enumerate(retrieved_results, 1):
                if idx in cited_indices:
                    citation = Citation(
                        message_id=db_msg.id,
                        chunk_id=c.id,
                        relevance_score=score,
                        position=idx,
                    )
                    write_db.add(citation)
            # Record usage event for cost tracking
            # Gemini free tier = $0, OpenAI GPT-4o-mini: $0.15/M input, $0.60/M output
            if settings.DEFAULT_LLM_PROVIDER == "gemini":
                cost_micro = 0
            else:
                cost_micro = int((tokens_in * 0.15 + tokens_out * 0.6) / 1000 * 1_000_000)
            usage_event = UsageEvent(
                org_id=org.id,
                user_id=current_user.id,
                event_type="chat_query",
                model=settings.DEFAULT_LLM_PROVIDER,
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                cost_microdollars=cost_micro,
                ref_id=db_msg.id,
                ref_type="message",
            )
            write_db.add(usage_event)
            await write_db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

import secrets
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import User, Organization, WebhookEndpoint
from app.services.billing.billing_service import BillingService

router = APIRouter()


# Webhook Endpoint Pydantic Schemas
class WebhookEndpointCreate(BaseModel):
    url: str
    events: list[str] = ["document.processed", "document.failed", "chat.message_created"]


class WebhookEndpointResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    url: str
    secret: str
    events: list[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
):
    """Handle incoming Stripe events securely."""
    if not stripe_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stripe-Signature header is missing"
        )
    
    # Stripe verification requires the raw byte body
    payload = await request.body()
    
    try:
        await BillingService.handle_stripe_webhook(db, payload, stripe_signature)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Webhook handling error: {str(e)}"
        )
        
    return {"status": "success"}


@router.post("/endpoints", response_model=WebhookEndpointResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook_endpoint(
    data: WebhookEndpointCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Create a new outbound webhook endpoint for the organization."""
    # Generate 64-char hex signing secret (32 bytes)
    secret = secrets.token_hex(32)
    
    endpoint = WebhookEndpoint(
        org_id=org.id,
        url=str(data.url),
        secret=secret,
        events=data.events,
        is_active=True,
    )
    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)
    return endpoint


@router.get("/endpoints", response_model=list[WebhookEndpointResponse])
async def list_webhook_endpoints(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """List webhook endpoints for the organization."""
    result = await db.execute(select(WebhookEndpoint).where(WebhookEndpoint.org_id == org.id))
    return result.scalars().all()


@router.delete("/endpoints/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook_endpoint(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Delete an organization webhook endpoint."""
    result = await db.execute(
        select(WebhookEndpoint).where(WebhookEndpoint.id == id, WebhookEndpoint.org_id == org.id)
    )
    endpoint = result.scalars().first()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook endpoint not found")
        
    await db.delete(endpoint)
    await db.commit()
    return None

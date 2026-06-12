import uuid
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import stripe
import structlog

from app.core.config import settings
from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import (
    User, Organization, Plan, Subscription,
    Document, DocumentVersion, OrgMembership, UsageEvent,
)
from app.services.billing.billing_service import BillingService

logger = structlog.get_logger()
router = APIRouter()
stripe.api_key = settings.STRIPE_SECRET_KEY


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    stripe_price_id: str | None
    max_documents: int
    max_queries_per_month: int
    max_storage_mb: int
    max_members: int
    features: dict
    is_active: bool

    class Config:
        from_attributes = True


class CheckoutInput(BaseModel):
    plan_id: uuid.UUID
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutResponse(BaseModel):
    checkout_url: str


class UsageResponse(BaseModel):
    plan_name: str
    # Limits from plan
    max_documents: int
    max_queries_per_month: int
    max_storage_mb: int
    max_members: int
    # Current usage
    current_documents: int
    current_queries_this_month: int
    current_storage_mb: float
    current_members: int


class PortalResponse(BaseModel):
    portal_url: str


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    """List all active subscription plans."""
    result = await db.execute(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.max_storage_mb.asc()))
    plans = result.scalars().all()
    return plans


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    data: CheckoutInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Create a Stripe Checkout Session for a plan subscription."""
    checkout_url = await BillingService.create_checkout_session(
        db=db,
        org=org,
        user=current_user,
        plan_id=data.plan_id,
        success_url=data.success_url,
        cancel_url=data.cancel_url,
    )
    return CheckoutResponse(checkout_url=checkout_url)


@router.get("/usage", response_model=UsageResponse)
async def get_usage_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Return real-time usage metrics for the current organization against their plan limits."""
    # Resolve active plan
    sub_res = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.org_id == org.id)
    )
    subscription = sub_res.scalars().first()

    if subscription and subscription.plan:
        plan = subscription.plan
    else:
        # Fall back to Free plan
        free_res = await db.execute(select(Plan).where(Plan.name == "Free"))
        plan = free_res.scalars().first()
        if not plan:
            plan = Plan(name="Free", max_documents=5, max_queries_per_month=50, max_storage_mb=50, max_members=2, features={})

    # Current document count
    doc_count = (
        await db.execute(
            select(func.count(Document.id)).where(Document.org_id == org.id, Document.deleted_at.is_(None))
        )
    ).scalar() or 0

    # Current storage usage in bytes
    storage_bytes = (
        await db.execute(
            select(func.coalesce(func.sum(DocumentVersion.size_bytes), 0))
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(Document.org_id == org.id, Document.deleted_at.is_(None))
        )
    ).scalar() or 0

    # Current member count
    member_count = (
        await db.execute(
            select(func.count(OrgMembership.id)).where(OrgMembership.org_id == org.id)
        )
    ).scalar() or 0

    # Current month query count
    month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if subscription and subscription.current_period_start:
        month_start = subscription.current_period_start

    query_count = (
        await db.execute(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.org_id == org.id,
                UsageEvent.event_type == "chat_query",
                UsageEvent.created_at >= month_start,
            )
        )
    ).scalar() or 0

    return UsageResponse(
        plan_name=plan.name,
        max_documents=plan.max_documents,
        max_queries_per_month=plan.max_queries_per_month,
        max_storage_mb=plan.max_storage_mb,
        max_members=plan.max_members,
        current_documents=doc_count,
        current_queries_this_month=query_count,
        current_storage_mb=round(storage_bytes / (1024 * 1024), 2),
        current_members=member_count,
    )


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Create a Stripe Customer Portal session for managing an existing subscription."""
    if not settings.STRIPE_SECRET_KEY:
        from app.core.exceptions import ValidationError
        raise ValidationError("Stripe is not configured in this environment")

    if not org.stripe_customer_id:
        from app.core.exceptions import ValidationError
        raise ValidationError("No Stripe customer linked to this organization. Subscribe to a paid plan first.")

    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id,
        return_url=f"{settings.CORS_ORIGINS[0]}/settings?tab=billing" if settings.CORS_ORIGINS else "http://localhost:3000/settings?tab=billing",
    )
    return PortalResponse(portal_url=session.url)


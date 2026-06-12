import uuid
from datetime import datetime, UTC
from typing import Literal
import stripe
import structlog
from sqlalchemy import func
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import InsufficientPlanError, NotFoundError, ValidationError
from app.db.models import Organization, Plan, Subscription, Document, DocumentVersion, OrgMembership, UsageEvent, User

logger = structlog.get_logger()
stripe.api_key = settings.STRIPE_SECRET_KEY


class BillingService:
    @staticmethod
    async def create_checkout_session(
        db: AsyncSession,
        org: Organization,
        user: User,
        plan_id: uuid.UUID,
        success_url: str | None = None,
        cancel_url: str | None = None,
    ) -> str:
        """Create a Stripe checkout session for subscribing to a plan."""
        # Retrieve plan
        result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.is_active.is_(True)))
        plan = result.scalars().first()
        if not plan:
            raise NotFoundError("Plan", str(plan_id))
            
        if not plan.stripe_price_id:
            raise ValidationError("Free plan cannot be subscribed to via Stripe checkout")

        if not settings.STRIPE_SECRET_KEY:
            raise ValidationError("Stripe is not configured in this environment")

        success_url = success_url or "http://localhost:3000/dashboard/billing?success=true"
        cancel_url = cancel_url or "http://localhost:3000/dashboard/billing?canceled=true"

        # Construct stripe session configuration
        session_kwargs = {
            "payment_method_types": ["card"],
            "line_items": [{
                "price": plan.stripe_price_id,
                "quantity": 1,
            }],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": str(org.id),
            "metadata": {
                "org_id": str(org.id),
                "user_id": str(user.id),
                "plan_id": str(plan.id),
            }
        }

        # Use existing stripe customer if available
        if org.stripe_customer_id:
            session_kwargs["customer"] = org.stripe_customer_id
        else:
            session_kwargs["customer_email"] = user.email

        session = stripe.checkout.Session.create(**session_kwargs)
        return session.url

    @staticmethod
    async def handle_stripe_webhook(db: AsyncSession, payload: dict, sig_header: str) -> None:
        """Handle incoming Stripe events (subscriptions, payments, upgrades)."""
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ValidationError("Stripe Webhook Secret is not configured")

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except Exception as e:
            logger.error("Failed to verify Stripe signature", error=str(e))
            raise ValidationError(f"Invalid Stripe Webhook payload: {str(e)}")

        event_type = event["type"]
        data_obj = event["data"]["object"]
        
        logger.info("Handling Stripe Webhook Event", type=event_type)

        if event_type == "checkout.session.completed":
            await BillingService._handle_checkout_completed(db, data_obj)
        elif event_type in ["customer.subscription.created", "customer.subscription.updated"]:
            await BillingService._handle_subscription_updated(db, data_obj)
        elif event_type == "customer.subscription.deleted":
            await BillingService._handle_subscription_deleted(db, data_obj)

    @staticmethod
    async def _handle_checkout_completed(db: AsyncSession, session: dict) -> None:
        org_id_str = session["metadata"].get("org_id")
        plan_id_str = session["metadata"].get("plan_id")
        stripe_cust_id = session.get("customer")
        
        if not org_id_str or not plan_id_str:
            return

        org_uuid = uuid.UUID(org_id_str)
        plan_uuid = uuid.UUID(plan_id_str)
        
        # Save stripe customer ID to organization
        result = await db.execute(select(Organization).where(Organization.id == org_uuid))
        org = result.scalars().first()
        if org:
            org.stripe_customer_id = stripe_cust_id
            await db.commit()

    @staticmethod
    async def _handle_subscription_updated(db: AsyncSession, stripe_sub: dict) -> None:
        stripe_cust_id = stripe_sub.get("customer")
        stripe_sub_id = stripe_sub.get("id")
        status = stripe_sub.get("status")
        price_id = stripe_sub["items"]["data"][0]["price"]["id"]
        
        # Resolve plan based on Stripe Price ID
        plan_res = await db.execute(select(Plan).where(Plan.stripe_price_id == price_id))
        plan = plan_res.scalars().first()
        if not plan:
            logger.error("No plan matching Stripe Price ID found", price_id=price_id)
            return

        # Resolve organization by Stripe Customer ID or Client Reference
        org_res = await db.execute(select(Organization).where(Organization.stripe_customer_id == stripe_cust_id))
        org = org_res.scalars().first()
        if not org:
            logger.error("Organization not found for customer ID", stripe_customer_id=stripe_cust_id)
            return

        # Create/Update subscription
        sub_res = await db.execute(select(Subscription).where(Subscription.org_id == org.id))
        sub = sub_res.scalars().first()

        period_start = datetime.fromtimestamp(stripe_sub.get("current_period_start"), UTC)
        period_end = datetime.fromtimestamp(stripe_sub.get("current_period_end"), UTC)
        
        cancel_at = stripe_sub.get("cancel_at")
        cancel_at_dt = datetime.fromtimestamp(cancel_at, UTC) if cancel_at else None

        if sub:
            sub.plan_id = plan.id
            sub.stripe_subscription_id = stripe_sub_id
            sub.stripe_customer_id = stripe_cust_id
            sub.status = status
            sub.current_period_start = period_start
            sub.current_period_end = period_end
            sub.cancel_at = cancel_at_dt
        else:
            sub = Subscription(
                org_id=org.id,
                plan_id=plan.id,
                stripe_subscription_id=stripe_sub_id,
                stripe_customer_id=stripe_cust_id,
                status=status,
                current_period_start=period_start,
                current_period_end=period_end,
                cancel_at=cancel_at_dt,
            )
            db.add(sub)

        await db.commit()
        logger.info("Subscription created/updated in DB", org_id=str(org.id), plan=plan.name, status=status)

    @staticmethod
    async def _handle_subscription_deleted(db: AsyncSession, stripe_sub: dict) -> None:
        stripe_sub_id = stripe_sub.get("id")
        
        # Retrieve subscription
        sub_res = await db.execute(
            select(Subscription)
            .options(selectinload(Subscription.org))
            .where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        sub = sub_res.scalars().first()
        if not sub:
            return

        # Downgrade organization to Free plan
        free_plan_res = await db.execute(select(Plan).where(Plan.name == "Free"))
        free_plan = free_plan_res.scalars().first()
        
        if free_plan:
            sub.plan_id = free_plan.id
            sub.stripe_subscription_id = None
            sub.status = "canceled"
            sub.cancel_at = None
            sub.canceled_at = datetime.now(UTC)
            await db.commit()
            logger.info("Subscription deleted, organization downgraded to Free", org_id=str(sub.org_id))

    @staticmethod
    async def enforce_limit(
        db: AsyncSession,
        org: Organization,
        limit_type: Literal["max_documents", "max_queries_per_month", "max_storage_mb", "max_members"]
    ) -> None:
        """Enforce database-level plan limit for the given organization."""
        # Fetch organization with subscription and plan
        sub_res = await db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.org_id == org.id)
        )
        subscription = sub_res.scalars().first()
        
        # If no subscription, assume Free plan
        if not subscription:
            free_plan_res = await db.execute(select(Plan).where(Plan.name == "Free"))
            plan = free_plan_res.scalars().first()
            if not plan:
                # Fallback in case seeds didn't run
                plan = Plan(name="Free", max_documents=5, max_queries_per_month=50, max_storage_mb=50, max_members=2)
        else:
            plan = subscription.plan

        allowed_limit = getattr(plan, limit_type)

        if limit_type == "max_documents":
            doc_res = await db.execute(
                select(func.count(Document.id)).where(Document.org_id == org.id, Document.deleted_at.is_(None))
            )
            current_count = doc_res.scalar() or 0
            if current_count >= allowed_limit:
                raise InsufficientPlanError(
                    f"Plan document limit exceeded ({current_count}/{allowed_limit}). Please upgrade your plan."
                )

        elif limit_type == "max_members":
            mem_res = await db.execute(
                select(func.count(OrgMembership.id)).where(OrgMembership.org_id == org.id)
            )
            current_count = mem_res.scalar() or 0
            if current_count >= allowed_limit:
                raise InsufficientPlanError(
                    f"Plan member limit exceeded ({current_count}/{allowed_limit}). Please upgrade your plan."
                )

        elif limit_type == "max_storage_mb":
            storage_res = await db.execute(
                select(func.sum(DocumentVersion.size_bytes))
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(Document.org_id == org.id, Document.deleted_at.is_(None))
            )
            current_bytes = storage_res.scalar() or 0
            current_mb = current_bytes / (1024 * 1024)
            if current_mb >= allowed_limit:
                raise InsufficientPlanError(
                    f"Plan storage limit exceeded ({current_mb:.1f}MB/{allowed_limit}MB). Please upgrade your plan."
                )

        elif limit_type == "max_queries_per_month":
            # Count usage events (event_type = "chat_query") in the current month/billing period
            start_date = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if subscription and subscription.current_period_start:
                # Align with actual billing period start if present
                start_date = subscription.current_period_start
                
            query_res = await db.execute(
                select(func.count(UsageEvent.id))
                .where(
                    UsageEvent.org_id == org.id,
                    UsageEvent.event_type == "chat_query",
                    UsageEvent.created_at >= start_date
                )
            )
            current_count = query_res.scalar() or 0
            if current_count >= allowed_limit:
                raise InsufficientPlanError(
                    f"Plan monthly query limit reached ({current_count}/{allowed_limit}). Please upgrade your plan."
                )

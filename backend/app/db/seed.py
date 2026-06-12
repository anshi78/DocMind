import asyncio
import uuid
import structlog
from sqlalchemy.future import select

from app.db.base import AsyncSessionLocal, engine
from app.db.models.billing import Plan

logger = structlog.get_logger()

DEFAULT_PLANS = [
    {
        "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "name": "Free",
        "stripe_price_id": None,
        "max_documents": 5,
        "max_queries_per_month": 50,
        "max_storage_mb": 50,
        "max_members": 2,
        "features": {
            "caching": True,
            "hybrid_search": True,
            "api_keys": False,
            "webhooks": False,
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "name": "Pro",
        "stripe_price_id": "price_pro_subscription",
        "max_documents": 50,
        "max_queries_per_month": 1000,
        "max_storage_mb": 1000,
        "max_members": 10,
        "features": {
            "caching": True,
            "hybrid_search": True,
            "api_keys": True,
            "webhooks": True,
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "name": "Enterprise",
        "stripe_price_id": "price_enterprise_subscription",
        "max_documents": 1000,
        "max_queries_per_month": 100000,
        "max_storage_mb": 20000,
        "max_members": 100,
        "features": {
            "caching": True,
            "hybrid_search": True,
            "api_keys": True,
            "webhooks": True,
            "sso": True,
            "audit_logs": True,
        },
        "is_active": True,
    },
]

async def seed_plans() -> None:
    async with AsyncSessionLocal() as db:
        for plan_data in DEFAULT_PLANS:
            # Check if plan already exists by ID or name
            result = await db.execute(
                select(Plan).where(
                    (Plan.id == plan_data["id"]) | (Plan.name == plan_data["name"])
                )
            )
            existing_plan = result.scalars().first()
            
            if existing_plan:
                # Update existing plan settings/limits
                logger.info("Plan already exists, updating", name=plan_data["name"])
                existing_plan.max_documents = plan_data["max_documents"]
                existing_plan.max_queries_per_month = plan_data["max_queries_per_month"]
                existing_plan.max_storage_mb = plan_data["max_storage_mb"]
                existing_plan.max_members = plan_data["max_members"]
                existing_plan.features = plan_data["features"]
                existing_plan.stripe_price_id = plan_data["stripe_price_id"]
                existing_plan.is_active = plan_data["is_active"]
            else:
                logger.info("Creating default plan", name=plan_data["name"])
                plan = Plan(**plan_data)
                db.add(plan)
        
        await db.commit()
        logger.info("Database seeding of plans complete.")

if __name__ == "__main__":
    asyncio.run(seed_plans())

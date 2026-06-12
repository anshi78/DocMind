import uuid
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_user
from app.db.models import User, Organization, OrgMembership, Document, UsageEvent

router = APIRouter()


# ── Guards ──────────────────────────────────────────────────────

async def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces superuser access."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return current_user


# ── Schemas ─────────────────────────────────────────────────────

class SystemStats(BaseModel):
    total_users: int
    total_orgs: int
    total_documents: int
    total_queries_this_month: int


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    is_active: bool
    is_superuser: bool
    email_verified: bool
    last_login_at: datetime | None
    created_at: datetime
    org_count: int

    class Config:
        from_attributes = True


# ── Endpoints ───────────────────────────────────────────────────

@router.get("/stats", response_model=SystemStats)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superuser),
):
    """Return system-wide aggregate statistics. Superuser only."""
    users_count = (await db.execute(select(func.count(User.id)).where(User.deleted_at.is_(None)))).scalar() or 0
    orgs_count = (await db.execute(select(func.count(Organization.id)).where(Organization.deleted_at.is_(None)))).scalar() or 0
    docs_count = (await db.execute(select(func.count(Document.id)).where(Document.deleted_at.is_(None)))).scalar() or 0

    month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    queries_count = (
        await db.execute(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.event_type == "chat_query",
                UsageEvent.created_at >= month_start,
            )
        )
    ).scalar() or 0

    return SystemStats(
        total_users=users_count,
        total_orgs=orgs_count,
        total_documents=docs_count,
        total_queries_this_month=queries_count,
    )


@router.get("/users", response_model=list[AdminUserResponse])
async def list_all_users(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superuser),
):
    """Paginated list of all users with their organization membership count. Superuser only."""
    # Sub-query for org count
    org_count_sq = (
        select(
            OrgMembership.user_id,
            func.count(OrgMembership.id).label("org_count"),
        )
        .group_by(OrgMembership.user_id)
        .subquery()
    )

    result = await db.execute(
        select(User, func.coalesce(org_count_sq.c.org_count, 0).label("org_count"))
        .outerjoin(org_count_sq, User.id == org_count_sq.c.user_id)
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    users = []
    for row in result.all():
        user = row[0]
        org_count = row[1]
        users.append(
            AdminUserResponse(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                email_verified=user.email_verified,
                last_login_at=user.last_login_at,
                created_at=user.created_at,
                org_count=org_count,
            )
        )
    return users

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import User, Organization, OrgMembership

router = APIRouter()


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    settings: dict
    stripe_customer_id: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class MemberUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None

    class Config:
        from_attributes = True


class MemberResponse(BaseModel):
    id: uuid.UUID
    role: str
    joined_at: datetime
    user: MemberUserResponse

    class Config:
        from_attributes = True


class OrganizationUpdate(BaseModel):
    name: str | None = None
    settings: dict | None = None


@router.get("", response_model=list[OrganizationResponse])
async def list_user_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all organizations that the current user belongs to."""
    result = await db.execute(
        select(Organization)
        .join(OrgMembership, OrgMembership.org_id == Organization.id)
        .where(OrgMembership.user_id == current_user.id, Organization.deleted_at.is_(None))
    )
    return result.scalars().all()


@router.get("/{id}", response_model=OrganizationResponse)
async def get_organization(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve detailed settings of an organization (requires membership)."""
    # Verify user membership
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == id, OrgMembership.user_id == current_user.id)
    )
    if not membership_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization."
        )

    result = await db.execute(select(Organization).where(Organization.id == id, Organization.deleted_at.is_(None)))
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.put("/{id}", response_model=OrganizationResponse)
async def update_organization(
    id: uuid.UUID,
    data: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update organization settings (requires owner/admin role)."""
    # Verify user membership and role (owner or admin)
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == id, OrgMembership.user_id == current_user.id)
    )
    membership = membership_res.scalars().first()
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update this organization."
        )

    result = await db.execute(select(Organization).where(Organization.id == id, Organization.deleted_at.is_(None)))
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if data.name is not None:
        org.name = data.name
    if data.settings is not None:
        org.settings = {**org.settings, **data.settings}

    await db.commit()
    await db.refresh(org)
    return org


@router.get("/{id}/members", response_model=list[MemberResponse])
async def list_org_members(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List members of an organization."""
    # Verify membership of requester
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == id, OrgMembership.user_id == current_user.id)
    )
    if not membership_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization."
        )

    members_res = await db.execute(
        select(OrgMembership)
        .options(selectinload(OrgMembership.user))
        .where(OrgMembership.org_id == id)
    )
    return members_res.scalars().all()


@router.delete("/{id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_org_member(
    id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from the organization. Requires owner or admin role."""
    # Verify requester is owner/admin
    requester_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == id, OrgMembership.user_id == current_user.id)
    )
    requester_membership = requester_res.scalars().first()
    if not requester_membership or requester_membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to remove members.",
        )

    # Cannot remove yourself
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the organization.",
        )

    # Find target membership
    target_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == id, OrgMembership.user_id == user_id)
    )
    target_membership = target_res.scalars().first()
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this organization.",
        )

    # Cannot remove an owner unless you are also an owner
    if target_membership.role == "owner" and requester_membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can remove other owners.",
        )

    await db.delete(target_membership)
    await db.commit()


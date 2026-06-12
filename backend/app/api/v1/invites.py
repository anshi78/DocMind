import secrets
import uuid
from datetime import datetime, UTC, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import User, Organization, Invite, OrgMembership
from app.services.billing.billing_service import BillingService

router = APIRouter()


# Invite Pydantic Schemas
class InviteCreate(BaseModel):
    email: EmailStr
    role: str = "member"


class InviteResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    email: str
    role: str
    invited_by: uuid.UUID
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None = None

    class Config:
        from_attributes = True


@router.post("", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_invite(
    data: InviteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Create a new pending invite for the organization."""
    # 1. Enforce Role check (only Owner and Admin can invite)
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org.id, OrgMembership.user_id == current_user.id)
    )
    membership = membership_res.scalars().first()
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can invite members."
        )

    # 2. Check Plan member limits
    await BillingService.enforce_limit(db, org, "max_members")

    # 3. Check if invite or membership already exists
    exists_res = await db.execute(
        select(OrgMembership).join(User).where(OrgMembership.org_id == org.id, User.email == data.email)
    )
    if exists_res.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this organization")

    invite_res = await db.execute(
        select(Invite).where(Invite.org_id == org.id, Invite.email == data.email, Invite.accepted_at.is_(None))
    )
    existing_invite = invite_res.scalars().first()
    if existing_invite:
        # Check if expired, if so we'll re-create/update it. Otherwise raise error
        if existing_invite.expires_at > datetime.now(UTC):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A pending invite already exists for this email")

    # 4. Generate secure token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=48)

    if existing_invite:
        # Re-use and update expired invite
        existing_invite.token = token
        existing_invite.expires_at = expires_at
        existing_invite.invited_by = current_user.id
        existing_invite.role = data.role
        invite = existing_invite
    else:
        invite = Invite(
            org_id=org.id,
            email=data.email,
            role=data.role,
            token=token,
            invited_by=current_user.id,
            expires_at=expires_at,
        )
        db.add(invite)

    await db.commit()
    await db.refresh(invite)
    
    # In a production SaaS, we would trigger an email delivery here via SendGrid
    return invite


@router.post("/{token}/accept", status_code=status.HTTP_200_OK)
async def accept_organization_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept an organization invitation and join as a member."""
    # Find active invite matching token
    result = await db.execute(select(Invite).where(Invite.token == token, Invite.accepted_at.is_(None)))
    invite = result.scalars().first()
    
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found or already accepted")
        
    if invite.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation has expired")

    # Ensure invite email matches logged in user email
    if invite.email != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was sent to a different email address."
        )

    # Verify organization still exists
    org_res = await db.execute(select(Organization).where(Organization.id == invite.org_id, Organization.deleted_at.is_(None)))
    org = org_res.scalars().first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization no longer exists")

    # Double check if user is already a member
    mem_check = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org.id, OrgMembership.user_id == current_user.id)
    )
    if mem_check.scalars().first():
        invite.accepted_at = datetime.now(UTC)
        await db.commit()
        return {"status": "success", "message": "Already a member of this organization"}

    # Create membership record
    membership = OrgMembership(
        org_id=invite.org_id,
        user_id=current_user.id,
        role=invite.role,
        invited_by=invite.invited_by,
    )
    db.add(membership)
    invite.accepted_at = datetime.now(UTC)
    
    await db.commit()
    return {"status": "success", "org_id": str(invite.org_id), "role": invite.role}


@router.post("/{id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_organization_invite(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Revoke a pending organization invitation."""
    # Verify owner/admin role
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org.id, OrgMembership.user_id == current_user.id)
    )
    membership = membership_res.scalars().first()
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can revoke invites."
        )

    result = await db.execute(select(Invite).where(Invite.id == id, Invite.org_id == org.id))
    invite = result.scalars().first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    await db.delete(invite)
    await db.commit()
    return None


@router.get("", response_model=list[InviteResponse])
async def list_org_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """List pending organization invites."""
    # Verify user membership and role (owner or admin)
    membership_res = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org.id, OrgMembership.user_id == current_user.id)
    )
    membership = membership_res.scalars().first()
    if not membership or membership.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can view invites."
        )

    result = await db.execute(
        select(Invite).where(Invite.org_id == org.id, Invite.accepted_at.is_(None), Invite.expires_at > datetime.now(UTC))
    )
    return result.scalars().all()

import uuid
from typing import AsyncGenerator
from fastapi import Depends, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from app.core.security import decode_token
from app.db.base import get_db
from app.db.models import User, Organization, OrgMembership

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_scheme),
) -> User:
    if not token:
        raise AuthenticationError("Not authenticated")
    
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError("Invalid token claims")
        user_uuid = uuid.UUID(user_id)
    except Exception as e:
        raise AuthenticationError(str(e))
    
    # Query user from DB
    result = await db.execute(select(User).where(User.id == user_uuid, User.deleted_at.is_(None)))
    user = result.scalars().first()
    if not user:
        raise AuthenticationError("User not found")
        
    return user

async def get_current_org(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_org_id: str | None = Header(None, alias="X-Org-ID"),
) -> Organization:
    # If header not provided, look at memberships of the user
    # and default to the first one.
    if not x_org_id:
        result = await db.execute(
            select(OrgMembership)
            .where(OrgMembership.user_id == current_user.id)
            .limit(1)
        )
        membership = result.scalars().first()
        if not membership:
            raise AuthorizationError("User is not associated with any organization")
        org_uuid = membership.org_id
    else:
        try:
            org_uuid = uuid.UUID(x_org_id)
        except ValueError:
            raise AuthorizationError("Invalid Organization ID format")
            
    # Verify membership
    result = await db.execute(
        select(OrgMembership)
        .where(OrgMembership.org_id == org_uuid, OrgMembership.user_id == current_user.id)
    )
    membership = result.scalars().first()
    if not membership:
        raise AuthorizationError("User is not a member of this organization")
        
    # Get organization details
    org_result = await db.execute(
        select(Organization).where(Organization.id == org_uuid, Organization.deleted_at.is_(None))
    )
    org = org_result.scalars().first()
    if not org:
        raise NotFoundError("Organization", str(org_uuid))
        
    return org

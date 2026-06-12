import re
import uuid
from datetime import datetime, UTC
from typing import Any
from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    TOKEN_TYPE_REFRESH,
)
from app.db.base import get_db
from app.db.models import User, Organization, OrgMembership

router = APIRouter()

# Pydantic Schemas for Input/Output
class UserBase(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_active: bool
    is_superuser: bool
    email_verified: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class OrganizationBase(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    settings: dict
    stripe_customer_id: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MembershipBase(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime
    org: OrganizationBase

    class Config:
        from_attributes = True

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserBase
    memberships: list[MembershipBase]

class RegisterInput(BaseModel):
    email: EmailStr
    full_name: str
    organization_name: str
    password: str

class RefreshInput(BaseModel):
    refresh_token: str

class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        slug = "workspace"
    return slug


async def generate_auth_response(db: AsyncSession, user: User) -> AuthResponse:
    # Fetch user memberships and organizations eager-loaded
    result = await db.execute(
        select(OrgMembership)
        .options(selectinload(OrgMembership.org))
        .where(OrgMembership.user_id == user.id)
    )
    memberships = result.scalars().all()
    
    # Generate tokens
    default_org_id = str(memberships[0].org_id) if memberships else None
    default_role = memberships[0].role if memberships else None
    
    access_token = create_access_token(
        subject=str(user.id),
        org_id=default_org_id,
        role=default_role,
    )
    refresh_token, _ = create_refresh_token(subject=str(user.id))
    
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserBase.model_validate(user),
        memberships=[MembershipBase.model_validate(m) for m in memberships],
    )


@router.post("/register", response_model=AuthResponse)
async def register(data: RegisterInput, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise ConflictError("User with this email already exists")

    # Create user
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=True,
        email_verified=False,
    )
    db.add(user)
    await db.flush() # Populate user ID

    # Create Organization
    base_slug = slugify(data.organization_name)
    slug = base_slug
    # Ensure slug is unique
    for i in range(1, 100):
        slug_check = await db.execute(select(Organization).where(Organization.slug == slug))
        if not slug_check.scalars().first():
            break
        slug = f"{base_slug}-{i}"

    org = Organization(
        name=data.organization_name,
        slug=slug,
        settings={},
    )
    db.add(org)
    await db.flush() # Populate org ID

    # Create Org Membership
    membership = OrgMembership(
        org_id=org.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)
    
    await db.commit()
    await db.refresh(user)

    return await generate_auth_response(db, user)


@router.post("/token", response_model=AuthResponse)
async def login(
    username: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve user
    result = await db.execute(select(User).where(User.email == username, User.deleted_at.is_(None)))
    user = result.scalars().first()
    if not user or not verify_password(password, user.hashed_password):
        raise AuthenticationError("Incorrect email or password")

    if not user.is_active:
        raise AuthenticationError("Inactive user account")

    # Update last login time
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    return await generate_auth_response(db, user)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_tokens(data: RefreshInput, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token, expected_type=TOKEN_TYPE_REFRESH)
        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError("Invalid refresh token claims")
        user_uuid = uuid.UUID(user_id)
    except Exception as e:
        raise AuthenticationError(str(e))

    # Fetch user
    result = await db.execute(select(User).where(User.id == user_uuid, User.deleted_at.is_(None)))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise AuthenticationError("User not found or inactive")

    # Fetch memberships for claims
    membership_result = await db.execute(
        select(OrgMembership).where(OrgMembership.user_id == user.id)
    )
    memberships = membership_result.scalars().all()
    default_org_id = str(memberships[0].org_id) if memberships else None
    default_role = memberships[0].role if memberships else None

    # Re-issue tokens
    access_token = create_access_token(
        subject=str(user.id),
        org_id=default_org_id,
        role=default_role,
    )
    refresh_token, _ = create_refresh_token(subject=str(user.id))

    return RefreshResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )

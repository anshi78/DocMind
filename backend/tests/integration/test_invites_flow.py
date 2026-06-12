import uuid
import pytest
from datetime import datetime, UTC, timedelta
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.api.deps import get_db, get_current_user, get_current_org
from app.db.models import User, Organization, Invite, OrgMembership
from app.services.billing.billing_service import BillingService

client = TestClient(app)


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    
    def mock_add(obj):
        if hasattr(obj, "id") and obj.id is None:
            obj.id = uuid.uuid4()
        if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(UTC)
            
    db.add = MagicMock(side_effect=mock_add)
    return db


@pytest.fixture
def mock_user():
    user = User(
        id=uuid.uuid4(),
        email="testowner@example.com",
        hashed_password="hashed_pw",
        full_name="Test Owner",
        is_active=True,
    )
    return user


@pytest.fixture
def mock_org():
    org = Organization(
        id=uuid.uuid4(),
        name="Test Org",
        slug="test-org",
        settings={},
    )
    return org


def test_create_invite_success(mock_db, mock_user, mock_org, monkeypatch):
    # Mock current membership role as owner
    membership = OrgMembership(org_id=mock_org.id, user_id=mock_user.id, role="owner")
    
    # Mock DB query results
    mock_execute = AsyncMock()
    mock_execute.side_effect = [
        MagicMock(scalars=lambda: MagicMock(first=lambda: membership)),  # Role check membership
        MagicMock(scalars=lambda: MagicMock(first=lambda: None)),        # Member exist check
        MagicMock(scalars=lambda: MagicMock(first=lambda: None)),        # Invite exist check
    ]
    mock_db.execute = mock_execute

    # Mock BillingService enforce_limit
    enforce_mock = AsyncMock()
    monkeypatch.setattr(BillingService, "enforce_limit", enforce_mock)

    # Dependency overrides
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_current_org] = lambda: mock_org

    # Trigger POST /api/v1/invites
    response = client.post(
        "/api/v1/invites",
        json={"email": "newmember@example.com", "role": "member"},
        headers={"X-Org-ID": str(mock_org.id)}
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newmember@example.com"
    assert data["role"] == "member"
    assert data["org_id"] == str(mock_org.id)
    
    # Clean overrides
    app.dependency_overrides.clear()


def test_create_invite_forbidden_for_member(mock_db, mock_user, mock_org, monkeypatch):
    # Mock current membership role as normal member (cannot invite)
    membership = OrgMembership(org_id=mock_org.id, user_id=mock_user.id, role="member")
    
    # Mock DB query results
    mock_execute = AsyncMock()
    mock_execute.side_effect = [
        MagicMock(scalars=lambda: MagicMock(first=lambda: membership)),  # Role check membership
    ]
    mock_db.execute = mock_execute

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_current_org] = lambda: mock_org

    response = client.post(
        "/api/v1/invites",
        json={"email": "newmember@example.com", "role": "member"},
        headers={"X-Org-ID": str(mock_org.id)}
    )

    assert response.status_code == 403
    assert "Only owners and admins" in response.json()["detail"]
    app.dependency_overrides.clear()

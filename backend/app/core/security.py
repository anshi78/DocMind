import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import AuthenticationError, TokenExpiredError

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
TOKEN_TYPE_ACCESS  = "access"
TOKEN_TYPE_REFRESH = "refresh"
SENSITIVE_FIELDS = frozenset({
    "password", "hashed_password", "api_key", "secret",
    "stripe_secret_key", "sendgrid_api_key", "token",
})
API_KEY_PATTERN = re.compile(r"^dm_(live|test)_[a-f0-9]{64}$")


def hash_password(plain_password: str) -> str:
    if len(plain_password) > PASSWORD_MAX_LENGTH:
        raise ValueError("Password exceeds maximum length")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        bcrypt.checkpw(b"dummy", b"$2b$12$dummy_hash_for_timing_resistance_pad")
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(
    subject: str,
    org_id: str | None = None,
    role: str | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_urlsafe(16),
    }
    if org_id:
        payload["org"] = str(org_id)
    if role:
        payload["role"] = role
    if extra_claims:
        reserved = {"sub", "type", "iat", "exp", "jti"}
        payload.update({k: v for k, v in extra_claims.items() if k not in reserved})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> tuple[str, str]:
    now = datetime.now(UTC)
    jti = secrets.token_urlsafe(32)
    payload = {
        "sub": str(subject),
        "type": TOKEN_TYPE_REFRESH,
        "iat": now,
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": jti,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


def decode_token(token: str, expected_type: str = TOKEN_TYPE_ACCESS) -> dict[str, Any]:
    if not token or not isinstance(token, str):
        raise AuthenticationError("Invalid token format")
    token = token.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError("Token has expired")
    except JWTError:
        raise AuthenticationError("Token validation failed")
    if payload.get("type") != expected_type:
        raise AuthenticationError(f"Invalid token type: expected '{expected_type}'")
    try:
        UUID(payload["sub"])
    except (ValueError, KeyError):
        raise AuthenticationError("Invalid token subject")
    return payload


def generate_api_key(test_mode: bool = False) -> tuple[str, str, str]:
    env = "test" if test_mode else "live"
    raw_hex = secrets.token_bytes(32).hex()
    full_key = f"dm_{env}_{raw_hex}"
    display_prefix = full_key[:16]
    key_hash = hashlib.sha256(full_key.encode("utf-8")).hexdigest()
    return full_key, display_prefix, key_hash


def verify_api_key(presented_key: str, stored_hash: str) -> bool:
    if not presented_key or not stored_hash:
        return False
    if not API_KEY_PATTERN.match(presented_key):
        return False
    computed_hash = hashlib.sha256(presented_key.encode("utf-8")).hexdigest()
    return hmac.compare_digest(computed_hash, stored_hash)


def sign_webhook_payload(payload: str, secret: str) -> str:
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={signature}"


def sanitize_filename(filename: str) -> str:
    if not filename:
        return "untitled"
    filename = filename.replace("\x00", "")
    import os
    filename = os.path.basename(filename)
    filename = re.sub(r"[/\\:*?\"<>|]", "_", filename)
    filename = filename.lstrip(".")
    RESERVED = {"CON", "PRN", "AUX", "NUL", "COM1", "COM2", "LPT1", "LPT2"}
    import os
    base = os.path.splitext(filename)[0].upper()
    if base in RESERVED:
        filename = f"file_{filename}"
    if len(filename.encode("utf-8")) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:200] + ext
    return filename or "untitled"

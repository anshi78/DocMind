from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    DocuMindError,
    InsufficientPlanError,
    NotFoundError,
    RateLimitError,
    TokenExpiredError,
    ValidationError,
)
from app.api.v1.orgs import router as orgs_router
from app.api.v1.invites import router as invites_router
from app.api.v1.billing import router as billing_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.documents import router as documents_router
from app.api.v1.conversations import router as conversations_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise RAG Knowledge Base Engine API",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler for custom DocuMind errors
@app.exception_handler(DocuMindError)
async def documind_exception_handler(request: Request, exc: DocuMindError):
    status_code = 500
    if isinstance(exc, TokenExpiredError):
        status_code = 401
    elif isinstance(exc, AuthenticationError):
        status_code = 401
    elif isinstance(exc, AuthorizationError):
        status_code = 403
    elif isinstance(exc, InsufficientPlanError):
        status_code = 402
    elif isinstance(exc, NotFoundError):
        status_code = 404
    elif isinstance(exc, ConflictError):
        status_code = 409
    elif isinstance(exc, ValidationError):
        status_code = 422
    elif isinstance(exc, RateLimitError):
        status_code = 429

    return JSONResponse(
        status_code=status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "details": exc.details,
        },
    )


# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
    }


# Include API V1 Routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(documents_router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(conversations_router, prefix="/api/v1/conversations", tags=["Conversations"])
app.include_router(orgs_router, prefix="/api/v1/orgs", tags=["Organizations"])
app.include_router(invites_router, prefix="/api/v1/invites", tags=["Invites"])
app.include_router(billing_router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(webhooks_router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])

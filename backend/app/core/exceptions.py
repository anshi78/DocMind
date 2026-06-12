from typing import Any


class DocuMindError(Exception):
    def __init__(self, message: str, details: Any = None):
        self.message = message
        self.details = details
        super().__init__(message)


class AuthenticationError(DocuMindError):
    pass

class TokenExpiredError(AuthenticationError):
    pass

class AuthorizationError(DocuMindError):
    pass

class InsufficientPlanError(DocuMindError):
    def __init__(self, message: str, required_plan: str | None = None):
        if required_plan:
            super().__init__(
                f"Feature '{message}' requires {required_plan} plan",
                {"feature": message, "required_plan": required_plan}
            )
        else:
            super().__init__(message, {"reason": "plan_limit_exceeded"})

class NotFoundError(DocuMindError):
    def __init__(self, resource: str, resource_id: str | None = None):
        msg = f"{resource} not found"
        if resource_id:
            msg += f": {resource_id}"
        super().__init__(msg, {"resource": resource, "id": resource_id})

class ConflictError(DocuMindError):
    pass

class ValidationError(DocuMindError):
    pass

class FileTooLargeError(ValidationError):
    def __init__(self, size_bytes: int, max_bytes: int):
        super().__init__(
            f"File size {size_bytes} exceeds maximum {max_bytes} bytes",
            {"size_bytes": size_bytes, "max_bytes": max_bytes}
        )

class UnsupportedFileTypeError(ValidationError):
    def __init__(self, mime_type: str):
        super().__init__(
            f"File type '{mime_type}' is not supported",
            {"mime_type": mime_type, "supported": ["application/pdf", "text/markdown"]}
        )

class IngestionError(DocuMindError):
    pass

class EmbeddingError(DocuMindError):
    pass

class RetrievalError(DocuMindError):
    pass

class ExternalServiceError(DocuMindError):
    def __init__(self, service: str, message: str):
        super().__init__(f"{service} error: {message}", {"service": service})

class RateLimitError(DocuMindError):
    def __init__(self, retry_after: int | None = None):
        super().__init__(
            "Rate limit exceeded",
            {"retry_after_seconds": retry_after}
        )

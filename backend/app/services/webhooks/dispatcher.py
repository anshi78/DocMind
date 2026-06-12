import asyncio
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, UTC
import httpx
import structlog
from sqlalchemy.future import select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.db.models.webhook import WebhookEndpoint, WebhookDelivery

logger = structlog.get_logger()


async def dispatch_webhook(org_id: str | uuid.UUID, event_type: str, payload: dict) -> None:
    """
    Query all active webhook endpoints matching the organization and event type,
    sign the payload, send it, record the delivery log, and retry on failure.
    """
    org_uuid = uuid.UUID(str(org_id)) if isinstance(org_id, str) else org_id
    
    async with AsyncSessionLocal() as db:
        # Retrieve active endpoints for organization
        result = await db.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.org_id == org_uuid,
                WebhookEndpoint.is_active.is_(True)
            )
        )
        endpoints = result.scalars().all()
        
        # Filter endpoints by event type
        matching_endpoints = [
            ep for ep in endpoints if event_type in ep.events or "*" in ep.events
        ]
        
        if not matching_endpoints:
            logger.info("No matching webhook endpoints found", org_id=str(org_id), event=event_type)
            return

        # Trigger delivery for each matching endpoint in the background
        for ep in matching_endpoints:
            asyncio.create_task(deliver_to_endpoint(ep.id, event_type, payload))


async def deliver_to_endpoint(endpoint_id: uuid.UUID, event_type: str, payload: dict) -> None:
    """Deliver webhook payload to a single endpoint with retries and signature verification."""
    max_attempts = 4
    
    for attempt in range(1, max_attempts + 1):
        async with AsyncSessionLocal() as db:
            # Re-fetch endpoint to ensure it's still active
            ep_res = await db.execute(select(WebhookEndpoint).where(WebhookEndpoint.id == endpoint_id))
            endpoint = ep_res.scalars().first()
            if not endpoint or not endpoint.is_active:
                logger.warn("Webhook endpoint deleted or disabled during delivery", endpoint_id=str(endpoint_id))
                return

            # Prepare signature payload
            timestamp = str(int(time.time()))
            payload_str = json.dumps(payload, separators=(",", ":"))
            signature_payload = f"t={timestamp}.{payload_str}".encode("utf-8")
            
            # Generate HMAC-SHA256 signature
            signature = hmac.new(
                endpoint.secret.encode("utf-8"),
                signature_payload,
                hashlib.sha256
            ).hexdigest()
            signature_header = f"t={timestamp},v1={signature}"

            # Log delivery attempt
            delivery = WebhookDelivery(
                endpoint_id=endpoint.id,
                event_type=event_type,
                payload=payload,
                attempt_count=attempt,
                status="pending",
            )
            db.add(delivery)
            await db.commit()
            await db.refresh(delivery)

            # POST Request
            start_time = time.time()
            status_code = None
            response_body = None
            error_msg = None
            status = "failed"

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        endpoint.url,
                        content=payload_str,
                        headers={
                            "Content-Type": "application/json",
                            "X-DocuMind-Signature": signature_header,
                            "User-Agent": "DocuMind-Webhook-Dispatcher/0.1",
                        }
                    )
                    status_code = response.status_code
                    response_body = response.text[:2000] # Limit size logged
                    
                    if 200 <= response.status_code < 300:
                        status = "success"
                    else:
                        error_msg = f"HTTP Error Status {response.status_code}"
            except httpx.RequestError as exc:
                error_msg = f"Connection error: {str(exc)}"
                logger.error("Webhook connection error", url=endpoint.url, error=str(exc))
            except Exception as e:
                error_msg = f"Unexpected delivery error: {str(e)}"
                logger.error("Unexpected webhook error", url=endpoint.url, error=str(e))

            # Update delivery result
            delivery.status = status
            delivery.status_code = status_code
            delivery.response_body = response_body
            delivery.error_message = error_msg

            if status == "failed" and attempt < max_attempts:
                # Schedule retry with exponential backoff (e.g. 5, 10, 20 seconds)
                backoff = 5 * (2 ** (attempt - 1))
                delivery.next_retry_at = datetime.now(UTC) # update timestamp or save retry metadata
                await db.commit()
                
                logger.info(
                    "Retrying webhook delivery",
                    endpoint=endpoint.url,
                    attempt=attempt,
                    backoff=backoff
                )
                await asyncio.sleep(backoff)
            else:
                if status == "failed":
                    delivery.status = "abandoned"
                await db.commit()
                logger.info(
                    "Webhook delivery execution completed",
                    endpoint=endpoint.url,
                    status=delivery.status,
                    attempts=attempt
                )
                break

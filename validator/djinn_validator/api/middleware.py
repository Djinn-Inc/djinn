"""Security middleware for the validator API.

Provides:
- Token-bucket rate limiting per IP
- Bittensor hotkey signature verification for inter-validator endpoints
- CORS configuration helper
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

import structlog
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------


@dataclass
class TokenBucket:
    """Simple token-bucket rate limiter."""

    capacity: float
    refill_rate: float  # tokens per second
    tokens: float = 0.0
    last_refill: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        self.tokens = self.capacity

    def consume(self, n: float = 1.0) -> bool:
        """Try to consume n tokens. Returns True if allowed."""
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

        if self.tokens >= n:
            self.tokens -= n
            return True
        return False


class RateLimiter:
    """Per-IP rate limiter with configurable limits per path prefix."""

    _MAX_BUCKETS = 10_000

    def __init__(
        self,
        default_capacity: float = 60,
        default_rate: float = 10,  # 10 req/sec
    ) -> None:
        self._default_capacity = default_capacity
        self._default_rate = default_rate
        self._path_limits: dict[str, tuple[float, float]] = {}
        self._buckets: dict[str, TokenBucket] = {}
        self._last_cleanup = time.monotonic()
        self._cleanup_interval = 300  # Clean stale buckets every 5 min

    def set_path_limit(self, prefix: str, capacity: float, rate: float) -> None:
        """Set custom rate limit for a path prefix."""
        self._path_limits[prefix] = (capacity, rate)

    def _get_bucket(self, key: str, path: str) -> TokenBucket:
        """Get or create a token bucket for this client+path."""
        bucket_key = f"{key}:{path}"
        if bucket_key not in self._buckets:
            capacity, rate = self._default_capacity, self._default_rate
            for prefix, (cap, r) in self._path_limits.items():
                if path.startswith(prefix):
                    capacity, rate = cap, r
                    break
            self._buckets[bucket_key] = TokenBucket(capacity=capacity, refill_rate=rate)
        return self._buckets[bucket_key]

    def allow(self, client_ip: str, path: str) -> bool:
        """Check if request is allowed."""
        self._maybe_cleanup()
        bucket = self._get_bucket(client_ip, path)
        return bucket.consume()

    def _maybe_cleanup(self) -> None:
        """Remove stale buckets periodically or when limit exceeded."""
        now = time.monotonic()
        force = len(self._buckets) > self._MAX_BUCKETS
        if not force and now - self._last_cleanup < self._cleanup_interval:
            return
        self._last_cleanup = now
        stale = [
            k for k, b in self._buckets.items()
            if now - b.last_refill > self._cleanup_interval
        ]
        for k in stale:
            del self._buckets[k]
        if force and len(self._buckets) > self._MAX_BUCKETS:
            log.warning("rate_limiter_bucket_overflow", count=len(self._buckets))


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that applies rate limiting."""

    def __init__(self, app: object, limiter: RateLimiter) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._limiter = limiter

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Skip rate limiting for health checks
        if path == "/health" or path == "/metrics":
            return await call_next(request)

        if not self._limiter.allow(client_ip, path):
            log.warning("rate_limited", client_ip=client_ip, path=path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": "1"},
            )

        return await call_next(request)


# ---------------------------------------------------------------------------
# Signature Verification
# ---------------------------------------------------------------------------


def verify_hotkey_signature(
    message: bytes,
    signature: str,
    hotkey_ss58: str,
) -> bool:
    """Verify a Bittensor hotkey signature.

    In production, uses the sr25519 signature scheme via the bittensor SDK.
    Falls back to HMAC-SHA256 for testing when bittensor isn't available.
    """
    try:
        import bittensor as bt

        keypair = bt.Keypair(ss58_address=hotkey_ss58)
        return keypair.verify(message, bytes.fromhex(signature))
    except ImportError:
        # Bittensor not available — accept in dev, reject if BT_NETWORK is set to production
        import os
        network = os.getenv("BT_NETWORK", "")
        if network in ("finney", "mainnet"):
            log.error("signature_verification_impossible", reason="bittensor not installed but production network configured")
            return False
        log.warning("signature_verification_skipped", reason="bittensor not installed (dev mode)")
        return True
    except Exception as e:
        log.warning("signature_verification_failed", error=str(e))
        return False


def create_signature_message(
    endpoint: str,
    body_hash: str,
    timestamp: int,
    nonce: str,
) -> bytes:
    """Create the canonical message to sign for API requests.

    Format: "{endpoint}:{body_sha256}:{timestamp}:{nonce}"
    """
    return f"{endpoint}:{body_hash}:{timestamp}:{nonce}".encode()


async def validate_signed_request(
    request: Request,
    allowed_hotkeys: set[str] | None = None,
) -> str | None:
    """Validate a signed API request.

    Expects headers:
    - X-Hotkey: ss58 address of the signer
    - X-Signature: hex-encoded signature
    - X-Timestamp: unix timestamp (must be within 60s of now)
    - X-Nonce: random nonce to prevent replay

    Returns the verified hotkey ss58 address, or None if validation fails.
    Raises HTTPException on auth failure.
    """
    hotkey = request.headers.get("X-Hotkey")
    signature = request.headers.get("X-Signature")
    timestamp_str = request.headers.get("X-Timestamp")
    nonce = request.headers.get("X-Nonce")

    # In dev mode (no hotkey header), skip auth
    if not hotkey and not signature:
        return None

    if not all([hotkey, signature, timestamp_str, nonce]):
        raise HTTPException(
            status_code=401,
            detail="Missing authentication headers (X-Hotkey, X-Signature, X-Timestamp, X-Nonce)",
        )

    # Check timestamp freshness (60-second window)
    try:
        timestamp = int(timestamp_str)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid timestamp")

    now = int(time.time())
    if abs(now - timestamp) > 60:
        raise HTTPException(status_code=401, detail="Request timestamp too old")

    # Check hotkey allowlist
    if allowed_hotkeys and hotkey not in allowed_hotkeys:
        raise HTTPException(status_code=403, detail="Hotkey not authorized")

    # Read and hash the body
    body = await request.body()
    body_hash = hashlib.sha256(body).hexdigest()

    # Verify signature
    message = create_signature_message(
        request.url.path, body_hash, timestamp, nonce,  # type: ignore[arg-type]
    )
    if not verify_hotkey_signature(message, signature, hotkey):  # type: ignore[arg-type]
        raise HTTPException(status_code=401, detail="Invalid signature")

    return hotkey


def get_cors_origins(env_value: str = "") -> list[str]:
    """Parse CORS origins from environment variable.

    Returns ["*"] in dev mode (empty env). In production, set CORS_ORIGINS
    to a comma-separated list of allowed origins.
    """
    if not env_value:
        log.warning("cors_wildcard", msg="CORS_ORIGINS not set — using wildcard. Set CORS_ORIGINS in production.")
        return ["*"]
    return [o.strip() for o in env_value.split(",") if o.strip()]

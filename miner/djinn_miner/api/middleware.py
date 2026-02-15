"""Rate limiting and request tracing middleware for the miner API."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Callable

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Request ID Tracing
# ---------------------------------------------------------------------------


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a unique request ID and log every request.

    - Reads ``X-Request-ID`` from the incoming request or generates a UUID4.
    - Binds the ID to structlog contextvars so all log lines include ``request_id``.
    - Returns the ID in the ``X-Request-ID`` response header.
    - Logs method, path, status code, and duration for every request.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            if request.url.path not in ("/health", "/metrics"):
                log.info(
                    "request",
                    method=request.method,
                    path=request.url.path,
                    status=response.status_code,
                    duration_ms=duration_ms,
                    client=request.client.host if request.client else "unknown",
                )
            return response
        finally:
            structlog.contextvars.unbind_contextvars("request_id")


@dataclass
class TokenBucket:
    """Simple token-bucket rate limiter."""

    capacity: float
    refill_rate: float
    tokens: float = 0.0
    last_refill: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        self.tokens = self.capacity

    def consume(self, n: float = 1.0) -> bool:
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now
        if self.tokens >= n:
            self.tokens -= n
            return True
        return False


class RateLimiter:
    """Per-IP rate limiter with stale bucket cleanup."""

    _MAX_BUCKETS = 10_000
    _CLEANUP_INTERVAL = 300  # seconds

    def __init__(self, capacity: float = 30, rate: float = 5) -> None:
        self._capacity = capacity
        self._rate = rate
        self._buckets: dict[str, TokenBucket] = {}
        self._last_cleanup = time.monotonic()

    def allow(self, client_ip: str) -> bool:
        self._maybe_cleanup()
        if client_ip not in self._buckets:
            if len(self._buckets) >= self._MAX_BUCKETS:
                self._evict_oldest()
            self._buckets[client_ip] = TokenBucket(
                capacity=self._capacity, refill_rate=self._rate,
            )
        return self._buckets[client_ip].consume()

    def _maybe_cleanup(self) -> None:
        now = time.monotonic()
        if now - self._last_cleanup < self._CLEANUP_INTERVAL:
            return
        self._last_cleanup = now
        stale = [
            k for k, b in self._buckets.items()
            if now - b.last_refill > self._CLEANUP_INTERVAL
        ]
        for k in stale:
            del self._buckets[k]

    def _evict_oldest(self) -> None:
        oldest_key = min(self._buckets, key=lambda k: self._buckets[k].last_refill)
        del self._buckets[oldest_key]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that applies rate limiting."""

    def __init__(self, app: object, limiter: RateLimiter) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._limiter = limiter

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"

        if request.url.path in ("/health", "/metrics"):
            return await call_next(request)

        if not self._limiter.allow(client_ip):
            log.warning("rate_limited", client_ip=client_ip, path=request.url.path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": "1"},
            )

        return await call_next(request)


def get_cors_origins(env_value: str = "") -> list[str]:
    """Parse CORS origins from environment variable.

    Returns ["*"] in dev mode (empty env). In production, set CORS_ORIGINS
    to a comma-separated list of allowed origins.
    """
    if not env_value:
        log.warning("cors_wildcard", msg="CORS_ORIGINS not set — using wildcard. Set CORS_ORIGINS in production.")
        return ["*"]
    return [o.strip() for o in env_value.split(",") if o.strip()]

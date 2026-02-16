"""Rate limiting and request tracing middleware for the miner API."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Request ID Tracing
# ---------------------------------------------------------------------------


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
}


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a unique request ID, add security headers, and log every request.

    - Reads ``X-Request-ID`` from the incoming request or generates a UUID4.
    - Binds the ID to structlog contextvars so all log lines include ``request_id``.
    - Returns the ID in the ``X-Request-ID`` response header.
    - Adds standard security headers to every response.
    - Logs method, path, status code, and duration for every request.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            for header, value in _SECURITY_HEADERS.items():
                response.headers.setdefault(header, value)
            duration_s = time.monotonic() - start
            duration_ms = round(duration_s * 1000, 1)
            path = request.url.path
            if path not in ("/health", "/health/ready", "/metrics"):
                from djinn_miner.api.metrics import REQUEST_COUNT, REQUEST_LATENCY

                REQUEST_COUNT.labels(
                    method=request.method,
                    endpoint=path,
                    status=response.status_code,
                ).inc()
                REQUEST_LATENCY.labels(endpoint=path).observe(duration_s)
                log.info(
                    "request",
                    method=request.method,
                    path=path,
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
                capacity=self._capacity,
                refill_rate=self._rate,
            )
        return self._buckets[client_ip].consume()

    def _maybe_cleanup(self) -> None:
        now = time.monotonic()
        if now - self._last_cleanup < self._CLEANUP_INTERVAL:
            return
        self._last_cleanup = now
        stale = [k for k, b in self._buckets.items() if now - b.last_refill > self._CLEANUP_INTERVAL]
        for k in stale:
            del self._buckets[k]

    def _evict_oldest(self) -> None:
        if not self._buckets:
            return
        oldest_key = min(self._buckets, key=lambda k: self._buckets[k].last_refill)
        del self._buckets[oldest_key]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that applies rate limiting."""

    def __init__(self, app: object, limiter: RateLimiter) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._limiter = limiter

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"

        if request.url.path in ("/health", "/health/ready", "/metrics"):
            return await call_next(request)

        if not self._limiter.allow(client_ip):
            from djinn_miner.api.metrics import RATE_LIMIT_REJECTIONS

            RATE_LIMIT_REJECTIONS.inc()
            log.warning("rate_limited", client_ip=client_ip, path=request.url.path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": "1"},
            )

        return await call_next(request)


def get_cors_origins(env_value: str = "", bt_network: str = "") -> list[str]:
    """Parse CORS origins from environment variable.

    Returns ["*"] in dev mode (empty env). In production (finney/mainnet),
    raises ValueError if CORS_ORIGINS is not set.
    """
    if not env_value:
        if bt_network in ("finney", "mainnet"):
            raise ValueError(
                "CORS_ORIGINS must be set when BT_NETWORK is production. "
                "Set CORS_ORIGINS to a comma-separated list of allowed origins."
            )
        log.warning("cors_wildcard", msg="CORS_ORIGINS not set — using wildcard. Set CORS_ORIGINS in production.")
        return ["*"]
    return [o.strip() for o in env_value.split(",") if o.strip()]

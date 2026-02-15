"""Tests for API middleware (rate limiting, auth, CORS)."""

from __future__ import annotations

import hashlib
import time

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

from djinn_validator.api.middleware import (
    RateLimitMiddleware,
    RateLimiter,
    TokenBucket,
    create_signature_message,
    get_cors_origins,
    validate_signed_request,
)


class TestTokenBucket:
    def test_initial_capacity(self) -> None:
        b = TokenBucket(capacity=10, refill_rate=1)
        assert b.tokens == 10

    def test_consume_within_capacity(self) -> None:
        b = TokenBucket(capacity=5, refill_rate=1)
        for _ in range(5):
            assert b.consume() is True
        assert b.consume() is False

    def test_refill(self) -> None:
        b = TokenBucket(capacity=2, refill_rate=100)
        b.consume()
        b.consume()
        assert b.consume() is False
        # Simulate time passing
        b.last_refill = time.monotonic() - 1.0
        assert b.consume() is True


class TestRateLimiter:
    def test_allows_within_limit(self) -> None:
        limiter = RateLimiter(default_capacity=5, default_rate=1)
        for _ in range(5):
            assert limiter.allow("1.2.3.4", "/v1/signal") is True

    def test_blocks_over_limit(self) -> None:
        limiter = RateLimiter(default_capacity=2, default_rate=0.001)
        limiter.allow("1.2.3.4", "/v1/signal")
        limiter.allow("1.2.3.4", "/v1/signal")
        assert limiter.allow("1.2.3.4", "/v1/signal") is False

    def test_different_ips_independent(self) -> None:
        limiter = RateLimiter(default_capacity=1, default_rate=0.001)
        assert limiter.allow("1.1.1.1", "/test") is True
        assert limiter.allow("2.2.2.2", "/test") is True
        assert limiter.allow("1.1.1.1", "/test") is False

    def test_path_specific_limits(self) -> None:
        limiter = RateLimiter(default_capacity=10, default_rate=10)
        limiter.set_path_limit("/v1/mpc/", capacity=2, rate=0.001)
        # MPC path limited to 2
        assert limiter.allow("1.1.1.1", "/v1/mpc/init") is True
        assert limiter.allow("1.1.1.1", "/v1/mpc/init") is True
        assert limiter.allow("1.1.1.1", "/v1/mpc/init") is False
        # Default path still has capacity
        assert limiter.allow("1.1.1.1", "/v1/signal") is True


class TestRateLimitMiddleware:
    @pytest.fixture
    def limited_app(self) -> TestClient:
        app = FastAPI()
        limiter = RateLimiter(default_capacity=3, default_rate=0.001)
        app.add_middleware(RateLimitMiddleware, limiter=limiter)

        @app.get("/test")
        async def test_ep() -> dict:
            return {"ok": True}

        @app.get("/health")
        async def health() -> dict:
            return {"status": "ok"}

        @app.get("/health/ready")
        async def readiness() -> dict:
            return {"ready": True}

        return TestClient(app)

    def test_allows_requests(self, limited_app: TestClient) -> None:
        resp = limited_app.get("/test")
        assert resp.status_code == 200

    def test_rate_limits(self, limited_app: TestClient) -> None:
        for _ in range(3):
            limited_app.get("/test")
        resp = limited_app.get("/test")
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers

    def test_health_bypasses_limit(self, limited_app: TestClient) -> None:
        # Exhaust limit on /test
        for _ in range(3):
            limited_app.get("/test")
        # Health check still works
        resp = limited_app.get("/health")
        assert resp.status_code == 200

    def test_readiness_bypasses_limit(self, limited_app: TestClient) -> None:
        for _ in range(3):
            limited_app.get("/test")
        resp = limited_app.get("/health/ready")
        assert resp.status_code == 200


class TestCorsOrigins:
    def test_empty_returns_wildcard(self) -> None:
        assert get_cors_origins("") == ["*"]

    def test_single_origin(self) -> None:
        assert get_cors_origins("https://djinn.io") == ["https://djinn.io"]

    def test_multiple_origins(self) -> None:
        result = get_cors_origins("https://djinn.io, https://app.djinn.io")
        assert result == ["https://djinn.io", "https://app.djinn.io"]

    def test_strips_whitespace(self) -> None:
        result = get_cors_origins("  https://a.com , https://b.com  ")
        assert result == ["https://a.com", "https://b.com"]

    def test_filters_empty_values(self) -> None:
        result = get_cors_origins("https://a.com,,, ,https://b.com")
        assert result == ["https://a.com", "https://b.com"]

    def test_trailing_comma(self) -> None:
        result = get_cors_origins("https://a.com,")
        assert result == ["https://a.com"]


class TestSignatureMessage:
    def test_message_format(self) -> None:
        msg = create_signature_message("/v1/mpc/init", "abc123", 1700000000, "nonce1")
        assert msg == b"/v1/mpc/init:abc123:1700000000:nonce1"


class TestValidateSignedRequest:
    """Test auth validation.

    In dev mode (no bittensor, no auth headers), validation is skipped.
    With auth headers, timestamp freshness and header completeness are checked.
    """

    @pytest.fixture
    def auth_app(self) -> TestClient:
        app = FastAPI()

        @app.post("/v1/mpc/test")
        async def mpc_test(request: Request) -> dict:
            hotkey = await validate_signed_request(request)
            return {"hotkey": hotkey}

        return TestClient(app)

    def test_no_auth_headers_skipped(self, auth_app: TestClient) -> None:
        """In dev mode (no auth headers), request passes through."""
        resp = auth_app.post("/v1/mpc/test", json={})
        assert resp.status_code == 200
        assert resp.json()["hotkey"] is None

    def test_partial_auth_headers_rejected(self, auth_app: TestClient) -> None:
        """If some auth headers present but not all, reject."""
        resp = auth_app.post(
            "/v1/mpc/test",
            json={},
            headers={"X-Hotkey": "5FakeKey"},
        )
        assert resp.status_code == 401

    def test_stale_timestamp_rejected(self, auth_app: TestClient) -> None:
        resp = auth_app.post(
            "/v1/mpc/test",
            json={},
            headers={
                "X-Hotkey": "5FakeKey",
                "X-Signature": "abcd",
                "X-Timestamp": str(int(time.time()) - 120),  # 2 min ago
                "X-Nonce": "test",
            },
        )
        assert resp.status_code == 401
        assert "too old" in resp.json()["detail"]

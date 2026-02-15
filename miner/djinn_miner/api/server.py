"""FastAPI axon server for the Djinn miner."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import os

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from djinn_miner.api.metrics import (
    CHECKS_PROCESSED,
    LINES_CHECKED,
    PROOFS_GENERATED,
    metrics_response,
)
from djinn_miner.api.middleware import (
    RateLimitMiddleware,
    RateLimiter,
    RequestIdMiddleware,
    get_cors_origins,
)

from djinn_miner.api.models import (
    CheckRequest,
    CheckResponse,
    HealthResponse,
    ProofRequest,
    ProofResponse,
    ReadinessResponse,
)

if TYPE_CHECKING:
    from djinn_miner.core.checker import LineChecker
    from djinn_miner.core.health import HealthTracker
    from djinn_miner.core.proof import ProofGenerator

log = structlog.get_logger()


def create_app(
    checker: LineChecker,
    proof_gen: ProofGenerator,
    health_tracker: HealthTracker,
) -> FastAPI:
    """Build the FastAPI application with all routes wired."""

    app = FastAPI(title="Djinn Miner", version="0.1.0")

    # Catch unhandled exceptions — never leak stack traces to clients
    @app.exception_handler(Exception)
    async def _unhandled_error(_request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    cors_origins = get_cors_origins(os.getenv("CORS_ORIGINS", ""))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request body size limit (1MB)
    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):  # type: ignore[no-untyped-def]
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 1_048_576:
            return JSONResponse(status_code=413, content={"detail": "Request body too large (max 1MB)"})
        return await call_next(request)

    app.add_middleware(RateLimitMiddleware, limiter=RateLimiter(capacity=30, rate=5))

    # Request ID tracing (outermost — must be added last)
    app.add_middleware(RequestIdMiddleware)

    @app.post("/v1/check", response_model=CheckResponse)
    async def check_lines(request: CheckRequest) -> CheckResponse:
        """Phase 1: Check availability of candidate lines at sportsbooks.

        Receives up to 10 candidate lines. For each, queries the odds data
        source and returns which lines are currently available and at which
        bookmakers.
        """
        start = time.perf_counter()
        results = await checker.check(request.lines)
        elapsed_ms = (time.perf_counter() - start) * 1000

        available_indices = [r.index for r in results if r.available]

        CHECKS_PROCESSED.inc()
        for r in results:
            LINES_CHECKED.labels(result="available" if r.available else "unavailable").inc()

        log.info(
            "check_complete",
            total=len(request.lines),
            available=len(available_indices),
            time_ms=round(elapsed_ms, 1),
        )

        return CheckResponse(
            results=results,
            available_indices=available_indices,
            response_time_ms=round(elapsed_ms, 1),
        )

    @app.post("/v1/proof", response_model=ProofResponse)
    async def submit_proof(request: ProofRequest) -> ProofResponse:
        """Phase 2: Generate and submit a TLSNotary proof (stub).

        In production, this generates a TLSNotary proof of the TLS session
        used during Phase 1. Currently returns a mock proof.
        """
        result = await proof_gen.generate(request.query_id, request.session_data)
        proof_type = "tlsnotary" if "tlsnotary" in (result.message or "") else "http_attestation"
        PROOFS_GENERATED.labels(type=proof_type).inc()
        log.info("proof_generated", query_id=request.query_id, status=result.status, type=proof_type)
        return result

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Health check endpoint for validator pings."""
        health_tracker.record_ping()
        return health_tracker.get_status()

    @app.get("/health/ready", response_model=ReadinessResponse)
    async def readiness() -> ReadinessResponse:
        """Deep readiness probe — checks API key and dependencies."""
        from djinn_miner.config import Config
        cfg = Config()

        checks: dict[str, bool] = {}
        checks["odds_api_key"] = bool(cfg.odds_api_key)
        checks["odds_api_connected"] = health_tracker.get_status().odds_api_connected

        ready = all(checks.values())
        return ReadinessResponse(ready=ready, checks=checks)

    @app.get("/metrics")
    async def metrics() -> bytes:
        """Prometheus metrics endpoint."""
        from fastapi.responses import Response
        return Response(
            content=metrics_response(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    return app

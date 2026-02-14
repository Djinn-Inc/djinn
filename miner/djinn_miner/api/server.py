"""FastAPI axon server for the Djinn miner."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import structlog
from fastapi import FastAPI

from djinn_miner.api.models import (
    CheckRequest,
    CheckResponse,
    HealthResponse,
    ProofRequest,
    ProofResponse,
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
        log.info("proof_generated", query_id=request.query_id, status=result.status)
        return result

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Health check endpoint for validator pings."""
        health_tracker.record_ping()
        return health_tracker.get_status()

    return app

"""FastAPI server for the Djinn validator REST API.

Endpoints from Appendix A of the whitepaper:
- POST /v1/signal                    — Accept encrypted key shares from Genius
- POST /v1/signal/{id}/purchase      — Handle buyer purchase (MPC + share release)
- POST /v1/signal/{id}/register      — Register purchased signal for outcome tracking
- POST /v1/signal/{id}/outcome       — Submit outcome attestation
- POST /v1/signals/resolve           — Resolve all pending signal outcomes
- POST /v1/analytics/attempt         — Fire-and-forget analytics
- GET  /health                       — Health check

Inter-validator MPC endpoints:
- POST /v1/mpc/init                  — Accept MPC session invitation
- POST /v1/mpc/round1               — Submit Round 1 multiplication messages
- POST /v1/mpc/result               — Accept coordinator's final result
- GET  /v1/mpc/{session_id}/status   — Check MPC session status
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse as StarletteJSONResponse

from djinn_validator.api.metrics import (
    ACTIVE_SHARES,
    OUTCOMES_ATTESTED,
    PURCHASES_PROCESSED,
    SHARES_STORED,
    metrics_response,
)
from djinn_validator.api.middleware import (
    RateLimitMiddleware,
    RateLimiter,
    RequestIdMiddleware,
    get_cors_origins,
    validate_signed_request,
)
from djinn_validator.api.models import (
    AnalyticsRequest,
    HealthResponse,
    MPCInitRequest,
    MPCInitResponse,
    MPCResultRequest,
    MPCResultResponse,
    MPCRound1Request,
    MPCRound1Response,
    MPCSessionStatusResponse,
    OutcomeRequest,
    OutcomeResponse,
    PurchaseRequest,
    PurchaseResponse,
    ReadinessResponse,
    RegisterSignalRequest,
    RegisterSignalResponse,
    ResolveResponse,
    StoreShareRequest,
    StoreShareResponse,
)
from djinn_validator.core.mpc import (
    MPCResult,
    Round1Message,
    check_availability,
    compute_local_contribution,
)
from djinn_validator.core.mpc_coordinator import MPCCoordinator, SessionStatus
from djinn_validator.core.mpc_orchestrator import MPCOrchestrator
from djinn_validator.core.outcomes import (
    Outcome,
    OutcomeAttestor,
    SignalMetadata,
    parse_pick,
)
from djinn_validator.core.purchase import PurchaseOrchestrator, PurchaseStatus
from djinn_validator.core.shares import ShareStore
from djinn_validator.utils.crypto import Share

if TYPE_CHECKING:
    from djinn_validator.bt.neuron import DjinnValidator
    from djinn_validator.chain.contracts import ChainClient

log = structlog.get_logger()


def create_app(
    share_store: ShareStore,
    purchase_orch: PurchaseOrchestrator,
    outcome_attestor: OutcomeAttestor,
    chain_client: "ChainClient | None" = None,
    neuron: "DjinnValidator | None" = None,
    mpc_coordinator: "MPCCoordinator | None" = None,
    rate_limit_capacity: int = 60,
    rate_limit_rate: int = 10,
) -> FastAPI:
    """Create the FastAPI application with injected dependencies."""
    app = FastAPI(
        title="Djinn Validator",
        version="0.1.0",
        description="Djinn Protocol Bittensor Validator API",
    )

    # Catch unhandled exceptions — never leak stack traces to clients
    @app.exception_handler(Exception)
    async def _unhandled_error(_request: Request, exc: Exception) -> StarletteJSONResponse:
        log.error("unhandled_exception", error=str(exc), exc_info=True)
        return StarletteJSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # CORS — restricted in production, open in dev
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
            from starlette.responses import JSONResponse
            return JSONResponse(status_code=413, content={"detail": "Request body too large (max 1MB)"})
        return await call_next(request)

    # Rate limiting
    limiter = RateLimiter(default_capacity=rate_limit_capacity, default_rate=rate_limit_rate)
    limiter.set_path_limit("/v1/signal", capacity=20, rate=2)  # Share storage: 2/sec
    limiter.set_path_limit("/v1/signals/resolve", capacity=10, rate=1)  # Resolution: 1/sec
    limiter.set_path_limit("/v1/mpc/", capacity=100, rate=50)  # MPC: higher for multi-round
    limiter.set_path_limit("/v1/analytics", capacity=30, rate=5)  # Analytics: 5/sec
    app.add_middleware(RateLimitMiddleware, limiter=limiter)

    # Request ID tracing (outermost — must be added last)
    app.add_middleware(RequestIdMiddleware)

    @app.post("/v1/signal", response_model=StoreShareResponse)
    async def store_share(req: StoreShareRequest) -> StoreShareResponse:
        """Accept and store an encrypted key share from a Genius."""
        from djinn_validator.utils.crypto import BN254_PRIME

        try:
            share_y = int(req.share_y, 16)
            encrypted = bytes.fromhex(req.encrypted_key_share)
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid hex encoding: {e}")

        if share_y >= BN254_PRIME:
            raise HTTPException(status_code=400, detail="share_y must be less than BN254 prime")

        share = Share(x=req.share_x, y=share_y)

        share_store.store(
            signal_id=req.signal_id,
            genius_address=req.genius_address,
            share=share,
            encrypted_key_share=encrypted,
        )

        SHARES_STORED.inc()
        ACTIVE_SHARES.set(share_store.count)

        return StoreShareResponse(signal_id=req.signal_id, stored=True)

    @app.post("/v1/signal/{signal_id}/purchase", response_model=PurchaseResponse)
    async def purchase_signal(signal_id: str, req: PurchaseRequest) -> PurchaseResponse:
        """Handle a buyer's purchase request.

        Flow:
        1. Verify signal exists and is active
        2. Run MPC to check if real index ∈ available indices
        3. If available, release encrypted key share
        """
        # Clean up expired MPC sessions before starting new ones
        _mpc.cleanup_expired()

        # Check we hold a share for this signal
        record = share_store.get(signal_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Signal not found on this validator")

        # Initiate purchase
        purchase = purchase_orch.initiate(signal_id, req.buyer_address, req.sportsbook)
        if purchase.status == PurchaseStatus.FAILED:
            return PurchaseResponse(
                signal_id=signal_id,
                status="failed",
                available=None,
                message="Purchase initiation failed",
            )

        # Run MPC availability check (multi-validator or single-validator fallback)
        available_set = set(req.available_indices)
        mpc_result = await _orchestrator.check_availability(
            signal_id=signal_id,
            local_share=record.share,
            available_indices=available_set,
        )

        purchase_orch.set_mpc_result(signal_id, req.buyer_address, mpc_result)

        if not mpc_result.available:
            PURCHASES_PROCESSED.labels(result="unavailable").inc()
            return PurchaseResponse(
                signal_id=signal_id,
                status="unavailable",
                available=False,
                message="Signal not available at this sportsbook",
            )

        # In production: wait for on-chain payment verification.
        # For now, release share directly (payment check would be async).
        purchase_orch.confirm_payment(signal_id, req.buyer_address, "pending")

        share_data = share_store.release(signal_id, req.buyer_address)
        if share_data is None:
            return PurchaseResponse(
                signal_id=signal_id,
                status="error",
                available=True,
                message="Share release failed",
            )

        PURCHASES_PROCESSED.labels(result="available").inc()
        ACTIVE_SHARES.set(share_store.count)

        return PurchaseResponse(
            signal_id=signal_id,
            status="complete",
            available=True,
            encrypted_key_share=share_data.hex(),
            message="Key share released",
        )

    @app.post("/v1/signal/{signal_id}/register", response_model=RegisterSignalResponse)
    async def register_signal(signal_id: str, req: RegisterSignalRequest) -> RegisterSignalResponse:
        """Register a purchased signal for automatic outcome tracking."""
        pick = parse_pick(req.pick)
        metadata = SignalMetadata(
            signal_id=signal_id,
            sport=req.sport,
            event_id=req.event_id,
            home_team=req.home_team,
            away_team=req.away_team,
            pick=pick,
        )
        outcome_attestor.register_signal(metadata)
        return RegisterSignalResponse(
            signal_id=signal_id,
            registered=True,
            market=pick.market,
        )

    @app.post("/v1/signals/resolve", response_model=ResolveResponse)
    async def resolve_signals() -> ResolveResponse:
        """Check all pending signals and resolve any with completed games."""
        hotkey = ""
        if neuron:
            hotkey = neuron.wallet.hotkey.ss58_address if neuron.wallet else ""

        attestations = await outcome_attestor.resolve_all_pending(hotkey)
        results = [
            {
                "signal_id": a.signal_id,
                "outcome": a.outcome.name,
                "event_id": a.event_result.event_id,
                "home_score": a.event_result.home_score,
                "away_score": a.event_result.away_score,
            }
            for a in attestations
        ]
        return ResolveResponse(resolved_count=len(attestations), results=results)

    @app.post("/v1/signal/{signal_id}/outcome", response_model=OutcomeResponse)
    async def attest_outcome(signal_id: str, req: OutcomeRequest) -> OutcomeResponse:
        """Submit an outcome attestation for a signal."""
        event_result = await outcome_attestor.fetch_event_result(req.event_id)
        outcome = Outcome(req.outcome)

        outcome_attestor.attest(
            signal_id=signal_id,
            validator_hotkey=req.validator_hotkey,
            outcome=outcome,
            event_result=event_result,
        )
        OUTCOMES_ATTESTED.labels(outcome=outcome.value).inc()

        # Check if consensus is reached
        if neuron and neuron.metagraph:
            total_validators = sum(
                1 for uid in range(neuron.metagraph.n.item())
                if neuron.metagraph.validator_permit[uid].item()
            )
        else:
            total_validators = 1  # Single-validator dev mode
            log.warning("no_metagraph", msg="Using total_validators=1 (no metagraph available)")

        consensus = outcome_attestor.check_consensus(signal_id, total_validators)

        return OutcomeResponse(
            signal_id=signal_id,
            outcome=req.outcome,
            consensus_reached=consensus is not None,
            consensus_outcome=consensus.value if consensus else None,
        )

    @app.post("/v1/analytics/attempt")
    async def analytics(req: AnalyticsRequest) -> dict:
        """Fire-and-forget analytics endpoint."""
        log.info("analytics", event_type=req.event_type, data=req.data)
        return {"received": True}

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Health check endpoint."""
        chain_ok = False
        if chain_client:
            try:
                chain_ok = await chain_client.is_connected()
            except Exception as e:
                log.warning("chain_health_check_failed", error=str(e))

        return HealthResponse(
            status="ok",
            uid=neuron.uid if neuron else None,
            shares_held=share_store.count,
            pending_outcomes=len(outcome_attestor.get_pending_signals()),
            chain_connected=chain_ok,
            bt_connected=neuron is not None and neuron.uid is not None,
        )

    @app.get("/health/ready", response_model=ReadinessResponse)
    async def readiness() -> ReadinessResponse:
        """Deep readiness probe — checks RPC, contracts, and dependencies."""
        checks: dict[str, bool] = {}

        # Check RPC connectivity
        if chain_client:
            try:
                checks["rpc"] = await chain_client.is_connected()
            except Exception:
                checks["rpc"] = False
        else:
            checks["rpc"] = False

        # Check contract addresses are configured (non-zero)
        from djinn_validator.config import Config
        cfg = Config()
        zero = "0" * 40
        checks["escrow_configured"] = bool(cfg.escrow_address) and zero not in cfg.escrow_address
        checks["signal_configured"] = bool(cfg.signal_commitment_address) and zero not in cfg.signal_commitment_address
        checks["account_configured"] = bool(cfg.account_address) and zero not in cfg.account_address
        checks["collateral_configured"] = bool(cfg.collateral_address) and zero not in cfg.collateral_address

        # Check sports API key
        checks["sports_api_key"] = bool(cfg.sports_api_key)

        # Bittensor connectivity
        checks["bt_connected"] = neuron is not None and neuron.uid is not None

        ready = all(checks.values())
        return ReadinessResponse(ready=ready, checks=checks)

    # ------------------------------------------------------------------
    # MPC orchestration
    # ------------------------------------------------------------------
    _mpc = mpc_coordinator or MPCCoordinator()
    _orchestrator = MPCOrchestrator(
        coordinator=_mpc,
        neuron=neuron,
        threshold=7,
    )

    # Collect validator hotkeys from metagraph for auth
    def _get_validator_hotkeys() -> set[str] | None:
        """Get set of validator hotkeys from metagraph for MPC auth."""
        if neuron is None or neuron.metagraph is None:
            return None  # No auth in dev mode
        hotkeys = set()
        for uid in range(neuron.metagraph.n.item()):
            if neuron.metagraph.validator_permit[uid].item():
                hotkeys.add(neuron.metagraph.hotkeys[uid])
        return hotkeys if hotkeys else None

    @app.post("/v1/mpc/init", response_model=MPCInitResponse)
    async def mpc_init(req: MPCInitRequest, request: Request) -> MPCInitResponse:
        """Accept an MPC session invitation from the coordinator."""
        await validate_signed_request(request, _get_validator_hotkeys())

        # Clean up expired sessions to prevent memory leak
        _mpc.cleanup_expired()

        session = _mpc.get_session(req.session_id)
        if session is not None:
            return MPCInitResponse(
                session_id=req.session_id,
                accepted=True,
                message="Session already exists",
            )

        # Create session locally (participant mirrors coordinator state)
        session = _mpc.create_session(
            signal_id=req.signal_id,
            available_indices=req.available_indices,
            coordinator_x=req.coordinator_x,
            participant_xs=req.participant_xs,
            threshold=req.threshold,
        )
        # Override the session_id to match coordinator's
        _mpc._sessions.pop(session.session_id)
        session.session_id = req.session_id
        _mpc._sessions[req.session_id] = session

        return MPCInitResponse(
            session_id=req.session_id,
            accepted=True,
        )

    @app.post("/v1/mpc/round1", response_model=MPCRound1Response)
    async def mpc_round1(req: MPCRound1Request, request: Request) -> MPCRound1Response:
        """Accept a Round 1 message for a multiplication gate."""
        await validate_signed_request(request, _get_validator_hotkeys())
        try:
            d_val = int(req.d_value, 16)
            e_val = int(req.e_value, 16)
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid hex value: {e}")
        msg = Round1Message(
            validator_x=req.validator_x,
            d_value=d_val,
            e_value=e_val,
        )
        ok = _mpc.submit_round1(req.session_id, req.gate_idx, msg)
        return MPCRound1Response(
            session_id=req.session_id,
            gate_idx=req.gate_idx,
            accepted=ok,
        )

    @app.post("/v1/mpc/result", response_model=MPCResultResponse)
    async def mpc_result(req: MPCResultRequest, request: Request) -> MPCResultResponse:
        """Accept the coordinator's final MPC result broadcast."""
        await validate_signed_request(request, _get_validator_hotkeys())
        session = _mpc.get_session(req.session_id)
        if session is None:
            return MPCResultResponse(
                session_id=req.session_id,
                acknowledged=False,
            )

        session.result = MPCResult(
            available=req.available,
            participating_validators=req.participating_validators,
        )
        session.status = SessionStatus.COMPLETE

        log.info(
            "mpc_result_received",
            session_id=req.session_id,
            signal_id=req.signal_id,
            available=req.available,
        )

        return MPCResultResponse(
            session_id=req.session_id,
            acknowledged=True,
        )

    @app.get("/v1/mpc/{session_id}/status", response_model=MPCSessionStatusResponse)
    async def mpc_status(session_id: str) -> MPCSessionStatusResponse:
        """Check the status of an MPC session."""
        session = _mpc.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="MPC session not found")

        # Count Round 1 responses for the first gate as a proxy
        responded = len(session.round1_messages.get(0, []))

        return MPCSessionStatusResponse(
            session_id=session_id,
            status=session.status.name.lower(),
            available=session.result.available if session.result else None,
            participants_responded=responded,
            total_participants=len(session.participant_xs),
        )

    @app.get("/metrics")
    async def metrics() -> bytes:
        """Prometheus metrics endpoint."""
        from fastapi.responses import Response
        return Response(
            content=metrics_response(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    return app

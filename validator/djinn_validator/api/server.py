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

import asyncio
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
    MPCAbortRequest,
    MPCAbortResponse,
    MPCComputeGateRequest,
    MPCComputeGateResponse,
    MPCInitRequest,
    MPCInitResponse,
    MPCResultRequest,
    MPCResultResponse,
    MPCRound1Request,
    MPCRound1Response,
    MPCSessionStatusResponse,
    OTChoicesRequest,
    OTChoicesResponse,
    OTCompleteRequest,
    OTCompleteResponse,
    OTSetupRequest,
    OTSetupResponse,
    OTSharesRequest,
    OTSharesResponse,
    OTTransfersRequest,
    OTTransfersResponse,
    OutcomeRequest,
    OutcomeResponse,
    PurchaseRequest,
    PurchaseResponse,
    ReadinessResponse,
    RegisterSignalRequest,
    RegisterSignalResponse,
    ResolveResponse,
    ShareInfoResponse,
    StoreShareRequest,
    StoreShareResponse,
)
from djinn_validator.core.mpc import (
    DistributedParticipantState,
    MPCResult,
    Round1Message,
    check_availability,
    compute_local_contribution,
)
from djinn_validator.core.mpc_coordinator import MPCCoordinator, SessionStatus
from djinn_validator.core.mpc_orchestrator import MPCOrchestrator
from djinn_validator.core.outcomes import (
    SUPPORTED_SPORTS,
    Outcome,
    OutcomeAttestor,
    SignalMetadata,
    parse_pick,
)
from djinn_validator.core.purchase import PurchaseOrchestrator, PurchaseStatus
from djinn_validator.core.shares import ShareStore
from djinn_validator.utils.crypto import Share

import hashlib
import re

_SIGNAL_ID_PATH_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,256}$")


def _validate_signal_id_path(signal_id: str) -> None:
    """Validate signal_id path parameter format."""
    if not _SIGNAL_ID_PATH_RE.match(signal_id):
        raise HTTPException(status_code=400, detail="Invalid signal_id format")


def _signal_id_to_uint256(signal_id: str) -> int:
    """Convert a string signal ID to a uint256 for on-chain lookups.

    Uses keccak256 to deterministically map arbitrary-length string IDs
    to the uint256 space expected by Solidity contracts.
    """
    from web3 import Web3
    return int.from_bytes(Web3.solidity_keccak(["string"], [signal_id]), "big")


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
    async def _unhandled_error(request: Request, exc: Exception) -> StarletteJSONResponse:
        log.error(
            "unhandled_exception",
            error=str(exc),
            path=request.url.path,
            method=request.method,
            exc_info=True,
        )
        return StarletteJSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # CORS — restricted in production, open in dev
    cors_origins = get_cors_origins(os.getenv("CORS_ORIGINS", ""), os.getenv("BT_NETWORK", ""))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request body size limit (1MB default, 5MB for OT endpoints)
    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):  # type: ignore[no-untyped-def]
        content_length = request.headers.get("content-length")
        if content_length:
            # OT endpoints carry larger payloads (DH group elements)
            max_size = 5_242_880 if request.url.path.startswith("/v1/mpc/ot/") else 1_048_576
            try:
                if int(content_length) > max_size:
                    from starlette.responses import JSONResponse
                    return JSONResponse(status_code=413, content={"detail": f"Request body too large (max {max_size // 1048576}MB)"})
            except (ValueError, OverflowError):
                from starlette.responses import JSONResponse
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})
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
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid hex encoding in share data")

        if share_y < 0:
            raise HTTPException(status_code=400, detail="share_y must be non-negative")
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
        _validate_signal_id_path(signal_id)

        # Clean up expired MPC sessions and old purchases
        _mpc.cleanup_expired()
        purchase_orch.cleanup_stale()
        purchase_orch.cleanup_completed()

        # Check we hold a share for this signal
        record = share_store.get(signal_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Signal not found on this validator")

        # Initiate purchase
        purchase = purchase_orch.initiate(signal_id, req.buyer_address, req.sportsbook)
        if purchase.status == PurchaseStatus.FAILED:
            raise HTTPException(status_code=500, detail="Purchase initiation failed")

        # Run MPC availability check (multi-validator or single-validator fallback)
        available_set = set(req.available_indices)
        try:
            mpc_result = await asyncio.wait_for(
                _orchestrator.check_availability(
                    signal_id=signal_id,
                    local_share=record.share,
                    available_indices=available_set,
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            PURCHASES_PROCESSED.labels(result="error").inc()
            raise HTTPException(status_code=504, detail="MPC availability check timed out")

        purchase_orch.set_mpc_result(signal_id, req.buyer_address, mpc_result)

        if not mpc_result.available:
            PURCHASES_PROCESSED.labels(result="unavailable").inc()
            return PurchaseResponse(
                signal_id=signal_id,
                status="unavailable",
                available=False,
                message="Signal not available at this sportsbook",
            )

        # Verify on-chain payment before releasing share
        if chain_client is not None:
            try:
                on_chain_id = _signal_id_to_uint256(signal_id)
                purchase_record = await asyncio.wait_for(
                    chain_client.verify_purchase(on_chain_id, req.buyer_address),
                    timeout=10.0,
                )
                if purchase_record.get("pricePaid", 0) == 0:
                    PURCHASES_PROCESSED.labels(result="payment_required").inc()
                    return PurchaseResponse(
                        signal_id=signal_id,
                        status="payment_required",
                        available=True,
                        message="On-chain payment not found. Call Escrow.purchase() first.",
                    )
                tx_hash = f"verified-{on_chain_id}"
            except asyncio.TimeoutError:
                log.error("payment_verification_timeout", signal_id=signal_id)
                raise HTTPException(
                    status_code=504, detail="Payment verification timed out",
                )
            except Exception as e:
                log.error("payment_verification_error", signal_id=signal_id, err=str(e))
                raise HTTPException(
                    status_code=502, detail="Payment verification failed",
                )
        else:
            # Dev mode: no chain client configured — skip payment check
            log.warning(
                "payment_check_skipped",
                signal_id=signal_id,
                reason="no chain client configured",
            )
            tx_hash = "dev-mode-no-verification"

        purchase_orch.confirm_payment(signal_id, req.buyer_address, tx_hash)

        share_data = share_store.release(signal_id, req.buyer_address)
        if share_data is None:
            raise HTTPException(status_code=500, detail="Share release failed")

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
        _validate_signal_id_path(signal_id)
        if req.sport not in SUPPORTED_SPORTS:
            raise HTTPException(status_code=400, detail="Unsupported sport key")
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

        try:
            attestations = await asyncio.wait_for(
                outcome_attestor.resolve_all_pending(hotkey),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            log.error("resolve_all_pending_timeout")
            raise HTTPException(status_code=504, detail="Signal resolution timed out")
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
        _validate_signal_id_path(signal_id)
        try:
            event_result = await asyncio.wait_for(
                outcome_attestor.fetch_event_result(req.event_id),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            log.error("fetch_event_result_timeout", event_id=req.event_id)
            raise HTTPException(status_code=504, detail="Event result fetch timed out")
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

    # Cache Config for readiness checks (avoid re-loading dotenv on every probe)
    from djinn_validator.config import Config as _ConfigCls
    _readiness_config = _ConfigCls()

    @app.get("/health/ready", response_model=ReadinessResponse)
    async def readiness() -> ReadinessResponse:
        """Deep readiness probe — checks RPC, contracts, and dependencies."""
        checks: dict[str, bool] = {}

        # Check RPC connectivity
        if chain_client:
            try:
                checks["rpc"] = await chain_client.is_connected()
            except Exception as e:
                log.warning("readiness_check_failed", check="rpc", error=str(e))
                checks["rpc"] = False
        else:
            checks["rpc"] = False

        # Check contract addresses are configured (non-zero)
        try:
            cfg = _readiness_config
            zero = "0" * 40
            checks["escrow_configured"] = bool(cfg.escrow_address) and zero not in cfg.escrow_address
            checks["signal_configured"] = bool(cfg.signal_commitment_address) and zero not in cfg.signal_commitment_address
            checks["account_configured"] = bool(cfg.account_address) and zero not in cfg.account_address
            checks["collateral_configured"] = bool(cfg.collateral_address) and zero not in cfg.collateral_address
            checks["sports_api_key"] = bool(cfg.sports_api_key)
        except Exception as e:
            log.warning("readiness_config_error", error=str(e))
            checks["escrow_configured"] = False
            checks["signal_configured"] = False
            checks["account_configured"] = False
            checks["collateral_configured"] = False
            checks["sports_api_key"] = False

        # Bittensor connectivity
        checks["bt_connected"] = neuron is not None and neuron.uid is not None

        # Database accessibility
        try:
            _ = share_store.count
            checks["database"] = True
        except Exception as e:
            log.warning("readiness_check_failed", check="database", error=str(e))
            checks["database"] = False

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

    # Per-session participant state for the distributed MPC protocol.
    # Keyed by session_id. Stores either DistributedParticipantState (semi-honest)
    # or AuthenticatedParticipantState (SPDZ malicious security).
    import threading as _threading
    from djinn_validator.core.spdz import AuthenticatedParticipantState, AuthenticatedShare, MACKeyShare
    _participant_states: dict[str, DistributedParticipantState | AuthenticatedParticipantState] = {}
    _participant_lock = _threading.Lock()

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
        if not _mpc.replace_session_id(session.session_id, req.session_id):
            raise HTTPException(status_code=409, detail="Session ID conflict")

        # Create distributed participant state if r_share provided
        if req.r_share_y is not None:
            # Look up our local share for this signal
            record = share_store.get(req.signal_id)
            if record is None:
                log.warning("mpc_init_no_share", signal_id=req.signal_id)
                return MPCInitResponse(
                    session_id=req.session_id,
                    accepted=False,
                    message="No share held for this signal",
                )

            try:
                if req.authenticated and req.auth_triple_shares and req.alpha_share and req.auth_r_share:
                    # SPDZ authenticated mode
                    alpha_val = int(req.alpha_share, 16)
                    r_y = int(req.auth_r_share["y"], 16)
                    r_mac = int(req.auth_r_share["mac"], 16)

                    # Use auth_secret_share if provided, otherwise create from local share
                    if req.auth_secret_share:
                        s_y = int(req.auth_secret_share["y"], 16)
                        s_mac = int(req.auth_secret_share["mac"], 16)
                    else:
                        s_y = record.share.y
                        s_mac = 0  # Will fail MAC check if actually used

                    auth_ta = []
                    auth_tb = []
                    auth_tc = []
                    for ts in req.auth_triple_shares:
                        auth_ta.append(AuthenticatedShare(
                            x=record.share.x,
                            y=int(ts["a"]["y"], 16),
                            mac=int(ts["a"]["mac"], 16),
                        ))
                        auth_tb.append(AuthenticatedShare(
                            x=record.share.x,
                            y=int(ts["b"]["y"], 16),
                            mac=int(ts["b"]["mac"], 16),
                        ))
                        auth_tc.append(AuthenticatedShare(
                            x=record.share.x,
                            y=int(ts["c"]["y"], 16),
                            mac=int(ts["c"]["mac"], 16),
                        ))

                    state: DistributedParticipantState | AuthenticatedParticipantState = AuthenticatedParticipantState(
                        validator_x=record.share.x,
                        secret_share=AuthenticatedShare(x=record.share.x, y=s_y, mac=s_mac),
                        r_share=AuthenticatedShare(x=record.share.x, y=r_y, mac=r_mac),
                        alpha_share=MACKeyShare(x=record.share.x, alpha_share=alpha_val),
                        available_indices=req.available_indices,
                        triple_a=auth_ta,
                        triple_b=auth_tb,
                        triple_c=auth_tc,
                    )
                else:
                    # Semi-honest mode
                    r_share = int(req.r_share_y, 16)
                    triple_a = [int(ts.get("a", "0"), 16) for ts in req.triple_shares]
                    triple_b = [int(ts.get("b", "0"), 16) for ts in req.triple_shares]
                    triple_c = [int(ts.get("c", "0"), 16) for ts in req.triple_shares]

                    state = DistributedParticipantState(
                        validator_x=record.share.x,
                        secret_share_y=record.share.y,
                        r_share_y=r_share,
                        available_indices=req.available_indices,
                        triple_a=triple_a,
                        triple_b=triple_b,
                        triple_c=triple_c,
                    )
            except (ValueError, TypeError) as e:
                raise HTTPException(status_code=400, detail=f"Invalid hex in MPC init data: {e}")

            with _participant_lock:
                _participant_states[req.session_id] = state

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
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid hex value in MPC round1 data")
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

    @app.post("/v1/mpc/compute_gate", response_model=MPCComputeGateResponse)
    async def mpc_compute_gate(req: MPCComputeGateRequest, request: Request) -> MPCComputeGateResponse:
        """Compute this validator's (d_i, e_i) for a multiplication gate."""
        await validate_signed_request(request, _get_validator_hotkeys())

        # Reject if session has been aborted
        session = _mpc.get_session(req.session_id)
        if session is not None and session.status == SessionStatus.FAILED:
            raise HTTPException(status_code=409, detail="Session aborted")

        with _participant_lock:
            state = _participant_states.get(req.session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="No participant state for this session")

        prev_d = int(req.prev_opened_d, 16) if req.prev_opened_d else None
        prev_e = int(req.prev_opened_e, 16) if req.prev_opened_e else None

        try:
            if isinstance(state, AuthenticatedParticipantState):
                # Finalize previous gate if we have opened values
                if prev_d is not None and prev_e is not None and req.gate_idx > 0:
                    state.finalize_gate(prev_d, prev_e)
                d_i, e_i, d_mac, e_mac = state.compute_gate(req.gate_idx, prev_d, prev_e)
                return MPCComputeGateResponse(
                    session_id=req.session_id,
                    gate_idx=req.gate_idx,
                    d_value=hex(d_i),
                    e_value=hex(e_i),
                    d_mac=hex(d_mac),
                    e_mac=hex(e_mac),
                )
            else:
                d_i, e_i = state.compute_gate(req.gate_idx, prev_d, prev_e)
                return MPCComputeGateResponse(
                    session_id=req.session_id,
                    gate_idx=req.gate_idx,
                    d_value=hex(d_i),
                    e_value=hex(e_i),
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/v1/mpc/result", response_model=MPCResultResponse)
    async def mpc_result(req: MPCResultRequest, request: Request) -> MPCResultResponse:
        """Accept the coordinator's final MPC result broadcast."""
        await validate_signed_request(request, _get_validator_hotkeys())
        result = MPCResult(
            available=req.available,
            participating_validators=req.participating_validators,
        )
        if not _mpc.set_result(req.session_id, result):
            log.warning(
                "mpc_result_rejected",
                session_id=req.session_id,
                signal_id=req.signal_id,
                reason="session not found or result already set",
            )
            return MPCResultResponse(
                session_id=req.session_id,
                acknowledged=False,
            )

        log.info(
            "mpc_result_received",
            session_id=req.session_id,
            signal_id=req.signal_id,
            available=req.available,
        )

        # Clean up participant state
        with _participant_lock:
            _participant_states.pop(req.session_id, None)

        return MPCResultResponse(
            session_id=req.session_id,
            acknowledged=True,
        )

    @app.post("/v1/mpc/abort", response_model=MPCAbortResponse)
    async def mpc_abort(req: MPCAbortRequest, request: Request) -> MPCAbortResponse:
        """Accept an abort notification from the coordinator.

        When a validator detects MAC verification failure during an
        authenticated MPC session, the coordinator broadcasts an abort
        to all participants. Each participant marks the session as FAILED
        and cleans up participant state.
        """
        await validate_signed_request(request, _get_validator_hotkeys())
        session = _mpc.get_session(req.session_id)
        if session is None:
            return MPCAbortResponse(session_id=req.session_id, acknowledged=False)

        # Mark session as failed
        with _mpc._lock:
            session.status = SessionStatus.FAILED
        log.warning(
            "mpc_abort_received",
            session_id=req.session_id,
            reason=req.reason,
            gate_idx=req.gate_idx,
            offending_x=req.offending_validator_x,
        )

        # Clean up participant state
        with _participant_lock:
            _participant_states.pop(req.session_id, None)

        return MPCAbortResponse(session_id=req.session_id, acknowledged=True)

    @app.get("/v1/mpc/{session_id}/status", response_model=MPCSessionStatusResponse)
    async def mpc_status(session_id: str) -> MPCSessionStatusResponse:
        """Check the status of an MPC session."""
        _validate_signal_id_path(session_id)
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

    # ------------------------------------------------------------------
    # Signal share info (for peer share discovery)
    # ------------------------------------------------------------------

    @app.get("/v1/signal/{signal_id}/share_info", response_model=ShareInfoResponse)
    async def share_info(signal_id: str, request: Request) -> ShareInfoResponse:
        """Return this validator's share x-coordinate for MPC peer discovery."""
        _validate_signal_id_path(signal_id)
        await validate_signed_request(request, _get_validator_hotkeys())

        record = share_store.get(signal_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Signal not found on this validator")

        return ShareInfoResponse(
            signal_id=signal_id,
            share_x=record.share.x,
            share_y=hex(record.share.y),
        )

    # ------------------------------------------------------------------
    # OT network endpoints (distributed triple generation)
    # ------------------------------------------------------------------

    from djinn_validator.core.ot_network import OTTripleGenState

    _ot_states: dict[str, OTTripleGenState] = {}
    _ot_lock = _threading.Lock()

    @app.post("/v1/mpc/ot/setup", response_model=OTSetupResponse)
    async def ot_setup(req: OTSetupRequest, request: Request) -> OTSetupResponse:
        """Initialize distributed triple generation on this peer."""
        await validate_signed_request(request, _get_validator_hotkeys())

        with _ot_lock:
            if req.session_id in _ot_states:
                state = _ot_states[req.session_id]
                return OTSetupResponse(
                    session_id=req.session_id,
                    accepted=True,
                    sender_public_keys={
                        str(t): hex(pk)
                        for t, pk in state.get_sender_public_keys().items()
                    },
                )

            state = OTTripleGenState(
                session_id=req.session_id,
                party_role="peer",
                n_triples=req.n_triples,
                x_coords=req.x_coords,
                threshold=req.threshold,
            )
            state.initialize()
            _ot_states[req.session_id] = state

        return OTSetupResponse(
            session_id=req.session_id,
            accepted=True,
            sender_public_keys={
                str(t): hex(pk)
                for t, pk in state.get_sender_public_keys().items()
            },
        )

    @app.post("/v1/mpc/ot/choices", response_model=OTChoicesResponse)
    async def ot_choices(req: OTChoicesRequest, request: Request) -> OTChoicesResponse:
        """Generate and exchange OT choice commitments."""
        await validate_signed_request(request, _get_validator_hotkeys())

        with _ot_lock:
            state = _ot_states.get(req.session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OT session not found")

        from djinn_validator.core.ot_network import (
            deserialize_choices,
            deserialize_dh_public_key,
            serialize_choices,
        )

        # Deserialize peer's sender public keys
        peer_pks = {
            int(t): deserialize_dh_public_key(pk_hex)
            for t, pk_hex in req.peer_sender_pks.items()
        }

        # Generate this party's receiver choices
        our_choices = state.generate_receiver_choices(peer_pks)

        return OTChoicesResponse(
            session_id=req.session_id,
            choices={
                str(t): serialize_choices(c)
                for t, c in our_choices.items()
            },
        )

    @app.post("/v1/mpc/ot/transfers", response_model=OTTransfersResponse)
    async def ot_transfers(req: OTTransfersRequest, request: Request) -> OTTransfersResponse:
        """Process peer choices and return encrypted OT transfers."""
        await validate_signed_request(request, _get_validator_hotkeys())

        with _ot_lock:
            state = _ot_states.get(req.session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OT session not found")

        from djinn_validator.core.ot_network import (
            deserialize_choices,
            serialize_transfers,
        )

        # Deserialize peer's choices for our sender instances
        peer_choices_deserialized = {
            int(t): deserialize_choices(c)
            for t, c in req.peer_choices.items()
        }

        # Process: encrypt OT messages using our sender states
        transfers, sender_shares = state.process_sender_choices(peer_choices_deserialized)

        return OTTransfersResponse(
            session_id=req.session_id,
            transfers={
                str(t): serialize_transfers(pairs)
                for t, pairs in transfers.items()
            },
            sender_shares={
                str(t): hex(s)
                for t, s in sender_shares.items()
            },
        )

    @app.post("/v1/mpc/ot/complete", response_model=OTCompleteResponse)
    async def ot_complete(req: OTCompleteRequest, request: Request) -> OTCompleteResponse:
        """Decrypt peer transfers and compute Shamir polynomial evaluations."""
        await validate_signed_request(request, _get_validator_hotkeys())

        with _ot_lock:
            state = _ot_states.get(req.session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OT session not found")

        from djinn_validator.core.ot_network import deserialize_transfers

        # Decrypt the peer's encrypted transfers (where this party is receiver)
        peer_transfers_deserialized = {
            int(t): deserialize_transfers(pairs)
            for t, pairs in req.peer_transfers.items()
        }
        receiver_shares = state.decrypt_receiver_transfers(peer_transfers_deserialized)

        # Parse this party's own sender shares
        own_sender_shares = {
            int(t): int(s, 16)
            for t, s in req.own_sender_shares.items()
        }

        # Accumulate cross-term shares into c values
        state.accumulate_ot_shares(own_sender_shares, receiver_shares)

        # Compute Shamir polynomial evaluations for distribution
        state.compute_shamir_evaluations()

        return OTCompleteResponse(
            session_id=req.session_id,
            completed=True,
        )

    @app.post("/v1/mpc/ot/shares", response_model=OTSharesResponse)
    async def ot_shares(req: OTSharesRequest, request: Request) -> OTSharesResponse:
        """Serve Shamir polynomial evaluations to a requesting party.

        Each party contacts the OT peer directly to get the peer's partial
        triple shares.  This prevents the coordinator from seeing the peer's
        polynomial evaluations.
        """
        await validate_signed_request(request, _get_validator_hotkeys())

        with _ot_lock:
            state = _ot_states.get(req.session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OT session not found")

        shares = state.get_shamir_shares_for_party(req.party_x)
        if shares is None:
            raise HTTPException(
                status_code=425,
                detail="OT triple generation not yet complete",
            )

        return OTSharesResponse(
            session_id=req.session_id,
            triple_shares=[
                {k: hex(v) for k, v in ts.items()}
                for ts in shares
            ],
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

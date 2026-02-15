"""FastAPI server for the Djinn validator REST API.

Endpoints from Appendix A of the whitepaper:
- POST /v1/signal         — Accept encrypted key shares from Genius
- POST /v1/signal/{id}/purchase — Handle buyer purchase (MPC + share release)
- POST /v1/signal/{id}/outcome  — Submit outcome attestation
- POST /v1/analytics/attempt    — Fire-and-forget analytics
- GET  /health                  — Health check
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from djinn_validator.api.models import (
    AnalyticsRequest,
    HealthResponse,
    OutcomeRequest,
    OutcomeResponse,
    PurchaseRequest,
    PurchaseResponse,
    StoreShareRequest,
    StoreShareResponse,
)
from djinn_validator.core.mpc import (
    check_availability,
    compute_local_contribution,
)
from djinn_validator.core.outcomes import Outcome, OutcomeAttestor
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
) -> FastAPI:
    """Create the FastAPI application with injected dependencies."""
    app = FastAPI(
        title="Djinn Validator",
        version="0.1.0",
        description="Djinn Protocol Bittensor Validator API",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/v1/signal", response_model=StoreShareResponse)
    async def store_share(req: StoreShareRequest) -> StoreShareResponse:
        """Accept and store an encrypted key share from a Genius."""
        share = Share(x=req.share_x, y=int(req.share_y, 16))
        encrypted = bytes.fromhex(req.encrypted_key_share)

        share_store.store(
            signal_id=req.signal_id,
            genius_address=req.genius_address,
            share=share,
            encrypted_key_share=encrypted,
        )

        return StoreShareResponse(signal_id=req.signal_id, stored=True)

    @app.post("/v1/signal/{signal_id}/purchase", response_model=PurchaseResponse)
    async def purchase_signal(signal_id: str, req: PurchaseRequest) -> PurchaseResponse:
        """Handle a buyer's purchase request.

        Flow:
        1. Verify signal exists and is active
        2. Run MPC to check if real index ∈ available indices
        3. If available, release encrypted key share
        """
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

        # Run local MPC computation
        available_set = set(req.available_indices)
        all_xs = [record.share.x]  # Single-validator mode
        local_contrib = compute_local_contribution(record.share, all_xs)

        # In a full implementation, we'd gather contributions from other validators.
        # For now, we use just our local contribution (single-validator mode).
        mpc_result = check_availability([local_contrib], available_set, threshold=1)

        purchase_orch.set_mpc_result(signal_id, req.buyer_address, mpc_result)

        if not mpc_result.available:
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

        return PurchaseResponse(
            signal_id=signal_id,
            status="complete",
            available=True,
            encrypted_key_share=share_data.hex(),
            message="Key share released",
        )

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

        # Check if consensus is reached
        total_validators = 10  # Default; in production read from metagraph
        if neuron and neuron.metagraph:
            total_validators = sum(
                1 for uid in range(neuron.metagraph.n.item())
                if neuron.metagraph.validator_permit[uid].item()
            )

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
            except Exception:
                pass

        return HealthResponse(
            status="ok",
            uid=neuron.uid if neuron else None,
            shares_held=share_store.count,
            chain_connected=chain_ok,
            bt_connected=neuron is not None and neuron.uid is not None,
        )

    return app

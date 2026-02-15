"""Purchase flow orchestration.

Implements the purchase lifecycle from Appendix A:
1. Buyer -> Validator: POST /v1/signal/{id}/purchase
2. Validator -> Miners: Query line availability
3. Validators -> MPC: Is real index ∈ available set?
4. If available: call Escrow.purchase() on-chain
5. Payment verified: release key shares to buyer
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, auto

import structlog

from djinn_validator.core.mpc import MPCResult
from djinn_validator.core.shares import ShareStore

log = structlog.get_logger()


class PurchaseStatus(Enum):
    PENDING = auto()
    CHECKING_AVAILABILITY = auto()
    MPC_IN_PROGRESS = auto()
    UNAVAILABLE = auto()
    AWAITING_PAYMENT = auto()
    PAYMENT_CONFIRMED = auto()
    SHARES_RELEASED = auto()
    FAILED = auto()
    VOIDED = auto()


@dataclass
class PurchaseRequest:
    """Tracks the state of a purchase attempt."""

    signal_id: str
    buyer_address: str
    sportsbook: str
    status: PurchaseStatus = PurchaseStatus.PENDING
    mpc_result: MPCResult | None = None
    tx_hash: str | None = None
    created_at: float = field(default_factory=time.time)
    completed_at: float | None = None


class PurchaseOrchestrator:
    """Manages the purchase flow for this validator."""

    def __init__(self, share_store: ShareStore) -> None:
        self._store = share_store
        self._active: dict[str, PurchaseRequest] = {}  # keyed by signal_id:buyer

    def _key(self, signal_id: str, buyer: str) -> str:
        return f"{signal_id}:{buyer}"

    def initiate(
        self,
        signal_id: str,
        buyer_address: str,
        sportsbook: str,
    ) -> PurchaseRequest:
        """Start a new purchase flow."""
        key = self._key(signal_id, buyer_address)

        if key in self._active:
            existing = self._active[key]
            if existing.status not in (PurchaseStatus.FAILED, PurchaseStatus.VOIDED):
                log.warning("purchase_already_active", signal_id=signal_id, buyer=buyer_address)
                return existing

        if not self._store.has(signal_id):
            req = PurchaseRequest(
                signal_id=signal_id,
                buyer_address=buyer_address,
                sportsbook=sportsbook,
                status=PurchaseStatus.FAILED,
            )
            self._active[key] = req
            log.error("no_share_for_signal", signal_id=signal_id)
            return req

        req = PurchaseRequest(
            signal_id=signal_id,
            buyer_address=buyer_address,
            sportsbook=sportsbook,
            status=PurchaseStatus.CHECKING_AVAILABILITY,
        )
        self._active[key] = req
        log.info("purchase_initiated", signal_id=signal_id, buyer=buyer_address, sportsbook=sportsbook)
        return req

    def set_mpc_result(
        self,
        signal_id: str,
        buyer_address: str,
        result: MPCResult,
    ) -> PurchaseRequest | None:
        """Record MPC result for a purchase."""
        key = self._key(signal_id, buyer_address)
        req = self._active.get(key)
        if req is None:
            return None

        req.mpc_result = result
        if result.available:
            req.status = PurchaseStatus.AWAITING_PAYMENT
            log.info("signal_available", signal_id=signal_id)
        else:
            req.status = PurchaseStatus.UNAVAILABLE
            log.info("signal_unavailable", signal_id=signal_id)

        return req

    def confirm_payment(
        self,
        signal_id: str,
        buyer_address: str,
        tx_hash: str,
    ) -> PurchaseRequest | None:
        """Record on-chain payment confirmation and release shares."""
        key = self._key(signal_id, buyer_address)
        req = self._active.get(key)
        if req is None:
            return None

        req.tx_hash = tx_hash
        req.status = PurchaseStatus.PAYMENT_CONFIRMED

        # Release the key share
        share_data = self._store.release(signal_id, buyer_address)
        if share_data is not None:
            req.status = PurchaseStatus.SHARES_RELEASED
            req.completed_at = time.time()
            log.info("purchase_complete", signal_id=signal_id, buyer=buyer_address)
        else:
            req.status = PurchaseStatus.FAILED
            log.error("share_release_failed", signal_id=signal_id)

        return req

    def get(self, signal_id: str, buyer_address: str) -> PurchaseRequest | None:
        """Get status of a purchase."""
        return self._active.get(self._key(signal_id, buyer_address))

    def cleanup_completed(self, max_age_seconds: float = 86400) -> int:
        """Remove completed/failed/voided purchases older than max_age_seconds.

        Prevents unbounded growth of the in-memory _active dict.
        Returns count of removed entries.
        """
        now = time.time()
        terminal = (PurchaseStatus.SHARES_RELEASED, PurchaseStatus.FAILED, PurchaseStatus.VOIDED, PurchaseStatus.UNAVAILABLE)
        stale = [
            k for k, p in self._active.items()
            if p.status in terminal and now - p.created_at > max_age_seconds
        ]
        for k in stale:
            del self._active[k]
        if stale:
            log.info("purchases_cleaned", removed=len(stale))
        return len(stale)

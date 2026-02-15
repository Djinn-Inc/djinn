"""Key share storage and management.

Each Genius signal has its encryption key split into 10 Shamir shares,
distributed across validators. This module manages a validator's local
share store.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import structlog

from djinn_validator.utils.crypto import Share

log = structlog.get_logger()


@dataclass
class SignalShareRecord:
    """A validator's share for a single signal."""

    signal_id: str
    genius_address: str
    share: Share
    encrypted_key_share: bytes  # Share of the AES key, encrypted to this validator
    stored_at: float = field(default_factory=time.time)
    released_to: set[str] = field(default_factory=set)


class ShareStore:
    """In-memory store for signal key shares held by this validator.

    In production, this would be backed by encrypted persistent storage.
    """

    def __init__(self) -> None:
        self._shares: dict[str, SignalShareRecord] = {}

    def store(
        self,
        signal_id: str,
        genius_address: str,
        share: Share,
        encrypted_key_share: bytes,
    ) -> None:
        """Store a new key share for a signal."""
        if signal_id in self._shares:
            log.warning("share_already_stored", signal_id=signal_id)
            return

        self._shares[signal_id] = SignalShareRecord(
            signal_id=signal_id,
            genius_address=genius_address,
            share=share,
            encrypted_key_share=encrypted_key_share,
        )
        log.info("share_stored", signal_id=signal_id, genius=genius_address)

    def get(self, signal_id: str) -> SignalShareRecord | None:
        """Retrieve a share record by signal ID."""
        return self._shares.get(signal_id)

    def has(self, signal_id: str) -> bool:
        """Check if we hold a share for this signal."""
        return signal_id in self._shares

    def release(self, signal_id: str, buyer_address: str) -> bytes | None:
        """Release the encrypted key share to a buyer.

        Returns the encrypted key share bytes, or None if not found.
        Records the release to prevent double-claiming.
        """
        record = self._shares.get(signal_id)
        if record is None:
            log.warning("share_not_found", signal_id=signal_id)
            return None

        if buyer_address in record.released_to:
            log.info("share_already_released", signal_id=signal_id, buyer=buyer_address)
            return record.encrypted_key_share

        record.released_to.add(buyer_address)
        log.info("share_released", signal_id=signal_id, buyer=buyer_address)
        return record.encrypted_key_share

    def remove(self, signal_id: str) -> None:
        """Remove a share (e.g., signal voided or expired)."""
        self._shares.pop(signal_id, None)

    @property
    def count(self) -> int:
        return len(self._shares)

    def active_signals(self) -> list[str]:
        """List all signal IDs we hold shares for."""
        return list(self._shares.keys())

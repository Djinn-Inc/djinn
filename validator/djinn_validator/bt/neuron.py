"""Bittensor neuron integration for the Djinn validator.

Handles:
- Wallet and subtensor connection (without opentensor template)
- Metagraph sync
- Weight setting based on miner scores
- Epoch loop
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog

log = structlog.get_logger()

try:
    import bittensor as bt
except ImportError:
    bt = None  # type: ignore[assignment]
    log.warning("bittensor_not_installed", msg="Running without Bittensor SDK")


class DjinnValidator:
    """Bittensor validator neuron for Djinn Protocol subnet 103."""

    # Minimum blocks between weight updates (Bittensor tempo is ~100 blocks)
    MIN_WEIGHT_INTERVAL = 100

    def __init__(
        self,
        netuid: int = 103,
        network: str = "finney",
        wallet_name: str = "default",
        hotkey_name: str = "default",
    ) -> None:
        self.netuid = netuid
        self.network = network
        self._wallet_name = wallet_name
        self._hotkey_name = hotkey_name

        self.wallet: Any = None
        self.subtensor: Any = None
        self.metagraph: Any = None
        self.uid: int | None = None
        self._running = False
        self._last_weight_block: int = 0

    def setup(self) -> bool:
        """Initialize wallet, subtensor, and metagraph connections.

        Returns True if setup succeeded, False otherwise.
        """
        if bt is None:
            log.error("bittensor_required")
            return False

        try:
            self.wallet = bt.wallet(
                name=self._wallet_name,
                hotkey=self._hotkey_name,
            )
            log.info("wallet_loaded", coldkey=self.wallet.coldkeypub.ss58_address)

            self.subtensor = bt.subtensor(network=self.network)
            log.info("subtensor_connected", network=self.network)

            self.metagraph = self.subtensor.metagraph(self.netuid)
            log.info(
                "metagraph_synced",
                netuid=self.netuid,
                n=self._safe_item(self.metagraph.n),
            )

            # Find our UID
            hotkey = self.wallet.hotkey.ss58_address
            try:
                self.uid = list(self.metagraph.hotkeys).index(hotkey)
                log.info("validator_uid", uid=self.uid)
            except ValueError:
                log.warning("not_registered", hotkey=hotkey, netuid=self.netuid)
                return False

            return True

        except FileNotFoundError as e:
            log.error("setup_failed_wallet_not_found", error=str(e),
                      wallet=self._wallet_name, hotkey=self._hotkey_name)
            return False
        except Exception as e:
            log.error("setup_failed", error=str(e), error_type=type(e).__name__,
                      exc_info=True)
            return False

    @staticmethod
    def _safe_item(tensor_or_val: Any) -> int:
        """Safely extract an int from a tensor or raw value."""
        if hasattr(tensor_or_val, "item"):
            return int(tensor_or_val.item())
        return int(tensor_or_val)

    def sync_metagraph(self) -> None:
        """Re-sync the metagraph to pick up new registrations/deregistrations."""
        if self.subtensor and self.metagraph:
            self.metagraph.sync(subtensor=self.subtensor)
            log.debug("metagraph_synced", n=self._safe_item(self.metagraph.n))

    def set_weights(self, weights: dict[int, float]) -> bool:
        """Set miner weights on the Bittensor network.

        Args:
            weights: Mapping of miner UID -> weight (0-1, should sum to 1).

        Returns:
            True if weight setting succeeded.
        """
        if self.subtensor is None or self.wallet is None:
            log.warning("cannot_set_weights", reason="not initialized")
            return False

        if not weights:
            log.warning("no_weights_to_set")
            return False

        uids = list(weights.keys())
        vals = [weights[uid] for uid in uids]

        try:
            import torch

            result = self.subtensor.set_weights(
                netuid=self.netuid,
                wallet=self.wallet,
                uids=torch.tensor(uids, dtype=torch.int64),
                weights=torch.tensor(vals, dtype=torch.float32),
                wait_for_inclusion=True,
            )
            log.info("weights_set", uids=uids, success=result)
            return bool(result)
        except Exception as e:
            log.error("set_weights_failed", error=str(e))
            return False

    def get_miner_uids(self) -> list[int]:
        """Get UIDs of all active miners (non-validators) on the subnet."""
        if self.metagraph is None:
            return []

        miner_uids = []
        for uid in range(self._safe_item(self.metagraph.n)):
            permit = self.metagraph.validator_permit[uid]
            is_validator = bool(permit.item() if hasattr(permit, "item") else permit)
            if not is_validator:
                miner_uids.append(uid)
        return miner_uids

    def get_axon_info(self, uid: int) -> dict[str, Any]:
        """Get connection info for a miner's axon."""
        if self.metagraph is None:
            return {}

        axon = self.metagraph.axons[uid]
        return {
            "ip": axon.ip,
            "port": axon.port,
            "hotkey": axon.hotkey,
        }

    @property
    def block(self) -> int:
        """Current block number."""
        if self.subtensor is None:
            return 0
        try:
            return int(self.subtensor.block)
        except Exception:
            log.warning("block_access_failed")
            return 0

    def should_set_weights(self) -> bool:
        """Check if enough blocks have passed since last weight update."""
        if self.subtensor is None:
            return False
        current = self.block
        return (current - self._last_weight_block) >= self.MIN_WEIGHT_INTERVAL

    def record_weight_set(self) -> None:
        """Record the block at which weights were last set."""
        self._last_weight_block = self.block

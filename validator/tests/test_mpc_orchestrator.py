"""Tests for the MPC orchestrator."""

from __future__ import annotations

from unittest.mock import MagicMock, AsyncMock

import pytest

from djinn_validator.core.mpc_coordinator import MPCCoordinator
from djinn_validator.core.mpc_orchestrator import MPCOrchestrator
from djinn_validator.utils.crypto import Share, generate_signal_index_shares, split_secret


class TestSingleValidatorMode:
    """When no neuron/metagraph is available, falls back to prototype."""

    @pytest.mark.asyncio
    async def test_single_validator_available(self) -> None:
        """Signal index IS in available set."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=1)

        # k=1 means constant polynomial, single share suffices
        shares = split_secret(5, n=1, k=1)
        result = await orch.check_availability(
            signal_id="sig-1",
            local_share=shares[0],
            available_indices={1, 3, 5, 7, 9},
        )
        assert result.available is True

    @pytest.mark.asyncio
    async def test_single_validator_unavailable(self) -> None:
        """Signal index NOT in available set."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=1)

        shares = split_secret(5, n=1, k=1)
        result = await orch.check_availability(
            signal_id="sig-1",
            local_share=shares[0],
            available_indices={1, 3, 7, 9},  # 5 not included
        )
        assert result.available is False


class TestPeerDiscovery:
    """Test validator peer discovery from metagraph."""

    def test_no_neuron_returns_empty(self) -> None:
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        assert orch._get_peer_validators() == []

    def test_discovers_validators(self) -> None:
        coord = MPCCoordinator()
        neuron = MagicMock()
        neuron.uid = 0
        neuron.metagraph.n.item.return_value = 3
        neuron.metagraph.validator_permit = [
            MagicMock(item=MagicMock(return_value=True)),   # uid 0 (us)
            MagicMock(item=MagicMock(return_value=True)),   # uid 1 (peer)
            MagicMock(item=MagicMock(return_value=False)),  # uid 2 (miner)
        ]
        neuron.metagraph.hotkeys = ["key0", "key1", "key2"]

        axon0 = MagicMock(ip="1.1.1.1", port=8421)
        axon1 = MagicMock(ip="2.2.2.2", port=8421)
        axon2 = MagicMock(ip="3.3.3.3", port=8422)
        neuron.metagraph.axons = [axon0, axon1, axon2]

        orch = MPCOrchestrator(coordinator=coord, neuron=neuron)
        peers = orch._get_peer_validators()

        assert len(peers) == 1
        assert peers[0]["uid"] == 1
        assert peers[0]["hotkey"] == "key1"
        assert peers[0]["url"] == "http://2.2.2.2:8421"

    def test_skips_zero_ip(self) -> None:
        coord = MPCCoordinator()
        neuron = MagicMock()
        neuron.uid = 0
        neuron.metagraph.n.item.return_value = 2
        neuron.metagraph.validator_permit = [
            MagicMock(item=MagicMock(return_value=True)),
            MagicMock(item=MagicMock(return_value=True)),
        ]
        neuron.metagraph.hotkeys = ["key0", "key1"]
        neuron.metagraph.axons = [
            MagicMock(ip="1.1.1.1", port=8421),
            MagicMock(ip="0.0.0.0", port=8421),  # Not announced
        ]

        orch = MPCOrchestrator(coordinator=coord, neuron=neuron)
        assert len(orch._get_peer_validators()) == 0


class TestFallbackBehavior:
    """Test that orchestrator correctly falls back when peers unavailable."""

    @pytest.mark.asyncio
    async def test_no_peers_uses_prototype(self) -> None:
        """With no peers, uses single-validator prototype."""
        coord = MPCCoordinator()
        neuron = MagicMock()
        neuron.uid = 0
        neuron.metagraph.n.item.return_value = 1
        neuron.metagraph.validator_permit = [
            MagicMock(item=MagicMock(return_value=True)),
        ]
        neuron.metagraph.hotkeys = ["key0"]
        neuron.metagraph.axons = [MagicMock(ip="1.1.1.1", port=8421)]

        orch = MPCOrchestrator(coordinator=coord, neuron=neuron, threshold=1)
        shares = split_secret(3, n=1, k=1)

        result = await orch.check_availability(
            signal_id="sig-1",
            local_share=shares[0],
            available_indices={1, 3, 5},
        )
        assert result.available is True
        assert result.participating_validators == 1

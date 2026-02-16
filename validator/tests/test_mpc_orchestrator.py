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

    def test_skips_empty_ip(self) -> None:
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
            MagicMock(ip="", port=8421),
        ]
        orch = MPCOrchestrator(coordinator=coord, neuron=neuron)
        assert len(orch._get_peer_validators()) == 0


class TestCollectPeerShares:
    """Test _collect_peer_shares with various failure modes."""

    @pytest.mark.asyncio
    async def test_collects_shares_from_peers(self, httpx_mock) -> None:
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [
            {"uid": 1, "url": "http://peer1:8421"},
            {"uid": 2, "url": "http://peer2:8421"},
        ]
        httpx_mock.add_response(
            url="http://peer1:8421/v1/signal/sig-1/share_info",
            json={"share_x": 1, "share_y": "ff"},
        )
        httpx_mock.add_response(
            url="http://peer2:8421/v1/signal/sig-1/share_info",
            json={"share_x": 2, "share_y": "1a"},
        )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 2
        assert shares[0].x == 1
        assert shares[0].y == 0xFF

    @pytest.mark.asyncio
    async def test_partial_peer_failure(self, httpx_mock) -> None:
        """One peer returns 500 (retried), the other succeeds."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [
            {"uid": 1, "url": "http://peer1:8421"},
            {"uid": 2, "url": "http://peer2:8421"},
        ]
        # Register enough 500 responses for retries (initial + 2 retries = 3)
        for _ in range(orch._PEER_RETRIES + 1):
            httpx_mock.add_response(
                url="http://peer1:8421/v1/signal/sig-1/share_info",
                status_code=500,
            )
        httpx_mock.add_response(
            url="http://peer2:8421/v1/signal/sig-1/share_info",
            json={"share_x": 2, "share_y": "ab"},
        )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 1
        assert shares[0].x == 2

    @pytest.mark.asyncio
    async def test_malformed_json_response(self, httpx_mock) -> None:
        """Peer returns JSON missing required fields."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [{"uid": 1, "url": "http://peer1:8421"}]
        httpx_mock.add_response(
            url="http://peer1:8421/v1/signal/sig-1/share_info",
            json={"share_x": 1},  # Missing share_y
        )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 0

    @pytest.mark.asyncio
    async def test_invalid_hex_in_share_y(self, httpx_mock) -> None:
        """Peer returns non-hex share_y."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [{"uid": 1, "url": "http://peer1:8421"}]
        httpx_mock.add_response(
            url="http://peer1:8421/v1/signal/sig-1/share_info",
            json={"share_x": 1, "share_y": "not-hex!"},
        )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 0

    @pytest.mark.asyncio
    async def test_all_peers_fail(self, httpx_mock) -> None:
        """All peers fail (with retries) — returns empty list."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [
            {"uid": 1, "url": "http://peer1:8421"},
            {"uid": 2, "url": "http://peer2:8421"},
        ]
        for _ in range(orch._PEER_RETRIES + 1):
            httpx_mock.add_response(
                url="http://peer1:8421/v1/signal/sig-1/share_info",
                status_code=503,
            )
            httpx_mock.add_response(
                url="http://peer2:8421/v1/signal/sig-1/share_info",
                status_code=503,
            )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 0

    @pytest.mark.asyncio
    async def test_empty_peers_returns_empty(self) -> None:
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        shares = await orch._collect_peer_shares([], "sig-1")
        assert shares == []

    @pytest.mark.asyncio
    async def test_json_decode_error_handled(self, httpx_mock) -> None:
        """Peer returns non-JSON response — should be caught gracefully."""
        import httpx as httpx_lib
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None)
        peers = [{"uid": 1, "url": "http://peer1:8421"}]
        httpx_mock.add_response(
            url="http://peer1:8421/v1/signal/sig-1/share_info",
            text="not valid json",
            headers={"content-type": "text/plain"},
        )
        shares = await orch._collect_peer_shares(peers, "sig-1")
        assert len(shares) == 0


class TestDistributedMPC:
    """Test _distributed_mpc with various scenarios."""

    def _make_peers(self, count: int) -> list[dict]:
        return [
            {"uid": i + 1, "url": f"http://peer{i + 1}:8421"}
            for i in range(count)
        ]

    @pytest.mark.asyncio
    async def test_insufficient_participants_returns_none(self) -> None:
        """When deduplicated participant_xs < threshold, return None."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=7)

        # Only 3 peers (+ self = 4 participants, below threshold 7)
        peers = self._make_peers(3)
        share = Share(x=1, y=42)

        result = await orch._distributed_mpc("sig-1", share, {1, 3, 5}, peers)
        assert result is None

    @pytest.mark.asyncio
    async def test_all_peers_reject_init_returns_none(self, httpx_mock) -> None:
        """When all peers reject MPC init, returns None."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=3)

        peers = self._make_peers(5)
        share = Share(x=1, y=42)

        # All peers reject
        for i in range(5):
            httpx_mock.add_response(
                url=f"http://peer{i + 1}:8421/v1/mpc/init",
                json={"accepted": False},
            )

        result = await orch._distributed_mpc("sig-1", share, {1, 3}, peers)
        assert result is None

    @pytest.mark.asyncio
    async def test_peer_init_http_error_handled(self, httpx_mock) -> None:
        """HTTP errors during init are caught gracefully (with retries)."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=3)

        peers = self._make_peers(5)
        share = Share(x=1, y=42)

        # All peers return 500, register enough for retries
        for _ in range(orch._PEER_RETRIES + 1):
            for i in range(5):
                httpx_mock.add_response(
                    url=f"http://peer{i + 1}:8421/v1/mpc/init",
                    status_code=500,
                )

        result = await orch._distributed_mpc("sig-1", share, {1}, peers)
        assert result is None

    @pytest.mark.asyncio
    async def test_peer_init_json_decode_error(self, httpx_mock) -> None:
        """Non-JSON response during MPC init should be caught gracefully."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=3)

        peers = self._make_peers(5)
        share = Share(x=1, y=42)

        for i in range(5):
            httpx_mock.add_response(
                url=f"http://peer{i + 1}:8421/v1/mpc/init",
                text="not json",
                headers={"content-type": "text/plain"},
            )

        result = await orch._distributed_mpc("sig-1", share, {1}, peers)
        assert result is None

    @pytest.mark.asyncio
    async def test_duplicate_x_coords_deduplicated(self) -> None:
        """When local share.x equals a peer uid+1, duplicates are removed."""
        coord = MPCCoordinator()
        orch = MPCOrchestrator(coordinator=coord, neuron=None, threshold=7)

        # local_share.x = 2, peer uid=1 → uid+1=2, same x-coordinate
        peers = [{"uid": 1, "url": "http://peer1:8421"}]
        share = Share(x=2, y=42)

        # Only 1 unique participant (x=2), well below threshold 7
        result = await orch._distributed_mpc("sig-1", share, {1}, peers)
        assert result is None


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

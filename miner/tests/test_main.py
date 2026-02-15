"""Tests for miner entry point functions (bt_sync_loop, run_server, async_main)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from djinn_miner.core.health import HealthTracker
from djinn_miner.main import bt_sync_loop


class TestBtSyncLoop:
    """Test the background Bittensor metagraph sync loop."""

    @pytest.mark.asyncio
    async def test_sync_loop_sets_bt_connected(self) -> None:
        """Successful sync sets bt_connected True."""
        neuron = MagicMock()
        neuron.is_registered.return_value = True
        neuron.uid = 42
        health = HealthTracker()

        call_count = 0

        original_sync = neuron.sync_metagraph

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        neuron.sync_metagraph = counting_sync
        await bt_sync_loop(neuron, health)
        assert health.get_status().bt_connected is True

    @pytest.mark.asyncio
    async def test_sync_loop_detects_deregistration(self) -> None:
        """When miner is deregistered, bt_connected goes False."""
        neuron = MagicMock()
        neuron.is_registered.return_value = False
        health = HealthTracker(bt_connected=True)

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        neuron.sync_metagraph = counting_sync
        await bt_sync_loop(neuron, health)
        assert health.get_status().bt_connected is False

    @pytest.mark.asyncio
    async def test_sync_loop_handles_errors_with_backoff(self) -> None:
        """Errors don't crash the loop; it backs off and retries."""
        neuron = MagicMock()
        health = HealthTracker()
        call_count = 0

        def error_then_cancel():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("network error")
            raise asyncio.CancelledError()

        neuron.sync_metagraph = error_then_cancel

        with patch("djinn_miner.main.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await bt_sync_loop(neuron, health)

        # Should have called sleep with backoff after error
        assert mock_sleep.called
        # First error: backoff = min(60 * 2^1, 600) = 120
        backoff_arg = mock_sleep.call_args_list[0][0][0]
        assert backoff_arg >= 60  # At least 60s backoff

    @pytest.mark.asyncio
    async def test_sync_loop_cancellation(self) -> None:
        """CancelledError exits the loop cleanly."""
        neuron = MagicMock()
        neuron.sync_metagraph.side_effect = asyncio.CancelledError()
        health = HealthTracker()

        await bt_sync_loop(neuron, health)  # Should not raise

    @pytest.mark.asyncio
    async def test_sync_loop_refreshes_uid(self) -> None:
        """UID is refreshed on successful sync when registered."""
        neuron = MagicMock()
        neuron.is_registered.return_value = True
        neuron.uid = 99
        health = HealthTracker(uid=42)

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        neuron.sync_metagraph = counting_sync
        await bt_sync_loop(neuron, health)
        assert health.get_status().uid == 99

    @pytest.mark.asyncio
    async def test_sync_loop_consecutive_errors_increase_backoff(self) -> None:
        """Multiple consecutive errors increase backoff up to the cap."""
        neuron = MagicMock()
        health = HealthTracker()
        call_count = 0

        def errors_then_cancel():
            nonlocal call_count
            call_count += 1
            if call_count <= 3:
                raise RuntimeError(f"error {call_count}")
            raise asyncio.CancelledError()

        neuron.sync_metagraph = errors_then_cancel

        with patch("djinn_miner.main.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await bt_sync_loop(neuron, health)

        # 3 errors → 3 backoff sleeps, each larger than the last
        assert mock_sleep.call_count == 3
        backoffs = [c[0][0] for c in mock_sleep.call_args_list]
        assert backoffs[0] < backoffs[1] < backoffs[2]
        # Cap at 600
        assert all(b <= 600 for b in backoffs)

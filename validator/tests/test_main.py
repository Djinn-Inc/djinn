"""Tests for validator entry point functions (epoch_loop, mpc_cleanup_loop)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from djinn_validator.core.outcomes import OutcomeAttestor
from djinn_validator.core.scoring import MinerScorer
from djinn_validator.core.shares import ShareStore
from djinn_validator.core.mpc_coordinator import MPCCoordinator
from djinn_validator.main import epoch_loop, mpc_cleanup_loop


@pytest.fixture
def mock_neuron() -> MagicMock:
    neuron = MagicMock()
    neuron.wallet = MagicMock()
    neuron.wallet.hotkey.ss58_address = "5FakeKey"
    neuron.get_miner_uids.return_value = [1, 2]
    neuron.get_axon_info.side_effect = lambda uid: {"hotkey": f"key-{uid}"}
    neuron.should_set_weights.return_value = False
    return neuron


@pytest.fixture
def mock_share_store(tmp_path):
    store = ShareStore(db_path=str(tmp_path / "test.db"))
    yield store
    store.close()


@pytest.fixture
def mock_scorer() -> MinerScorer:
    return MinerScorer()


@pytest.fixture
def mock_outcome_attestor() -> AsyncMock:
    attestor = AsyncMock(spec=OutcomeAttestor)
    attestor.resolve_all_pending.return_value = []
    attestor.cleanup_resolved.return_value = None
    return attestor


class TestEpochLoop:
    """Test the validator's main epoch loop."""

    @pytest.mark.asyncio
    async def test_epoch_loop_runs_one_cycle(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """One successful epoch cycle: sync, health check, resolve, score."""
        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        # Outcome attestor was called
        mock_outcome_attestor.resolve_all_pending.assert_called_once()
        mock_outcome_attestor.cleanup_resolved.assert_called_once()

    @pytest.mark.asyncio
    async def test_epoch_loop_health_checks_miners(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """Each miner gets a health check recorded (and consecutive_epochs incremented)."""
        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        # Miners should exist in scorer (created during health check)
        m1 = mock_scorer.get_or_create(1, "key-1")
        m2 = mock_scorer.get_or_create(2, "key-2")
        # Per-epoch metrics are reset, but consecutive_epochs is preserved
        assert m1.consecutive_epochs >= 1
        assert m2.consecutive_epochs >= 1

    @pytest.mark.asyncio
    async def test_epoch_loop_sets_weights_when_due(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """Weights are set when should_set_weights() returns True."""
        mock_neuron.should_set_weights.return_value = True
        mock_neuron.set_weights.return_value = True

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        # set_weights should have been called since miners were tracked
        mock_neuron.set_weights.assert_called_once()

    @pytest.mark.asyncio
    async def test_epoch_loop_records_weight_set_block(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """After successful weight set, record_weight_set is called."""
        mock_neuron.should_set_weights.return_value = True
        mock_neuron.set_weights.return_value = True

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        mock_neuron.record_weight_set.assert_called_once()

    @pytest.mark.asyncio
    async def test_epoch_loop_does_not_record_on_weight_failure(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """Failed weight set does not call record_weight_set."""
        mock_neuron.should_set_weights.return_value = True
        mock_neuron.set_weights.return_value = False

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        mock_neuron.record_weight_set.assert_not_called()

    @pytest.mark.asyncio
    async def test_epoch_loop_handles_errors(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """Errors trigger backoff, not a crash."""
        call_count = 0

        def error_then_cancel():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("metagraph error")
            raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = error_then_cancel

        with patch("djinn_validator.main.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        assert mock_sleep.called
        backoff = mock_sleep.call_args_list[0][0][0]
        assert backoff >= 12  # min(12 * 2^1, 300) = 24

    @pytest.mark.asyncio
    async def test_epoch_loop_cancellation(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """CancelledError exits cleanly."""
        mock_neuron.sync_metagraph.side_effect = asyncio.CancelledError()

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

    @pytest.mark.asyncio
    async def test_epoch_loop_resets_epoch_metrics(
        self,
        mock_neuron: MagicMock,
        mock_scorer: MinerScorer,
        mock_share_store: ShareStore,
        mock_outcome_attestor: AsyncMock,
    ) -> None:
        """Per-epoch metrics are reset after each cycle."""
        # Pre-populate miner with some metrics
        m = mock_scorer.get_or_create(1, "key-1")
        m.record_query(correct=True, latency=0.5, proof_submitted=True)

        call_count = 0

        def counting_sync():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        mock_neuron.sync_metagraph = counting_sync

        await epoch_loop(mock_neuron, mock_scorer, mock_share_store, mock_outcome_attestor)

        # After reset, queries should be 0 (health check adds 1 though)
        assert m.queries_total == 0  # reset_epoch clears this
        assert m.latencies == []  # reset_epoch clears this


class TestMPCCleanupLoop:
    """Test the MPC session cleanup background loop."""

    @pytest.mark.asyncio
    async def test_cleanup_loop_removes_expired(self) -> None:
        """Cleanup loop calls cleanup_expired on the coordinator."""
        coordinator = MagicMock(spec=MPCCoordinator)
        coordinator.cleanup_expired.return_value = 3

        call_count = 0
        original_cleanup = coordinator.cleanup_expired

        def counting_cleanup():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()
            return 3

        coordinator.cleanup_expired = counting_cleanup

        with patch("djinn_validator.main.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await mpc_cleanup_loop(coordinator)

        # Sleep should have been called with 300 (5 minutes)
        assert mock_sleep.call_args_list[0][0][0] == 300

    @pytest.mark.asyncio
    async def test_cleanup_loop_handles_errors(self) -> None:
        """Errors in cleanup don't crash the loop."""
        coordinator = MagicMock(spec=MPCCoordinator)
        call_count = 0

        def error_then_cancel():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("cleanup error")
            raise asyncio.CancelledError()

        coordinator.cleanup_expired = error_then_cancel

        with patch("djinn_validator.main.asyncio.sleep", new_callable=AsyncMock):
            await mpc_cleanup_loop(coordinator)  # Should not raise

    @pytest.mark.asyncio
    async def test_cleanup_loop_cancellation(self) -> None:
        """CancelledError exits cleanly."""
        coordinator = MagicMock(spec=MPCCoordinator)

        with patch("djinn_validator.main.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_sleep.side_effect = asyncio.CancelledError()
            await mpc_cleanup_loop(coordinator)

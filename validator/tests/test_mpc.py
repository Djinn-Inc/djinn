"""Tests for MPC set-membership protocol."""

import pytest

from djinn_validator.core.mpc import (
    MPCContribution,
    check_availability,
    compute_local_contribution,
)
from djinn_validator.utils.crypto import generate_signal_index_shares


class TestMPCProtocol:
    def _run_mpc(
        self,
        real_index: int,
        available: set[int],
        n_validators: int = 7,
    ) -> bool:
        """Helper: run full MPC protocol and return availability."""
        shares = generate_signal_index_shares(real_index)
        participating = shares[:n_validators]
        all_xs = [s.x for s in participating]

        contributions = [
            compute_local_contribution(s, all_xs) for s in participating
        ]
        result = check_availability(contributions, available, threshold=7)
        return result.available

    def test_available_signal(self) -> None:
        """When real index is in available set, MPC reports available."""
        assert self._run_mpc(5, {1, 3, 5, 7, 9}) is True

    def test_unavailable_signal(self) -> None:
        """When real index is NOT in available set, MPC reports unavailable."""
        assert self._run_mpc(5, {1, 2, 3, 4}) is False

    def test_all_indices_available(self) -> None:
        """When all 10 lines are available, any real index should work."""
        available = set(range(1, 11))
        for real_index in range(1, 11):
            assert self._run_mpc(real_index, available) is True

    def test_single_index_available_match(self) -> None:
        """Signal available when only the matching index is in the set."""
        assert self._run_mpc(3, {3}) is True

    def test_single_index_available_no_match(self) -> None:
        """Signal unavailable when only a non-matching index is in the set."""
        assert self._run_mpc(3, {7}) is False

    def test_all_ten_indices(self) -> None:
        """Test each possible real index against various subsets."""
        for real_idx in range(1, 11):
            # Available in even-only set
            evens = {2, 4, 6, 8, 10}
            expected = real_idx in evens
            assert self._run_mpc(real_idx, evens) is expected

    def test_insufficient_validators(self) -> None:
        """MPC fails with fewer than threshold validators."""
        shares = generate_signal_index_shares(3)
        participating = shares[:5]  # Only 5, need 7
        all_xs = [s.x for s in participating]

        contributions = [
            compute_local_contribution(s, all_xs) for s in participating
        ]
        result = check_availability(contributions, {1, 2, 3}, threshold=7)
        assert result.available is False
        assert result.participating_validators == 5

    def test_exactly_threshold_validators(self) -> None:
        """MPC succeeds with exactly threshold validators."""
        assert self._run_mpc(7, {5, 6, 7, 8}, n_validators=7) is True

    def test_more_than_threshold_validators(self) -> None:
        """MPC succeeds with more than threshold validators."""
        shares = generate_signal_index_shares(4)
        participating = shares[:9]  # 9 of 10
        all_xs = [s.x for s in participating]

        contributions = [
            compute_local_contribution(s, all_xs) for s in participating
        ]
        result = check_availability(contributions, {1, 4, 7}, threshold=7)
        assert result.available is True

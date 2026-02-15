"""Tests for the MPC coordinator module."""

from __future__ import annotations

import time

import pytest

from djinn_validator.core.mpc import Round1Message, generate_beaver_triples
from djinn_validator.core.mpc_coordinator import (
    MPCCoordinator,
    MPCSessionState,
    SessionStatus,
)
from djinn_validator.utils.crypto import Share, generate_signal_index_shares


class TestCreateSession:
    def test_creates_session(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session(
            signal_id="sig-1",
            available_indices=[1, 3, 5],
            coordinator_x=1,
            participant_xs=[1, 2, 3, 4, 5, 6, 7],
            threshold=7,
        )
        assert session.signal_id == "sig-1"
        assert session.available_indices == [1, 3, 5]
        assert session.status == SessionStatus.ROUND1_COLLECTING
        assert len(session.triples) == 3  # One per available index

    def test_session_id_unique(self) -> None:
        coord = MPCCoordinator()
        s1 = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        s2 = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        assert s1.session_id != s2.session_id

    def test_active_session_count(self) -> None:
        coord = MPCCoordinator()
        coord.create_session("sig-1", [1, 2], 1, [1, 2, 3], 3)
        coord.create_session("sig-2", [3, 4], 1, [1, 2, 3], 3)
        assert coord.active_session_count == 2


class TestGetSession:
    def test_get_existing(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        retrieved = coord.get_session(session.session_id)
        assert retrieved is session

    def test_get_nonexistent(self) -> None:
        coord = MPCCoordinator()
        assert coord.get_session("nope") is None

    def test_expired_session(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        session.created_at = time.time() - 200  # Force expiry
        retrieved = coord.get_session(session.session_id)
        assert retrieved is not None
        assert retrieved.status == SessionStatus.EXPIRED


class TestTripleShares:
    def test_get_triple_shares(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1, 2], 1, [1, 2, 3], 3)
        shares = coord.get_triple_shares_for_participant(session.session_id, 2)
        assert shares is not None
        assert len(shares) == 2  # 2 available indices = 2 triples
        for s in shares:
            assert "a" in s
            assert "b" in s
            assert "c" in s

    def test_nonexistent_session(self) -> None:
        coord = MPCCoordinator()
        assert coord.get_triple_shares_for_participant("nope", 1) is None

    def test_nonexistent_participant(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        result = coord.get_triple_shares_for_participant(session.session_id, 99)
        assert result is None


class TestRound1Submission:
    def test_submit_round1(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        msg = Round1Message(validator_x=1, d_value=42, e_value=99)
        assert coord.submit_round1(session.session_id, 0, msg) is True
        assert len(session.round1_messages[0]) == 1

    def test_submit_duplicate_ignored(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        msg = Round1Message(validator_x=1, d_value=42, e_value=99)
        coord.submit_round1(session.session_id, 0, msg)
        coord.submit_round1(session.session_id, 0, msg)
        assert len(session.round1_messages[0]) == 1

    def test_submit_nonexistent_session(self) -> None:
        coord = MPCCoordinator()
        msg = Round1Message(validator_x=1, d_value=42, e_value=99)
        assert coord.submit_round1("nope", 0, msg) is False


class TestRoundComplete:
    def test_round_complete(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        for vx in [1, 2, 3]:
            msg = Round1Message(validator_x=vx, d_value=vx * 10, e_value=vx * 20)
            coord.submit_round1(session.session_id, 0, msg)
        assert coord.is_round_complete(session.session_id) is True

    def test_round_incomplete(self) -> None:
        coord = MPCCoordinator()
        session = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        msg = Round1Message(validator_x=1, d_value=10, e_value=20)
        coord.submit_round1(session.session_id, 0, msg)
        assert coord.is_round_complete(session.session_id) is False


class TestComputeResult:
    def test_compute_available(self) -> None:
        coord = MPCCoordinator()
        # Real index = 5, available set includes 5
        shares = generate_signal_index_shares(5)
        session = coord.create_session(
            "sig-1", [1, 3, 5, 7], 1, list(range(1, 11)), 7,
        )
        result = coord.compute_result_with_shares(session.session_id, shares)
        assert result is not None
        assert result.available is True
        assert session.status == SessionStatus.COMPLETE

    def test_compute_unavailable(self) -> None:
        coord = MPCCoordinator()
        # Real index = 5, available set does NOT include 5
        shares = generate_signal_index_shares(5)
        session = coord.create_session(
            "sig-1", [1, 3, 7, 9], 1, list(range(1, 11)), 7,
        )
        result = coord.compute_result_with_shares(session.session_id, shares)
        assert result is not None
        assert result.available is False

    def test_compute_nonexistent(self) -> None:
        coord = MPCCoordinator()
        assert coord.compute_result_with_shares("nope", []) is None


class TestCleanup:
    def test_cleanup_expired(self) -> None:
        coord = MPCCoordinator()
        s1 = coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        s1.created_at = time.time() - 200  # Expired
        coord.create_session("sig-2", [2], 1, [1, 2, 3], 3)  # Fresh

        removed = coord.cleanup_expired()
        assert removed == 1
        assert coord.get_session(s1.session_id) is None

    def test_cleanup_none_expired(self) -> None:
        coord = MPCCoordinator()
        coord.create_session("sig-1", [1], 1, [1, 2, 3], 3)
        assert coord.cleanup_expired() == 0

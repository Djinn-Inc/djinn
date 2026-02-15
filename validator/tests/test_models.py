"""Tests for Pydantic request/response model validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from djinn_validator.api.models import (
    AnalyticsRequest,
    MPCInitRequest,
    MPCResultRequest,
    MPCRound1Request,
    OutcomeRequest,
    PurchaseRequest,
    RegisterSignalRequest,
    StoreShareRequest,
)


class TestStoreShareRequest:
    def test_valid_request(self) -> None:
        req = StoreShareRequest(
            signal_id="sig-1",
            genius_address="0xGenius",
            share_x=1,
            share_y="0xabcdef",
            encrypted_key_share="deadbeef",
        )
        assert req.share_x == 1

    def test_share_x_too_low(self) -> None:
        with pytest.raises(ValidationError, match="share_x"):
            StoreShareRequest(
                signal_id="sig-1",
                genius_address="0xGenius",
                share_x=0,
                share_y="0xabcdef",
                encrypted_key_share="deadbeef",
            )

    def test_share_x_too_high(self) -> None:
        with pytest.raises(ValidationError, match="share_x"):
            StoreShareRequest(
                signal_id="sig-1",
                genius_address="0xGenius",
                share_x=11,
                share_y="0xabcdef",
                encrypted_key_share="deadbeef",
            )

    def test_invalid_hex_share_y(self) -> None:
        with pytest.raises(ValidationError, match="hex"):
            StoreShareRequest(
                signal_id="sig-1",
                genius_address="0xGenius",
                share_x=1,
                share_y="not-hex!",
                encrypted_key_share="deadbeef",
            )

    def test_invalid_hex_encrypted_key_share(self) -> None:
        with pytest.raises(ValidationError, match="hex"):
            StoreShareRequest(
                signal_id="sig-1",
                genius_address="0xGenius",
                share_x=1,
                share_y="0xabcdef",
                encrypted_key_share="xyz!!",
            )


class TestPurchaseRequest:
    def test_valid_request(self) -> None:
        req = PurchaseRequest(
            buyer_address="0xBuyer",
            sportsbook="draftkings",
            available_indices=[1, 3, 5],
        )
        assert len(req.available_indices) == 3

    def test_empty_available_indices(self) -> None:
        with pytest.raises(ValidationError, match="available_indices"):
            PurchaseRequest(
                buyer_address="0xBuyer",
                sportsbook="draftkings",
                available_indices=[],
            )

    def test_too_many_available_indices(self) -> None:
        with pytest.raises(ValidationError, match="available_indices"):
            PurchaseRequest(
                buyer_address="0xBuyer",
                sportsbook="draftkings",
                available_indices=list(range(1, 12)),  # 11 items
            )


class TestMPCRound1Request:
    def test_valid_hex_values(self) -> None:
        req = MPCRound1Request(
            session_id="s-1",
            gate_idx=0,
            validator_x=1,
            d_value="0xabcdef",
            e_value="ff00ff",
        )
        assert req.d_value == "0xabcdef"

    def test_invalid_d_value(self) -> None:
        with pytest.raises(ValidationError, match="hex"):
            MPCRound1Request(
                session_id="s-1",
                gate_idx=0,
                validator_x=1,
                d_value="not_hex!",
                e_value="ff00ff",
            )


class TestAnalyticsRequest:
    def test_default_data(self) -> None:
        req = AnalyticsRequest(event_type="purchase")
        assert req.data == {}

    def test_with_data(self) -> None:
        req = AnalyticsRequest(event_type="click", data={"page": "/signals"})
        assert req.data["page"] == "/signals"

    def test_event_type_too_long(self) -> None:
        with pytest.raises(ValidationError):
            AnalyticsRequest(event_type="x" * 200)


class TestStringLengthLimits:
    """Verify max_length constraints on all string fields."""

    def test_signal_id_too_long(self) -> None:
        with pytest.raises(ValidationError):
            StoreShareRequest(
                signal_id="x" * 300,
                genius_address="0xGenius",
                share_x=1,
                share_y="abcdef",
                encrypted_key_share="deadbeef",
            )

    def test_buyer_address_too_long(self) -> None:
        with pytest.raises(ValidationError):
            PurchaseRequest(
                buyer_address="x" * 300,
                sportsbook="dk",
                available_indices=[1],
            )

    def test_outcome_validator_hotkey_too_long(self) -> None:
        with pytest.raises(ValidationError):
            OutcomeRequest(
                signal_id="sig-1",
                event_id="ev-1",
                outcome=1,
                validator_hotkey="x" * 300,
            )

    def test_register_pick_too_long(self) -> None:
        with pytest.raises(ValidationError):
            RegisterSignalRequest(
                sport="nba",
                event_id="ev-1",
                home_team="A",
                away_team="B",
                pick="x" * 600,
            )

    def test_mpc_d_value_too_long(self) -> None:
        with pytest.raises(ValidationError):
            MPCRound1Request(
                session_id="s-1",
                gate_idx=0,
                validator_x=1,
                d_value="a" * 300,
                e_value="ff",
            )


class TestMPCBoundsValidation:
    """Verify bounds on MPC numeric fields."""

    def test_coordinator_x_too_low(self) -> None:
        with pytest.raises(ValidationError):
            MPCInitRequest(
                session_id="s-1",
                signal_id="sig-1",
                available_indices=[1],
                coordinator_x=0,
                participant_xs=[1, 2],
            )

    def test_coordinator_x_too_high(self) -> None:
        with pytest.raises(ValidationError):
            MPCInitRequest(
                session_id="s-1",
                signal_id="sig-1",
                available_indices=[1],
                coordinator_x=256,
                participant_xs=[1, 2],
            )

    def test_gate_idx_bounds(self) -> None:
        with pytest.raises(ValidationError):
            MPCRound1Request(
                session_id="s-1",
                gate_idx=-1,
                validator_x=1,
                d_value="ab",
                e_value="cd",
            )

    def test_participating_validators_bounds(self) -> None:
        with pytest.raises(ValidationError):
            MPCResultRequest(
                session_id="s-1",
                signal_id="sig-1",
                available=True,
                participating_validators=-1,
            )

    def test_threshold_bounds(self) -> None:
        with pytest.raises(ValidationError):
            MPCInitRequest(
                session_id="s-1",
                signal_id="sig-1",
                available_indices=[1],
                coordinator_x=1,
                participant_xs=[1, 2],
                threshold=0,
            )

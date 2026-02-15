"""Tests for Pydantic request/response model validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from djinn_validator.api.models import (
    AnalyticsRequest,
    MPCRound1Request,
    PurchaseRequest,
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

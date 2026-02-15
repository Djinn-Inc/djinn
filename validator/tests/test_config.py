"""Tests for validator configuration loading and validation."""

from __future__ import annotations

import dataclasses

import pytest

from djinn_validator.config import Config


def _config(**overrides: object) -> Config:
    """Create a Config with overridden fields (bypasses frozen restriction)."""
    config = Config()
    for k, v in overrides.items():
        object.__setattr__(config, k, v)
    return config


class TestConfigDefaults:
    def test_default_port(self) -> None:
        config = Config()
        assert config.api_port == 8421

    def test_default_bt_network(self) -> None:
        config = Config()
        assert config.bt_network == "finney"

    def test_default_protocol_constants(self) -> None:
        config = Config()
        assert config.shares_total == 10
        assert config.shares_threshold == 7
        assert config.protocol_fee_bps == 50
        assert config.bps_denom == 10_000


class TestConfigValidation:
    def test_valid_config_no_warnings(self) -> None:
        config = _config(bt_network="local", sports_api_key="test-key")
        warnings = config.validate()
        assert len(warnings) == 0

    def test_missing_sports_api_key_warns(self) -> None:
        config = _config(sports_api_key="")
        warnings = config.validate()
        assert any("SPORTS_API_KEY" in w for w in warnings)

    def test_mainnet_missing_addresses_warns(self) -> None:
        config = _config(
            bt_network="finney",
            sports_api_key="key",
            escrow_address="",
            signal_commitment_address="",
            account_address="",
            collateral_address="",
        )
        warnings = config.validate()
        assert len(warnings) >= 4

    def test_local_network_no_address_warnings(self) -> None:
        config = _config(
            bt_network="local",
            sports_api_key="key",
            escrow_address="",
        )
        warnings = config.validate()
        assert len(warnings) == 0

    def test_invalid_port_zero_raises(self) -> None:
        config = _config(api_port=0)
        with pytest.raises(ValueError, match="API_PORT"):
            config.validate()

    def test_invalid_port_too_high_raises(self) -> None:
        config = _config(api_port=70000)
        with pytest.raises(ValueError, match="API_PORT"):
            config.validate()

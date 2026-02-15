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


class TestConfigNetworkWarning:
    def test_known_network_no_warning(self) -> None:
        config = _config(bt_network="finney", sports_api_key="key",
                         escrow_address="0x1234567890abcdef1234567890abcdef12345678",
                         signal_commitment_address="0x1234567890abcdef1234567890abcdef12345678",
                         account_address="0x1234567890abcdef1234567890abcdef12345678",
                         collateral_address="0x1234567890abcdef1234567890abcdef12345678")
        warnings = config.validate()
        assert not any("BT_NETWORK" in w for w in warnings)

    def test_unknown_network_warns(self) -> None:
        config = _config(bt_network="devnet-42", sports_api_key="key")
        warnings = config.validate()
        assert any("BT_NETWORK" in w for w in warnings)


class TestConfigTimeouts:
    def test_default_http_timeout(self) -> None:
        config = Config()
        assert config.http_timeout == 30

    def test_default_rpc_timeout(self) -> None:
        config = Config()
        assert config.rpc_timeout == 30

    def test_http_timeout_zero_raises(self) -> None:
        config = _config(bt_network="local", sports_api_key="key", http_timeout=0)
        with pytest.raises(ValueError, match="HTTP_TIMEOUT"):
            config.validate()

    def test_rpc_timeout_zero_raises(self) -> None:
        config = _config(bt_network="local", sports_api_key="key", rpc_timeout=0)
        with pytest.raises(ValueError, match="RPC_TIMEOUT"):
            config.validate()


class TestConfigAddressValidation:
    def test_valid_address_accepted(self) -> None:
        config = _config(
            bt_network="finney",
            sports_api_key="key",
            escrow_address="0x1234567890abcdef1234567890abcdef12345678",
            signal_commitment_address="0x1234567890abcdef1234567890abcdef12345678",
            account_address="0x1234567890abcdef1234567890abcdef12345678",
            collateral_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        warnings = config.validate()
        assert not any("not a valid" in w for w in warnings)

    def test_invalid_address_format_raises(self) -> None:
        config = _config(
            bt_network="finney",
            sports_api_key="key",
            escrow_address="not-an-address",
            signal_commitment_address="0x1234567890abcdef1234567890abcdef12345678",
            account_address="0x1234567890abcdef1234567890abcdef12345678",
            collateral_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        with pytest.raises(ValueError, match="not a valid Ethereum address"):
            config.validate()

    def test_short_address_raises(self) -> None:
        config = _config(
            bt_network="finney",
            sports_api_key="key",
            escrow_address="0x1234",
            signal_commitment_address="0x1234567890abcdef1234567890abcdef12345678",
            account_address="0x1234567890abcdef1234567890abcdef12345678",
            collateral_address="0x1234567890abcdef1234567890abcdef12345678",
        )
        with pytest.raises(ValueError, match="not a valid Ethereum address"):
            config.validate()

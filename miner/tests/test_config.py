"""Tests for miner configuration loading and validation."""

from __future__ import annotations

import pytest

from djinn_miner.config import Config


def _config(**overrides: object) -> Config:
    """Create a Config with overridden fields (bypasses frozen restriction)."""
    config = Config()
    for k, v in overrides.items():
        object.__setattr__(config, k, v)
    return config


class TestConfigDefaults:
    def test_default_port(self) -> None:
        config = Config()
        assert config.api_port == 8422

    def test_default_bt_network(self) -> None:
        config = Config()
        assert config.bt_network == "finney"

    def test_default_cache_ttl(self) -> None:
        config = Config()
        assert config.odds_cache_ttl == 30

    def test_default_line_tolerance(self) -> None:
        config = Config()
        assert config.line_tolerance == 0.5


class TestConfigValidation:
    def test_valid_config(self) -> None:
        config = _config(odds_api_key="test-key")
        config.validate()  # Should not raise

    def test_missing_odds_api_key_raises(self) -> None:
        config = _config(odds_api_key="")
        with pytest.raises(ValueError, match="ODDS_API_KEY"):
            config.validate()

    def test_invalid_port_raises(self) -> None:
        config = _config(odds_api_key="key", api_port=0)
        with pytest.raises(ValueError, match="API_PORT"):
            config.validate()

    def test_port_too_high_raises(self) -> None:
        config = _config(odds_api_key="key", api_port=70000)
        with pytest.raises(ValueError, match="API_PORT"):
            config.validate()

    def test_negative_cache_ttl_raises(self) -> None:
        config = _config(odds_api_key="key", odds_cache_ttl=-1)
        with pytest.raises(ValueError, match="ODDS_CACHE_TTL"):
            config.validate()

    def test_negative_line_tolerance_raises(self) -> None:
        config = _config(odds_api_key="key", line_tolerance=-0.1)
        with pytest.raises(ValueError, match="LINE_TOLERANCE"):
            config.validate()


class TestConfigTimeouts:
    def test_default_http_timeout(self) -> None:
        config = Config()
        assert config.http_timeout == 30

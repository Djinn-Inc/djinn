"""Miner configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _int_env(key: str, default: str) -> int:
    val = os.getenv(key, default)
    try:
        return int(val)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid integer for {key}: {val!r}")


def _float_env(key: str, default: str) -> float:
    val = os.getenv(key, default)
    try:
        return float(val)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid float for {key}: {val!r}")


@dataclass(frozen=True)
class Config:
    # Bittensor
    bt_netuid: int = _int_env("BT_NETUID", "103")
    bt_network: str = os.getenv("BT_NETWORK", "finney")
    bt_wallet_name: str = os.getenv("BT_WALLET_NAME", "default")
    bt_wallet_hotkey: str = os.getenv("BT_WALLET_HOTKEY", "default")

    # Miner API
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = _int_env("API_PORT", "8422")

    # The Odds API
    odds_api_key: str = os.getenv("ODDS_API_KEY", "")
    odds_api_base_url: str = os.getenv("ODDS_API_BASE_URL", "https://api.the-odds-api.com")

    # Cache TTL in seconds
    odds_cache_ttl: int = _int_env("ODDS_CACHE_TTL", "30")

    # Line matching tolerance: how close a sportsbook line must be to match
    line_tolerance: float = _float_env("LINE_TOLERANCE", "0.5")

    # Timeouts (seconds)
    http_timeout: int = _int_env("HTTP_TIMEOUT", "30")

    def validate(self) -> None:
        """Validate config at startup. Raises ValueError on issues."""
        if not self.odds_api_key:
            raise ValueError("ODDS_API_KEY is required. Get one at https://the-odds-api.com")
        if self.api_port < 1 or self.api_port > 65535:
            raise ValueError(f"API_PORT must be 1-65535, got {self.api_port}")
        if self.odds_cache_ttl < 0:
            raise ValueError(f"ODDS_CACHE_TTL must be >= 0, got {self.odds_cache_ttl}")
        if self.line_tolerance < 0:
            raise ValueError(f"LINE_TOLERANCE must be >= 0, got {self.line_tolerance}")

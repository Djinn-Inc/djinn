"""Miner configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    # Bittensor
    bt_netuid: int = int(os.getenv("BT_NETUID", "103"))
    bt_network: str = os.getenv("BT_NETWORK", "finney")
    bt_wallet_name: str = os.getenv("BT_WALLET_NAME", "default")
    bt_wallet_hotkey: str = os.getenv("BT_WALLET_HOTKEY", "default")

    # Miner API
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8422"))

    # The Odds API
    odds_api_key: str = os.getenv("ODDS_API_KEY", "")
    odds_api_base_url: str = os.getenv("ODDS_API_BASE_URL", "https://api.the-odds-api.com")

    # Cache TTL in seconds
    odds_cache_ttl: int = int(os.getenv("ODDS_CACHE_TTL", "30"))

    # Line matching tolerance: how close a sportsbook line must be to match
    line_tolerance: float = float(os.getenv("LINE_TOLERANCE", "0.5"))

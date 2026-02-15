"""Validator configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _int_env(key: str, default: str) -> int:
    val = os.getenv(key, default)
    try:
        return int(val)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid integer for {key}: {val!r}")


@dataclass(frozen=True)
class Config:
    # Bittensor
    bt_netuid: int = _int_env("BT_NETUID", "103")
    bt_network: str = os.getenv("BT_NETWORK", "finney")
    bt_wallet_name: str = os.getenv("BT_WALLET_NAME", "default")
    bt_wallet_hotkey: str = os.getenv("BT_WALLET_HOTKEY", "default")

    # Base chain
    base_rpc_url: str = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
    base_chain_id: int = _int_env("BASE_CHAIN_ID", "8453")

    # Contract addresses
    escrow_address: str = os.getenv("ESCROW_ADDRESS", "")
    signal_commitment_address: str = os.getenv("SIGNAL_COMMITMENT_ADDRESS", "")
    account_address: str = os.getenv("ACCOUNT_ADDRESS", "")
    collateral_address: str = os.getenv("COLLATERAL_ADDRESS", "")

    # Validator API
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = _int_env("API_PORT", "8421")

    # Sports data
    sports_api_key: str = os.getenv("SPORTS_API_KEY", "")

    # Timeouts (seconds)
    http_timeout: int = _int_env("HTTP_TIMEOUT", "30")
    rpc_timeout: int = _int_env("RPC_TIMEOUT", "30")

    # Protocol constants
    signals_per_cycle: int = 10
    shares_total: int = 10
    shares_threshold: int = 7
    mpc_quorum: float = 2 / 3
    protocol_fee_bps: int = 50
    odds_precision: int = 1_000_000
    bps_denom: int = 10_000

    def validate(self) -> list[str]:
        """Validate config at startup. Returns list of warnings (empty = all good)."""
        warnings = []
        if self.api_port < 1 or self.api_port > 65535:
            raise ValueError(f"API_PORT must be 1-65535, got {self.api_port}")
        if not self.sports_api_key:
            warnings.append("SPORTS_API_KEY not set — outcome resolution will fail")
        if self.bt_network in ("finney", "mainnet"):
            for name in ("escrow_address", "signal_commitment_address", "account_address", "collateral_address"):
                if not getattr(self, name):
                    warnings.append(f"{name.upper()} not set — chain interactions will fail")
        return warnings

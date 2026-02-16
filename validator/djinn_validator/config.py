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

    # Rate limits (configurable without redeploy)
    rate_limit_capacity: int = _int_env("RATE_LIMIT_CAPACITY", "60")
    rate_limit_rate: int = _int_env("RATE_LIMIT_RATE", "10")

    # MPC
    mpc_peer_timeout: float = float(os.getenv("MPC_PEER_TIMEOUT", "10.0"))

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
        import re
        warnings = []
        if not (1 <= self.bt_netuid <= 65535):
            raise ValueError(f"BT_NETUID must be 1-65535, got {self.bt_netuid}")
        if self.api_port < 1 or self.api_port > 65535:
            raise ValueError(f"API_PORT must be 1-65535, got {self.api_port}")
        is_production = self.bt_network in ("finney", "mainnet")
        if not self.sports_api_key:
            if is_production:
                raise ValueError("SPORTS_API_KEY must be set in production — outcome resolution requires it")
            warnings.append("SPORTS_API_KEY not set — outcome resolution will fail")
        if is_production:
            for name in ("escrow_address", "signal_commitment_address", "account_address", "collateral_address"):
                addr = getattr(self, name)
                if not addr:
                    raise ValueError(f"{name.upper()} must be set in production")
                elif not re.match(r"^0x[0-9a-fA-F]{40}$", addr):
                    raise ValueError(f"{name.upper()} is not a valid Ethereum address: {addr!r}")
        elif self.bt_network not in ("finney", "mainnet"):
            for name in ("escrow_address", "signal_commitment_address", "account_address", "collateral_address"):
                addr = getattr(self, name)
                if addr and not re.match(r"^0x[0-9a-fA-F]{40}$", addr):
                    raise ValueError(f"{name.upper()} is not a valid Ethereum address: {addr!r}")
        known_networks = ("finney", "mainnet", "test", "local", "mock")
        if self.bt_network not in known_networks:
            warnings.append(
                f"BT_NETWORK={self.bt_network!r} is not a recognized network "
                f"({', '.join(known_networks)})"
            )
        if self.http_timeout < 1:
            raise ValueError(f"HTTP_TIMEOUT must be >= 1, got {self.http_timeout}")
        if self.rpc_timeout < 1:
            raise ValueError(f"RPC_TIMEOUT must be >= 1, got {self.rpc_timeout}")
        if self.base_chain_id not in (8453, 84532, 31337):
            warnings.append(
                f"BASE_CHAIN_ID={self.base_chain_id} is non-standard "
                "(expected 8453=mainnet, 84532=sepolia, 31337=localhost)"
            )
        if self.rate_limit_capacity < 1:
            raise ValueError(f"RATE_LIMIT_CAPACITY must be >= 1, got {self.rate_limit_capacity}")
        if self.rate_limit_rate < 1:
            raise ValueError(f"RATE_LIMIT_RATE must be >= 1, got {self.rate_limit_rate}")
        if self.mpc_peer_timeout < 1.0:
            raise ValueError(f"MPC_PEER_TIMEOUT must be >= 1.0, got {self.mpc_peer_timeout}")
        return warnings

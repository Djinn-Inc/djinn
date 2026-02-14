"""Validator configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    # Bittensor
    bt_netuid: int = int(os.getenv("BT_NETUID", "103"))
    bt_network: str = os.getenv("BT_NETWORK", "finney")
    bt_wallet_name: str = os.getenv("BT_WALLET_NAME", "default")
    bt_wallet_hotkey: str = os.getenv("BT_WALLET_HOTKEY", "default")

    # Base chain
    base_rpc_url: str = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
    base_chain_id: int = int(os.getenv("BASE_CHAIN_ID", "8453"))

    # Contract addresses
    escrow_address: str = os.getenv("ESCROW_ADDRESS", "")
    signal_commitment_address: str = os.getenv("SIGNAL_COMMITMENT_ADDRESS", "")
    account_address: str = os.getenv("ACCOUNT_ADDRESS", "")
    collateral_address: str = os.getenv("COLLATERAL_ADDRESS", "")

    # Validator API
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8421"))

    # Sports data
    sports_api_key: str = os.getenv("SPORTS_API_KEY", "")

    # Protocol constants
    signals_per_cycle: int = 10
    shares_total: int = 10
    shares_threshold: int = 7
    mpc_quorum: float = 2 / 3
    protocol_fee_bps: int = 50
    odds_precision: int = 1_000_000
    bps_denom: int = 10_000

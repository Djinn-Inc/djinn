"""On-chain interaction layer for Base chain smart contracts.

Provides typed wrappers around contract calls used by the validator:
- Escrow.purchase() — gate share release on payment
- SignalCommitment.getSignal() — read signal metadata
- Account.recordOutcome() — write attested outcomes
"""

from __future__ import annotations

from typing import Any

import structlog
from web3 import AsyncWeb3
from web3.contract import AsyncContract

log = structlog.get_logger()

# Minimal ABIs — only the functions the validator needs
ESCROW_ABI = [
    {
        "inputs": [
            {"name": "signalId", "type": "uint256"},
            {"name": "buyer", "type": "address"},
        ],
        "name": "purchases",
        "outputs": [
            {"name": "notional", "type": "uint256"},
            {"name": "pricePaid", "type": "uint256"},
            {"name": "sportsbook", "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

SIGNAL_COMMITMENT_ABI = [
    {
        "inputs": [{"name": "signalId", "type": "uint256"}],
        "name": "getSignal",
        "outputs": [
            {"name": "genius", "type": "address"},
            {"name": "commitHash", "type": "bytes32"},
            {"name": "encryptedBlob", "type": "bytes"},
            {"name": "maxPriceBps", "type": "uint256"},
            {"name": "slaBps", "type": "uint256"},
            {"name": "status", "type": "uint8"},
            {"name": "timestamp", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "signalId", "type": "uint256"}],
        "name": "isActive",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

ACCOUNT_ABI = [
    {
        "inputs": [
            {"name": "genius", "type": "address"},
            {"name": "idiot", "type": "address"},
            {"name": "signalId", "type": "uint256"},
            {"name": "outcome", "type": "uint8"},
        ],
        "name": "recordOutcome",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "genius", "type": "address"},
            {"name": "idiot", "type": "address"},
        ],
        "name": "isAuditReady",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]


class ChainClient:
    """Async client for interacting with Djinn contracts on Base."""

    def __init__(
        self,
        rpc_url: str,
        escrow_address: str = "",
        signal_address: str = "",
        account_address: str = "",
    ) -> None:
        self._w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(
            rpc_url,
            request_kwargs={"timeout": 30},
        ))
        self._escrow: AsyncContract | None = None
        self._signal: AsyncContract | None = None
        self._account: AsyncContract | None = None

        if escrow_address:
            self._escrow = self._w3.eth.contract(
                address=self._w3.to_checksum_address(escrow_address),
                abi=ESCROW_ABI,
            )
        if signal_address:
            self._signal = self._w3.eth.contract(
                address=self._w3.to_checksum_address(signal_address),
                abi=SIGNAL_COMMITMENT_ABI,
            )
        if account_address:
            self._account = self._w3.eth.contract(
                address=self._w3.to_checksum_address(account_address),
                abi=ACCOUNT_ABI,
            )

    async def is_signal_active(self, signal_id: int) -> bool:
        """Check if a signal is still active on-chain."""
        if self._signal is None:
            log.warning("signal_contract_not_configured")
            return True  # Permissive in dev mode
        try:
            return await self._signal.functions.isActive(signal_id).call()
        except Exception as e:
            log.error("is_signal_active_failed", signal_id=signal_id, error=str(e))
            return True  # Permissive on error — don't block share release

    async def get_signal(self, signal_id: int) -> dict[str, Any]:
        """Read signal metadata from SignalCommitment contract."""
        if self._signal is None:
            return {}
        try:
            result = await self._signal.functions.getSignal(signal_id).call()
            return {
                "genius": result[0],
                "commitHash": result[1],
                "encryptedBlob": result[2],
                "maxPriceBps": result[3],
                "slaBps": result[4],
                "status": result[5],
                "timestamp": result[6],
            }
        except Exception as e:
            log.error("get_signal_failed", signal_id=signal_id, error=str(e))
            return {}

    async def verify_purchase(self, signal_id: int, buyer: str) -> dict[str, Any]:
        """Verify a purchase exists on-chain."""
        if self._escrow is None:
            log.warning("escrow_contract_not_configured")
            return {"notional": 0, "pricePaid": 0, "sportsbook": ""}
        try:
            result = await self._escrow.functions.purchases(
                signal_id,
                self._w3.to_checksum_address(buyer),
            ).call()
            return {
                "notional": result[0],
                "pricePaid": result[1],
                "sportsbook": result[2],
            }
        except Exception as e:
            log.error("verify_purchase_failed", signal_id=signal_id, buyer=buyer, error=str(e))
            return {"notional": 0, "pricePaid": 0, "sportsbook": ""}

    async def is_audit_ready(self, genius: str, idiot: str) -> bool:
        """Check if a Genius-Idiot pair has completed a cycle."""
        if self._account is None:
            return False
        try:
            return await self._account.functions.isAuditReady(
                self._w3.to_checksum_address(genius),
                self._w3.to_checksum_address(idiot),
            ).call()
        except Exception as e:
            log.error("is_audit_ready_failed", genius=genius, idiot=idiot, error=str(e))
            return False

    async def close(self) -> None:
        """Close the underlying HTTP provider session."""
        import asyncio

        provider = self._w3.provider
        if hasattr(provider, "_request_session") and provider._request_session:
            session = provider._request_session
            try:
                close_coro = session.aclose() if hasattr(session, "aclose") else session.close()
                await asyncio.wait_for(close_coro, timeout=5.0)
            except asyncio.TimeoutError:
                log.warning("chain_client_close_timeout")
            except Exception as e:
                log.warning("chain_client_close_error", error=str(e))

    async def is_connected(self) -> bool:
        """Check Base chain RPC connectivity."""
        try:
            await self._w3.eth.block_number
            return True
        except Exception as e:
            log.warning("rpc_connection_failed", error=str(e))
            return False

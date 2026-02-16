"""On-chain interaction layer for Base chain smart contracts.

Provides typed wrappers around contract calls used by the validator:
- Escrow.purchase() — gate share release on payment
- SignalCommitment.getSignal() — read signal metadata
- Account.recordOutcome() — write attested outcomes

Supports multiple RPC URLs with automatic failover on connection errors.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from web3 import AsyncWeb3
from web3.contract import AsyncContract

from djinn_validator.utils.circuit_breaker import CircuitBreaker

log = structlog.get_logger()

# Minimal ABIs — only the functions the validator needs
ESCROW_ABI = [
    {
        "inputs": [{"name": "signalId", "type": "uint256"}],
        "name": "getPurchasesBySignal",
        "outputs": [{"name": "", "type": "uint256[]"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "purchaseId", "type": "uint256"}],
        "name": "getPurchase",
        "outputs": [
            {
                "components": [
                    {"name": "idiot", "type": "address"},
                    {"name": "signalId", "type": "uint256"},
                    {"name": "notional", "type": "uint256"},
                    {"name": "feePaid", "type": "uint256"},
                    {"name": "creditUsed", "type": "uint256"},
                    {"name": "usdcPaid", "type": "uint256"},
                    {"name": "odds", "type": "uint256"},
                    {"name": "outcome", "type": "uint8"},
                    {"name": "purchasedAt", "type": "uint256"},
                ],
                "name": "",
                "type": "tuple",
            },
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

# Connection-type errors that indicate the RPC endpoint is unreachable
_FAILOVER_ERRORS = (ConnectionError, OSError, TimeoutError)


class ChainClient:
    """Async client for interacting with Djinn contracts on Base.

    Supports multiple RPC URLs with automatic failover. Pass a comma-separated
    string or a list of URLs. On connection failure, the client rotates to the
    next available RPC endpoint and retries.
    """

    def __init__(
        self,
        rpc_url: str | list[str],
        escrow_address: str = "",
        signal_address: str = "",
        account_address: str = "",
    ) -> None:
        if isinstance(rpc_url, str):
            self._rpc_urls = [u.strip() for u in rpc_url.split(",") if u.strip()]
        else:
            self._rpc_urls = list(rpc_url)
        if not self._rpc_urls:
            self._rpc_urls = ["https://mainnet.base.org"]
        self._rpc_index = 0
        self._escrow_address = escrow_address
        self._signal_address = signal_address
        self._account_address = account_address
        self._circuit_breaker = CircuitBreaker(
            name="rpc",
            failure_threshold=3,
            recovery_timeout=30.0,
        )
        self._w3 = self._create_provider(self._rpc_urls[0])
        self._setup_contracts()

    def _create_provider(self, url: str) -> AsyncWeb3:
        return AsyncWeb3(
            AsyncWeb3.AsyncHTTPProvider(
                url,
                request_kwargs={"timeout": 30},
            )
        )

    def _setup_contracts(self) -> None:
        self._escrow: AsyncContract | None = None
        self._signal: AsyncContract | None = None
        self._account: AsyncContract | None = None
        for label, addr, abi, attr in [
            ("escrow", self._escrow_address, ESCROW_ABI, "_escrow"),
            ("signal", self._signal_address, SIGNAL_COMMITMENT_ABI, "_signal"),
            ("account", self._account_address, ACCOUNT_ABI, "_account"),
        ]:
            if addr:
                try:
                    setattr(
                        self,
                        attr,
                        self._w3.eth.contract(
                            address=self._w3.to_checksum_address(addr),
                            abi=abi,
                        ),
                    )
                except ValueError:
                    log.error("invalid_contract_address", contract=label, address=addr)

    def _rotate_rpc(self) -> bool:
        """Switch to the next RPC URL. Returns True if a different URL was selected."""
        if len(self._rpc_urls) <= 1:
            return False
        old_index = self._rpc_index
        self._rpc_index = (self._rpc_index + 1) % len(self._rpc_urls)
        if self._rpc_index == old_index:
            return False
        new_url = self._rpc_urls[self._rpc_index]
        log.warning("rpc_failover", new_url=new_url, old_index=old_index, new_index=self._rpc_index)
        self._w3 = self._create_provider(new_url)
        self._setup_contracts()
        return True

    async def _with_failover(self, make_call: Callable[[], Awaitable[Any]]) -> Any:
        """Execute a contract call with circuit breaker and RPC failover.

        The circuit breaker prevents hammering endpoints that are consistently
        failing. The make_call callable is re-invoked after each rotation so
        it picks up the freshly-created contract references.
        """
        if not self._circuit_breaker.allow_request():
            raise ConnectionError(
                f"RPC circuit breaker open — all endpoints unhealthy (recovery in {self._circuit_breaker._recovery_timeout}s)"
            )

        tried = 0
        total = len(self._rpc_urls)
        last_exc: Exception | None = None
        while tried < total:
            try:
                result = await make_call()
                self._circuit_breaker.record_success()
                return result
            except _FAILOVER_ERRORS as e:
                last_exc = e
                tried += 1
                if tried < total and self._rotate_rpc():
                    from djinn_validator.api.metrics import RPC_FAILOVERS

                    RPC_FAILOVERS.inc()
                    log.warning("rpc_call_failed_retrying", err=str(e), tried=tried)
                    continue
                self._circuit_breaker.record_failure()
                raise
        self._circuit_breaker.record_failure()
        raise last_exc or ConnectionError("All RPC endpoints exhausted")

    async def is_signal_active(self, signal_id: int) -> bool:
        """Check if a signal is still active on-chain.

        Returns False on error (fail-safe: don't release shares if chain is unreachable).
        Returns True only when contract is unconfigured (dev mode).
        """
        if self._signal is None:
            log.warning("signal_contract_not_configured")
            return True  # Permissive in dev mode (no contract)
        try:
            return await self._with_failover(
                lambda: self._signal.functions.isActive(signal_id).call()  # type: ignore[union-attr]
            )
        except Exception as e:
            log.error("is_signal_active_failed", signal_id=signal_id, err=str(e))
            return False  # Fail-safe: don't release shares when chain is unreachable

    async def get_signal(self, signal_id: int) -> dict[str, Any]:
        """Read signal metadata from SignalCommitment contract."""
        if self._signal is None:
            return {}
        try:
            result = await self._with_failover(
                lambda: self._signal.functions.getSignal(signal_id).call()  # type: ignore[union-attr]
            )
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
            log.error("get_signal_failed", signal_id=signal_id, err=str(e))
            return {}

    async def verify_purchase(self, signal_id: int, buyer: str) -> dict[str, Any]:
        """Verify a purchase exists on-chain for the given signal and buyer.

        Queries getPurchasesBySignal to find purchase IDs, then checks each
        via getPurchase to find one where idiot == buyer.
        """
        empty = {"notional": 0, "pricePaid": 0, "sportsbook": ""}
        if self._escrow is None:
            log.warning("escrow_contract_not_configured")
            return empty
        try:
            buyer_addr = self._w3.to_checksum_address(buyer)
        except ValueError:
            log.error("invalid_buyer_address", buyer=buyer)
            return empty
        try:
            purchase_ids: list[int] = await self._with_failover(
                lambda: self._escrow.functions.getPurchasesBySignal(  # type: ignore[union-attr]
                    signal_id,
                ).call()
            )
            for pid in purchase_ids:
                p = await self._with_failover(
                    lambda pid=pid: self._escrow.functions.getPurchase(  # type: ignore[union-attr]
                        pid,
                    ).call()
                )
                # Purchase tuple: (idiot, signalId, notional, feePaid, creditUsed, usdcPaid, odds, outcome, purchasedAt)
                if p[0].lower() == buyer_addr.lower():
                    return {
                        "notional": p[2],
                        "pricePaid": p[4] + p[5],  # creditUsed + usdcPaid
                        "sportsbook": "",
                    }
            return empty
        except Exception as e:
            log.error("verify_purchase_failed", signal_id=signal_id, buyer=buyer, err=str(e))
            return empty

    async def is_audit_ready(self, genius: str, idiot: str) -> bool:
        """Check if a Genius-Idiot pair has completed a cycle."""
        if self._account is None:
            return False
        try:
            genius_addr = self._w3.to_checksum_address(genius)
            idiot_addr = self._w3.to_checksum_address(idiot)
        except ValueError:
            log.error("invalid_address_for_audit", genius=genius, idiot=idiot)
            return False
        try:
            return await self._with_failover(
                lambda: self._account.functions.isAuditReady(  # type: ignore[union-attr]
                    genius_addr,
                    idiot_addr,
                ).call()
            )
        except Exception as e:
            log.error("is_audit_ready_failed", genius=genius, idiot=idiot, err=str(e))
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
            except TimeoutError:
                log.warning("chain_client_close_timeout")
            except Exception as e:
                log.warning("chain_client_close_error", err=str(e))

    async def is_connected(self) -> bool:
        """Check Base chain RPC connectivity (tries all endpoints)."""
        for _ in range(len(self._rpc_urls)):
            try:
                await self._w3.eth.block_number
                return True
            except _FAILOVER_ERRORS:
                if not self._rotate_rpc():
                    break
            except Exception as e:
                log.warning("rpc_connection_failed", err=str(e))
                return False
        return False

    @property
    def rpc_url(self) -> str:
        """Current active RPC URL."""
        return self._rpc_urls[self._rpc_index]

    @property
    def rpc_url_count(self) -> int:
        """Number of configured RPC endpoints."""
        return len(self._rpc_urls)

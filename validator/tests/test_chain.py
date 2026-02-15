"""Tests for the ChainClient on-chain interaction layer."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from djinn_validator.chain.contracts import ChainClient


@pytest.fixture
def client() -> ChainClient:
    """Create a ChainClient with all addresses configured."""
    with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
        mock_w3 = MagicMock()
        mock_w3.to_checksum_address = lambda x: x
        mock_w3.eth = MagicMock()
        mock_contract = MagicMock()
        mock_w3.eth.contract.return_value = mock_contract
        MockW3.return_value = mock_w3
        MockW3.AsyncHTTPProvider = MagicMock()

        c = ChainClient(
            rpc_url="http://localhost:8545",
            escrow_address="0x1111111111111111111111111111111111111111",
            signal_address="0x2222222222222222222222222222222222222222",
            account_address="0x3333333333333333333333333333333333333333",
        )
        c._w3 = mock_w3
        return c


class TestChainClientInit:
    def test_no_contracts_when_addresses_empty(self) -> None:
        with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
            mock_w3 = MagicMock()
            MockW3.return_value = mock_w3
            MockW3.AsyncHTTPProvider = MagicMock()
            c = ChainClient(rpc_url="http://localhost:8545")
            assert c._escrow is None
            assert c._signal is None
            assert c._account is None


class TestIsSignalActive:
    @pytest.mark.asyncio
    async def test_returns_true_when_no_contract(self) -> None:
        """Permissive in dev mode: returns True when contract not configured."""
        with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
            mock_w3 = MagicMock()
            MockW3.return_value = mock_w3
            MockW3.AsyncHTTPProvider = MagicMock()
            c = ChainClient(rpc_url="http://localhost:8545")
            assert await c.is_signal_active(1) is True

    @pytest.mark.asyncio
    async def test_calls_contract(self, client: ChainClient) -> None:
        mock_call = AsyncMock(return_value=True)
        client._signal.functions.isActive.return_value.call = mock_call
        result = await client.is_signal_active(42)
        assert result is True
        client._signal.functions.isActive.assert_called_with(42)

    @pytest.mark.asyncio
    async def test_returns_false_for_inactive(self, client: ChainClient) -> None:
        mock_call = AsyncMock(return_value=False)
        client._signal.functions.isActive.return_value.call = mock_call
        result = await client.is_signal_active(99)
        assert result is False


class TestGetSignal:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_contract(self) -> None:
        with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
            mock_w3 = MagicMock()
            MockW3.return_value = mock_w3
            MockW3.AsyncHTTPProvider = MagicMock()
            c = ChainClient(rpc_url="http://localhost:8545")
            result = await c.get_signal(1)
            assert result == {}

    @pytest.mark.asyncio
    async def test_parses_contract_result(self, client: ChainClient) -> None:
        mock_result = [
            "0xGenius",      # genius
            b"\x00" * 32,   # commitHash
            b"\xab\xcd",    # encryptedBlob
            500,             # maxPriceBps
            200,             # slaBps
            1,               # status
            1700000000,      # timestamp
        ]
        mock_call = AsyncMock(return_value=mock_result)
        client._signal.functions.getSignal.return_value.call = mock_call

        result = await client.get_signal(42)
        assert result["genius"] == "0xGenius"
        assert result["maxPriceBps"] == 500
        assert result["slaBps"] == 200
        assert result["status"] == 1
        assert result["timestamp"] == 1700000000


class TestVerifyPurchase:
    @pytest.mark.asyncio
    async def test_returns_zero_when_no_contract(self) -> None:
        with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
            mock_w3 = MagicMock()
            MockW3.return_value = mock_w3
            MockW3.AsyncHTTPProvider = MagicMock()
            c = ChainClient(rpc_url="http://localhost:8545")
            result = await c.verify_purchase(1, "0xBuyer")
            assert result["notional"] == 0
            assert result["pricePaid"] == 0

    @pytest.mark.asyncio
    async def test_returns_purchase_data(self, client: ChainClient) -> None:
        mock_call = AsyncMock(return_value=[1000000, 50000, "draftkings"])
        client._escrow.functions.purchases.return_value.call = mock_call

        result = await client.verify_purchase(1, "0xBuyer")
        assert result["notional"] == 1000000
        assert result["pricePaid"] == 50000
        assert result["sportsbook"] == "draftkings"


class TestIsAuditReady:
    @pytest.mark.asyncio
    async def test_returns_false_when_no_contract(self) -> None:
        with patch("djinn_validator.chain.contracts.AsyncWeb3") as MockW3:
            mock_w3 = MagicMock()
            MockW3.return_value = mock_w3
            MockW3.AsyncHTTPProvider = MagicMock()
            c = ChainClient(rpc_url="http://localhost:8545")
            result = await c.is_audit_ready("0xGenius", "0xIdiot")
            assert result is False

    @pytest.mark.asyncio
    async def test_calls_contract(self, client: ChainClient) -> None:
        mock_call = AsyncMock(return_value=True)
        client._account.functions.isAuditReady.return_value.call = mock_call
        result = await client.is_audit_ready("0xGenius", "0xIdiot")
        assert result is True


class TestIsConnected:
    @pytest.mark.asyncio
    async def test_returns_true_on_success(self, client: ChainClient) -> None:
        client._w3.eth.block_number = AsyncMock(return_value=12345)
        # The property access needs to be awaited — mock it as a coroutine
        type(client._w3.eth).block_number = property(
            lambda self: _async_value(12345)
        )
        result = await client.is_connected()
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_on_error(self, client: ChainClient) -> None:
        async def _raise() -> int:
            raise ConnectionError("connection refused")

        type(client._w3.eth).block_number = property(lambda self: _raise())
        result = await client.is_connected()
        assert result is False


class TestClose:
    @pytest.mark.asyncio
    async def test_close_with_session(self, client: ChainClient) -> None:
        mock_session = AsyncMock()
        client._w3.provider._request_session = mock_session
        await client.close()
        mock_session.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_without_session(self, client: ChainClient) -> None:
        """close() should not raise even if provider has no session."""
        client._w3.provider = MagicMock(spec=[])  # No _request_session attr
        await client.close()  # Should not raise


async def _async_value(val: int) -> int:
    return val

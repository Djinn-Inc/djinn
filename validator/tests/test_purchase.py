"""Tests for purchase orchestration."""

from djinn_validator.core.mpc import MPCResult
from djinn_validator.core.purchase import PurchaseOrchestrator, PurchaseStatus
from djinn_validator.core.shares import ShareStore
from djinn_validator.utils.crypto import Share


class TestPurchaseOrchestrator:
    def setup_method(self) -> None:
        self.store = ShareStore()
        self.orch = PurchaseOrchestrator(self.store)

    def test_initiate_without_share_fails(self) -> None:
        req = self.orch.initiate("sig-1", "0xBuyer", "DraftKings")
        assert req.status == PurchaseStatus.FAILED

    def test_initiate_with_share(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        req = self.orch.initiate("sig-1", "0xBuyer", "DraftKings")
        assert req.status == PurchaseStatus.CHECKING_AVAILABILITY

    def test_mpc_available(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        self.orch.initiate("sig-1", "0xBuyer", "DK")
        req = self.orch.set_mpc_result(
            "sig-1", "0xBuyer",
            MPCResult(available=True, participating_validators=7),
        )
        assert req is not None
        assert req.status == PurchaseStatus.AWAITING_PAYMENT

    def test_mpc_unavailable(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        self.orch.initiate("sig-1", "0xBuyer", "DK")
        req = self.orch.set_mpc_result(
            "sig-1", "0xBuyer",
            MPCResult(available=False, participating_validators=7),
        )
        assert req is not None
        assert req.status == PurchaseStatus.UNAVAILABLE

    def test_confirm_payment_releases_share(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"secret")
        self.orch.initiate("sig-1", "0xBuyer", "DK")
        self.orch.set_mpc_result(
            "sig-1", "0xBuyer",
            MPCResult(available=True, participating_validators=7),
        )
        req = self.orch.confirm_payment("sig-1", "0xBuyer", "0xTxHash")
        assert req is not None
        assert req.status == PurchaseStatus.SHARES_RELEASED
        assert req.tx_hash == "0xTxHash"

    def test_get_purchase(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        self.orch.initiate("sig-1", "0xBuyer", "DK")
        req = self.orch.get("sig-1", "0xBuyer")
        assert req is not None
        assert req.signal_id == "sig-1"

    def test_get_nonexistent(self) -> None:
        assert self.orch.get("none", "0x") is None

    def test_duplicate_initiate_returns_existing(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        req1 = self.orch.initiate("sig-1", "0xBuyer", "DK")
        req2 = self.orch.initiate("sig-1", "0xBuyer", "FD")
        assert req1 is req2

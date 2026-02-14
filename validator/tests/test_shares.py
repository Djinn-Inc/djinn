"""Tests for the ShareStore."""

from djinn_validator.core.shares import ShareStore
from djinn_validator.utils.crypto import Share


class TestShareStore:
    def setup_method(self) -> None:
        self.store = ShareStore()

    def test_store_and_retrieve(self) -> None:
        share = Share(x=1, y=12345)
        self.store.store("sig-1", "0xGenius", share, b"encrypted-key")
        record = self.store.get("sig-1")
        assert record is not None
        assert record.genius_address == "0xGenius"
        assert record.share == share
        assert record.encrypted_key_share == b"encrypted-key"

    def test_has(self) -> None:
        assert not self.store.has("sig-1")
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        assert self.store.has("sig-1")

    def test_release(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"secret")
        data = self.store.release("sig-1", "0xBuyer")
        assert data == b"secret"

    def test_release_nonexistent(self) -> None:
        assert self.store.release("nonexistent", "0xB") is None

    def test_double_release(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        self.store.release("sig-1", "0xB")
        # Second release still returns the key
        data = self.store.release("sig-1", "0xB")
        assert data == b"key"

    def test_remove(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"key")
        self.store.remove("sig-1")
        assert not self.store.has("sig-1")

    def test_count(self) -> None:
        assert self.store.count == 0
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"a")
        self.store.store("sig-2", "0xG", Share(x=2, y=2), b"b")
        assert self.store.count == 2

    def test_active_signals(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"a")
        self.store.store("sig-2", "0xG", Share(x=2, y=2), b"b")
        signals = self.store.active_signals()
        assert set(signals) == {"sig-1", "sig-2"}

    def test_duplicate_store_ignored(self) -> None:
        self.store.store("sig-1", "0xG", Share(x=1, y=1), b"first")
        self.store.store("sig-1", "0xG", Share(x=1, y=999), b"second")
        # Should keep first
        record = self.store.get("sig-1")
        assert record is not None
        assert record.encrypted_key_share == b"first"

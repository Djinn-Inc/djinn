"""Tests for the BurnLedger — consumed alpha burn tracking."""

from __future__ import annotations

import pytest

from djinn_validator.core.burn_ledger import BurnLedger


@pytest.fixture
def ledger():
    bl = BurnLedger()  # in-memory
    yield bl
    bl.close()


class TestBurnLedger:
    def test_record_and_check(self, ledger: BurnLedger) -> None:
        """Recording a burn makes it consumed."""
        assert ledger.record_burn("0xabc123", "5ColdKey", 0.0001) is True
        assert ledger.is_consumed("0xabc123") is True

    def test_double_consume_rejected(self, ledger: BurnLedger) -> None:
        """Second record of the same tx_hash returns False."""
        assert ledger.record_burn("0xdouble", "5ColdKey", 0.0001) is True
        assert ledger.record_burn("0xdouble", "5ColdKey", 0.0001) is False

    def test_unconsumed(self, ledger: BurnLedger) -> None:
        """Unknown hash returns False."""
        assert ledger.is_consumed("0xnever_seen") is False

    def test_multiple_distinct_burns(self, ledger: BurnLedger) -> None:
        """Different tx hashes are tracked independently."""
        assert ledger.record_burn("0xtx1", "5Key1", 0.0001) is True
        assert ledger.record_burn("0xtx2", "5Key2", 0.0002) is True
        assert ledger.is_consumed("0xtx1") is True
        assert ledger.is_consumed("0xtx2") is True
        assert ledger.is_consumed("0xtx3") is False

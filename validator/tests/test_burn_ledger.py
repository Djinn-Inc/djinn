"""Tests for the BurnLedger — consumed alpha burn tracking with multi-credit support."""

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
        """Recording a single-credit burn makes it consumed."""
        assert ledger.record_burn("0xabc123", "5ColdKey", 0.0001) is True
        assert ledger.is_consumed("0xabc123") is True

    def test_double_consume_rejected(self, ledger: BurnLedger) -> None:
        """Second record of a single-credit burn returns False."""
        assert ledger.record_burn("0xdouble", "5ColdKey", 0.0001) is True
        assert ledger.record_burn("0xdouble", "5ColdKey", 0.0001) is False

    def test_unconsumed(self, ledger: BurnLedger) -> None:
        """Unknown hash returns False for is_consumed."""
        assert ledger.is_consumed("0xnever_seen") is False

    def test_remaining_credits_unknown(self, ledger: BurnLedger) -> None:
        """Unknown hash returns 0 remaining credits."""
        assert ledger.remaining_credits("0xnever_seen") == 0

    def test_multiple_distinct_burns(self, ledger: BurnLedger) -> None:
        """Different tx hashes are tracked independently."""
        assert ledger.record_burn("0xtx1", "5Key1", 0.0001) is True
        assert ledger.record_burn("0xtx2", "5Key2", 0.0001) is True
        assert ledger.is_consumed("0xtx1") is True
        assert ledger.is_consumed("0xtx2") is True
        assert ledger.is_consumed("0xtx3") is False


class TestMultiCreditBurns:
    """Tests for multi-credit burn support (bulk attestation)."""

    def test_multi_credit_burn(self, ledger: BurnLedger) -> None:
        """Burning 0.0005 TAO gives 5 credits at 0.0001 min."""
        assert ledger.record_burn("0xbulk", "5Key", 0.0005, min_amount=0.0001) is True
        assert ledger.remaining_credits("0xbulk") == 4  # 5 total, 1 used
        assert ledger.is_consumed("0xbulk") is False

    def test_credits_deplete(self, ledger: BurnLedger) -> None:
        """Credits deplete one at a time until exhausted."""
        # 3 credits total
        assert ledger.record_burn("0x3x", "5Key", 0.0003, min_amount=0.0001) is True
        assert ledger.remaining_credits("0x3x") == 2  # used 1 of 3

        assert ledger.record_burn("0x3x", "5Key", 0.0003, min_amount=0.0001) is True
        assert ledger.remaining_credits("0x3x") == 1  # used 2 of 3

        assert ledger.record_burn("0x3x", "5Key", 0.0003, min_amount=0.0001) is True
        assert ledger.remaining_credits("0x3x") == 0  # used 3 of 3

        # 4th attempt should fail
        assert ledger.record_burn("0x3x", "5Key", 0.0003, min_amount=0.0001) is False
        assert ledger.is_consumed("0x3x") is True

    def test_13_page_bulk_burn(self, ledger: BurnLedger) -> None:
        """Burning 0.0013 TAO grants exactly 13 credits."""
        tx = "0x13pages"
        for i in range(13):
            assert ledger.record_burn(tx, "5Key", 0.0013, min_amount=0.0001) is True

        assert ledger.remaining_credits(tx) == 0
        assert ledger.is_consumed(tx) is True
        assert ledger.record_burn(tx, "5Key", 0.0013, min_amount=0.0001) is False

    def test_partial_amount_floors(self, ledger: BurnLedger) -> None:
        """Amounts that aren't exact multiples floor to the lower credit count."""
        # 0.00025 / 0.0001 = 2.5, floors to 2 credits
        assert ledger.record_burn("0xpartial", "5Key", 0.00025, min_amount=0.0001) is True
        assert ledger.remaining_credits("0xpartial") == 1  # 2 total, 1 used

        assert ledger.record_burn("0xpartial", "5Key", 0.00025, min_amount=0.0001) is True
        assert ledger.record_burn("0xpartial", "5Key", 0.00025, min_amount=0.0001) is False

    def test_minimum_burn_gives_one_credit(self, ledger: BurnLedger) -> None:
        """Burning exactly the minimum amount gives 1 credit."""
        assert ledger.record_burn("0xmin", "5Key", 0.0001, min_amount=0.0001) is True
        assert ledger.remaining_credits("0xmin") == 0
        assert ledger.is_consumed("0xmin") is True

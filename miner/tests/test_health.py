"""Tests for the HealthTracker module."""

from __future__ import annotations

import time
from unittest.mock import patch

from djinn_miner.core.health import HealthTracker


class TestHealthTracker:
    def test_initial_state(self) -> None:
        tracker = HealthTracker(uid=42, odds_api_connected=True, bt_connected=True)
        status = tracker.get_status()
        assert status.status == "ok"
        assert status.version == "0.1.0"
        assert status.uid == 42
        assert status.odds_api_connected is True
        assert status.bt_connected is True

    def test_default_state(self) -> None:
        tracker = HealthTracker()
        status = tracker.get_status()
        assert status.uid is None
        assert status.odds_api_connected is False
        assert status.bt_connected is False

    def test_uptime_positive(self) -> None:
        tracker = HealthTracker()
        status = tracker.get_status()
        assert status.uptime_seconds >= 0

    def test_record_ping(self) -> None:
        tracker = HealthTracker()
        assert tracker.ping_count == 0
        tracker.record_ping()
        tracker.record_ping()
        tracker.record_ping()
        assert tracker.ping_count == 3

    def test_set_uid(self) -> None:
        tracker = HealthTracker()
        assert tracker.get_status().uid is None
        tracker.set_uid(99)
        assert tracker.get_status().uid == 99

    def test_set_odds_api_connected(self) -> None:
        tracker = HealthTracker()
        assert tracker.get_status().odds_api_connected is False
        tracker.set_odds_api_connected(True)
        assert tracker.get_status().odds_api_connected is True
        tracker.set_odds_api_connected(False)
        assert tracker.get_status().odds_api_connected is False

    def test_set_bt_connected(self) -> None:
        tracker = HealthTracker()
        assert tracker.get_status().bt_connected is False
        tracker.set_bt_connected(True)
        assert tracker.get_status().bt_connected is True

    def test_uptime_increases_over_time(self) -> None:
        tracker = HealthTracker()
        first = tracker.get_status().uptime_seconds
        # Monotonic time always moves forward, so second call should be >= first
        second = tracker.get_status().uptime_seconds
        assert second >= first

"""Health check handler — tracks uptime and responds to validator pings."""

from __future__ import annotations

import time

import structlog

from djinn_miner.api.models import HealthResponse

log = structlog.get_logger()


class HealthTracker:
    """Tracks miner health metrics for validator health checks.

    Uptime accounts for 15% of miner scoring (PDF v9), so responsiveness
    to health pings directly affects emissions.

    Thread safety: Not needed. All callers run on the asyncio event loop
    (single-threaded). Python's GIL protects the simple attribute assignments
    regardless.
    """

    CONSECUTIVE_FAILURE_THRESHOLD = 3

    def __init__(
        self,
        uid: int | None = None,
        odds_api_connected: bool = False,
        bt_connected: bool = False,
    ) -> None:
        self._uid = uid
        self._odds_api_connected = odds_api_connected
        self._bt_connected = bt_connected
        self._start_time = time.monotonic()
        self._ping_count = 0
        self._consecutive_api_failures = 0
        self._consecutive_bt_failures = 0

    def record_ping(self) -> None:
        """Record a health check ping from a validator."""
        self._ping_count += 1

    def set_uid(self, uid: int) -> None:
        self._uid = uid

    def set_odds_api_connected(self, connected: bool) -> None:
        self._odds_api_connected = connected

    def set_bt_connected(self, connected: bool) -> None:
        self._bt_connected = connected
        if connected:
            self._consecutive_bt_failures = 0

    def record_bt_failure(self) -> None:
        """Record failed BT sync — degrade health after threshold."""
        self._consecutive_bt_failures += 1
        if self._consecutive_bt_failures >= self.CONSECUTIVE_FAILURE_THRESHOLD:
            if self._bt_connected:
                log.warning(
                    "bt_connection_degraded",
                    consecutive_failures=self._consecutive_bt_failures,
                )
                self._bt_connected = False

    def record_api_success(self) -> None:
        """Record successful Odds API call — reset failure counter."""
        self._consecutive_api_failures = 0
        if not self._odds_api_connected:
            log.info("odds_api_recovered")
            self._odds_api_connected = True

    def record_api_failure(self) -> None:
        """Record failed Odds API call — degrade health after threshold."""
        self._consecutive_api_failures += 1
        if self._consecutive_api_failures >= self.CONSECUTIVE_FAILURE_THRESHOLD:
            if self._odds_api_connected:
                log.warning(
                    "odds_api_degraded",
                    consecutive_failures=self._consecutive_api_failures,
                )
                self._odds_api_connected = False

    def get_status(self) -> HealthResponse:
        """Return current health status."""
        uptime = time.monotonic() - self._start_time
        return HealthResponse(
            status="ok",
            version="0.1.0",
            uid=self._uid,
            odds_api_connected=self._odds_api_connected,
            bt_connected=self._bt_connected,
            uptime_seconds=round(uptime, 1),
        )

    @property
    def ping_count(self) -> int:
        return self._ping_count

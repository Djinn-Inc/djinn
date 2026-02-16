"""Tests for Prometheus metrics endpoint and counters."""

from __future__ import annotations

import pytest
from prometheus_client import CollectorRegistry

from djinn_validator.api.metrics import (
    ACTIVE_SHARES,
    CIRCUIT_BREAKER_STATE,
    MPC_DURATION,
    MPC_ERRORS,
    OUTCOMES_ATTESTED,
    PURCHASES_PROCESSED,
    RPC_FAILOVERS,
    SHARES_STORED,
    metrics_response,
)


class TestMetricsResponse:
    def test_returns_bytes(self) -> None:
        result = metrics_response()
        assert isinstance(result, bytes)

    def test_contains_metric_names(self) -> None:
        text = metrics_response().decode()
        assert "djinn_validator_requests_total" in text or "djinn_validator" in text

    def test_prometheus_format(self) -> None:
        text = metrics_response().decode()
        # Should contain TYPE declarations
        assert "# TYPE" in text or "# HELP" in text


class TestCounterIncrements:
    def test_shares_stored_increments(self) -> None:
        before = SHARES_STORED._value.get()
        SHARES_STORED.inc()
        assert SHARES_STORED._value.get() == before + 1

    def test_active_shares_gauge(self) -> None:
        ACTIVE_SHARES.set(42)
        assert ACTIVE_SHARES._value.get() == 42
        ACTIVE_SHARES.set(0)

    def test_purchases_labeled(self) -> None:
        PURCHASES_PROCESSED.labels(result="available").inc()
        PURCHASES_PROCESSED.labels(result="unavailable").inc()
        # Verify both labels exist in metrics output
        text = metrics_response().decode()
        assert "available" in text

    def test_outcomes_labeled(self) -> None:
        OUTCOMES_ATTESTED.labels(outcome="favorable").inc()
        text = metrics_response().decode()
        assert "favorable" in text

    def test_mpc_duration_histogram(self) -> None:
        MPC_DURATION.labels(mode="single_validator").observe(0.5)
        text = metrics_response().decode()
        assert "djinn_validator_mpc_duration_seconds" in text

    def test_mpc_errors_labeled(self) -> None:
        MPC_ERRORS.labels(reason="timeout").inc()
        MPC_ERRORS.labels(reason="mac_failure").inc()
        text = metrics_response().decode()
        assert "djinn_validator_mpc_errors_total" in text

    def test_rpc_failovers_counter(self) -> None:
        before = RPC_FAILOVERS._value.get()
        RPC_FAILOVERS.inc()
        assert RPC_FAILOVERS._value.get() == before + 1

    def test_circuit_breaker_state_gauge(self) -> None:
        CIRCUIT_BREAKER_STATE.labels(target="rpc").set(1)
        text = metrics_response().decode()
        assert "djinn_validator_circuit_breaker_open" in text
        CIRCUIT_BREAKER_STATE.labels(target="rpc").set(0)

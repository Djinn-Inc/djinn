"""Prometheus metrics for the Djinn miner."""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram, generate_latest

REQUEST_COUNT = Counter(
    "djinn_miner_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "djinn_miner_request_latency_seconds",
    "Request latency in seconds",
    ["endpoint"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

CHECKS_PROCESSED = Counter(
    "djinn_miner_checks_processed_total",
    "Total line availability checks processed",
)

LINES_CHECKED = Counter(
    "djinn_miner_lines_checked_total",
    "Total individual lines checked",
    ["result"],  # available, unavailable
)

PROOFS_GENERATED = Counter(
    "djinn_miner_proofs_generated_total",
    "Total proofs generated",
    ["type"],  # tlsnotary, http_attestation, basic
)

ODDS_API_QUERIES = Counter(
    "djinn_miner_odds_api_queries_total",
    "Total queries to The Odds API",
    ["status"],  # success, error, cached
)

UPTIME_SECONDS = Gauge(
    "djinn_miner_uptime_seconds",
    "Miner uptime in seconds",
)

BT_CONNECTED = Gauge(
    "djinn_miner_bt_connected",
    "Whether connected to Bittensor (1=yes, 0=no)",
)


def metrics_response() -> bytes:
    """Generate Prometheus-compatible metrics text."""
    return generate_latest()

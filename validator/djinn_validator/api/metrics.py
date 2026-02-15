"""Prometheus metrics for the Djinn validator.

Exposes key operational metrics via a /metrics endpoint.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram, generate_latest

# --- Request metrics ---
REQUEST_COUNT = Counter(
    "djinn_validator_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "djinn_validator_request_latency_seconds",
    "Request latency in seconds",
    ["endpoint"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# --- Business metrics ---
SHARES_STORED = Counter(
    "djinn_validator_shares_stored_total",
    "Total key shares stored",
)

PURCHASES_PROCESSED = Counter(
    "djinn_validator_purchases_processed_total",
    "Total signal purchases processed",
    ["result"],  # available, unavailable, error
)

MPC_SESSIONS = Counter(
    "djinn_validator_mpc_sessions_total",
    "Total MPC sessions initiated",
    ["mode"],  # single_validator, distributed
)

OUTCOMES_ATTESTED = Counter(
    "djinn_validator_outcomes_attested_total",
    "Total outcomes attested",
    ["outcome"],  # favorable, unfavorable, void
)

# --- State metrics ---
ACTIVE_SHARES = Gauge(
    "djinn_validator_active_shares",
    "Number of key shares currently stored",
)

MPC_ACTIVE_SESSIONS = Gauge(
    "djinn_validator_mpc_active_sessions",
    "Number of active MPC sessions",
)

RATE_LIMIT_REJECTIONS = Counter(
    "djinn_validator_rate_limit_rejections_total",
    "Total requests rejected by rate limiter",
)

UPTIME_SECONDS = Gauge(
    "djinn_validator_uptime_seconds",
    "Validator uptime in seconds",
)

BT_CONNECTED = Gauge(
    "djinn_validator_bt_connected",
    "Whether connected to Bittensor (1=yes, 0=no)",
)


def metrics_response() -> bytes:
    """Generate Prometheus-compatible metrics text."""
    return generate_latest()

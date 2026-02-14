"""Entry point for the Djinn Protocol Bittensor miner.

Starts the FastAPI server that responds to validator queries for
line availability checking and health pings.
"""

from __future__ import annotations

import structlog
import uvicorn

from djinn_miner.api.server import create_app
from djinn_miner.config import Config
from djinn_miner.core.checker import LineChecker
from djinn_miner.core.health import HealthTracker
from djinn_miner.core.proof import ProofGenerator
from djinn_miner.data.odds_api import OddsApiClient

log = structlog.get_logger()


def main() -> None:
    """Start the Djinn miner."""
    config = Config()

    odds_client = OddsApiClient(
        api_key=config.odds_api_key,
        base_url=config.odds_api_base_url,
        cache_ttl=config.odds_cache_ttl,
    )

    checker = LineChecker(
        odds_client=odds_client,
        line_tolerance=config.line_tolerance,
    )
    proof_gen = ProofGenerator()

    health_tracker = HealthTracker(
        odds_api_connected=bool(config.odds_api_key),
    )

    app = create_app(
        checker=checker,
        proof_gen=proof_gen,
        health_tracker=health_tracker,
    )

    log.info(
        "miner_starting",
        host=config.api_host,
        port=config.api_port,
        netuid=config.bt_netuid,
        odds_api_configured=bool(config.odds_api_key),
    )

    uvicorn.run(
        app,
        host=config.api_host,
        port=config.api_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()

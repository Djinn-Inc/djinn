"""Entry point for the Djinn Protocol Bittensor miner.

Starts the FastAPI server and Bittensor metagraph sync loop concurrently.
The FastAPI server handles validator queries for line availability and proofs.
The BT loop keeps the metagraph fresh and re-serves the axon if needed.
"""

from __future__ import annotations

import asyncio

import structlog
import uvicorn

from djinn_miner.api.server import create_app
from djinn_miner.bt.neuron import DjinnMiner
from djinn_miner.config import Config
from djinn_miner.core.checker import LineChecker
from djinn_miner.core.health import HealthTracker
from djinn_miner.core.proof import ProofGenerator, SessionCapture
from djinn_miner.data.odds_api import OddsApiClient

log = structlog.get_logger()


async def bt_sync_loop(neuron: DjinnMiner, health: HealthTracker) -> None:
    """Background loop: keep metagraph fresh and check registration."""
    log.info("bt_sync_loop_started")

    while True:
        try:
            neuron.sync_metagraph()

            if not neuron.is_registered():
                log.warning("miner_deregistered", msg="No longer registered on subnet")
                health.set_bt_connected(False)
            else:
                health.set_bt_connected(True)

        except Exception as e:
            log.error("bt_sync_error", error=str(e))

        await asyncio.sleep(60)  # Sync every 60 seconds


async def run_server(app: object, host: str, port: int) -> None:
    """Run uvicorn as an async task."""
    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def async_main() -> None:
    """Start miner with concurrent API server and BT sync."""
    config = Config()

    # Session capture for proof generation
    session_capture = SessionCapture()

    odds_client = OddsApiClient(
        api_key=config.odds_api_key,
        base_url=config.odds_api_base_url,
        cache_ttl=config.odds_cache_ttl,
        session_capture=session_capture,
    )

    checker = LineChecker(
        odds_client=odds_client,
        line_tolerance=config.line_tolerance,
    )
    proof_gen = ProofGenerator(session_capture=session_capture)

    health_tracker = HealthTracker(
        odds_api_connected=bool(config.odds_api_key),
    )

    # Initialize Bittensor neuron
    neuron = DjinnMiner(
        netuid=config.bt_netuid,
        network=config.bt_network,
        wallet_name=config.bt_wallet_name,
        hotkey_name=config.bt_wallet_hotkey,
        axon_port=config.api_port,
    )

    bt_ok = neuron.setup()
    if bt_ok:
        health_tracker.set_uid(neuron.uid)  # type: ignore[arg-type]
        health_tracker.set_bt_connected(True)
    else:
        log.warning(
            "running_without_bittensor",
            msg="Miner API will start but won't be discoverable on subnet",
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
        bt_connected=bt_ok,
        odds_api_configured=bool(config.odds_api_key),
    )

    # Run API server and BT sync loop concurrently
    tasks = [run_server(app, config.api_host, config.api_port)]
    if bt_ok:
        tasks.append(bt_sync_loop(neuron, health_tracker))

    await asyncio.gather(*tasks)


def main() -> None:
    """Start the Djinn miner."""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()

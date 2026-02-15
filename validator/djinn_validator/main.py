"""Entry point for the Djinn Protocol Bittensor validator.

Starts the FastAPI server and the Bittensor epoch loop concurrently.
"""

from __future__ import annotations

import asyncio
import os
import signal

import structlog
import uvicorn

from djinn_validator.logging import configure_logging

configure_logging()

from djinn_validator.api.server import create_app
from djinn_validator.bt.neuron import DjinnValidator
from djinn_validator.chain.contracts import ChainClient
from djinn_validator.config import Config
from djinn_validator.core.outcomes import OutcomeAttestor
from djinn_validator.core.purchase import PurchaseOrchestrator
from djinn_validator.core.mpc_coordinator import MPCCoordinator
from djinn_validator.core.scoring import MinerScorer
from djinn_validator.core.shares import ShareStore

log = structlog.get_logger()


async def epoch_loop(
    neuron: DjinnValidator,
    scorer: MinerScorer,
    share_store: ShareStore,
    outcome_attestor: OutcomeAttestor,
) -> None:
    """Main validator epoch loop: sync metagraph, score miners, set weights."""
    log.info("epoch_loop_started")

    while True:
        try:
            # Sync metagraph
            neuron.sync_metagraph()

            # Health-check all miners
            miner_uids = neuron.get_miner_uids()
            for uid in miner_uids:
                axon = neuron.get_axon_info(uid)
                hotkey = axon.get("hotkey", f"uid-{uid}")
                metrics = scorer.get_or_create(uid, hotkey)
                # In production: ping miner axon and record health check
                metrics.record_health_check(responded=True)

            # Resolve any pending signal outcomes
            hotkey = ""
            if neuron.wallet:
                hotkey = neuron.wallet.hotkey.ss58_address
            resolved = await outcome_attestor.resolve_all_pending(hotkey)
            if resolved:
                log.info("outcomes_resolved", count=len(resolved))

            # Determine if this is an active epoch (any signals being processed)
            is_active = share_store.count > 0

            # Compute and set weights
            if neuron.should_set_weights():
                weights = scorer.compute_weights(is_active)
                if weights:
                    neuron.set_weights(weights)
                    log.info("weights_updated", n_miners=len(weights), active=is_active)

            # Reset per-epoch metrics
            scorer.reset_epoch()

            # Increment consecutive epochs for responding miners
            for uid in miner_uids:
                hotkey = neuron.get_axon_info(uid).get("hotkey", f"uid-{uid}")
                m = scorer.get_or_create(uid, hotkey)
                m.consecutive_epochs += 1

        except Exception as e:
            log.error("epoch_error", error=str(e), exc_info=True)

        # Wait for next epoch (~12 seconds per Bittensor block, tempo ~100 blocks)
        await asyncio.sleep(12)


async def run_server(app: object, host: str, port: int) -> None:
    """Run uvicorn as an async task."""
    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def async_main() -> None:
    """Start validator with concurrent API server and epoch loop."""
    config = Config()
    warnings = config.validate()
    for w in warnings:
        log.warning("config_warning", msg=w)

    # Initialize components — SQLite persistence for key shares
    share_store = ShareStore(db_path="data/shares.db")
    purchase_orch = PurchaseOrchestrator(share_store)
    outcome_attestor = OutcomeAttestor(sports_api_key=config.sports_api_key)
    scorer = MinerScorer()

    chain_client = ChainClient(
        rpc_url=config.base_rpc_url,
        escrow_address=config.escrow_address,
        signal_address=config.signal_commitment_address,
        account_address=config.account_address,
    )

    # Initialize Bittensor neuron
    neuron = DjinnValidator(
        netuid=config.bt_netuid,
        network=config.bt_network,
        wallet_name=config.bt_wallet_name,
        hotkey_name=config.bt_wallet_hotkey,
    )

    bt_ok = neuron.setup()
    if not bt_ok:
        log.warning(
            "running_without_bittensor",
            msg="Validator API will start but no weights will be set",
        )

    mpc_coordinator = MPCCoordinator()

    # Create FastAPI app
    app = create_app(
        share_store=share_store,
        purchase_orch=purchase_orch,
        outcome_attestor=outcome_attestor,
        chain_client=chain_client,
        neuron=neuron if bt_ok else None,
        mpc_coordinator=mpc_coordinator,
    )

    log.info(
        "validator_starting",
        version="0.1.0",
        host=config.api_host,
        port=config.api_port,
        netuid=config.bt_netuid,
        bt_network=config.bt_network,
        bt_connected=bt_ok,
        rpc_url=config.base_rpc_url[:40] + "..." if len(config.base_rpc_url) > 40 else config.base_rpc_url,
        shares_held=share_store.count,
        log_format=os.getenv("LOG_FORMAT", "console"),
    )

    # Run API server and epoch loop concurrently
    running_tasks = [asyncio.create_task(run_server(app, config.api_host, config.api_port))]
    if bt_ok:
        running_tasks.append(
            asyncio.create_task(epoch_loop(neuron, scorer, share_store, outcome_attestor))
        )

    shutdown_event = asyncio.Event()

    def _shutdown(sig: signal.Signals) -> None:
        log.info("shutdown_signal", signal=sig.name)
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _shutdown, sig)

    await shutdown_event.wait()
    log.info("shutting_down")
    for t in running_tasks:
        t.cancel()
    await asyncio.gather(*running_tasks, return_exceptions=True)
    await outcome_attestor.close()
    share_store.close()
    log.info("shutdown_complete")


def main() -> None:
    """Start the Djinn validator."""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()

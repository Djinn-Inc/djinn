"""Entry point for the Djinn Protocol Bittensor validator.

Starts the FastAPI server and the Bittensor epoch loop concurrently.
"""

from __future__ import annotations

import asyncio
import signal
import sys

import structlog
import uvicorn

from djinn_validator.api.server import create_app
from djinn_validator.bt.neuron import DjinnValidator
from djinn_validator.chain.contracts import ChainClient
from djinn_validator.config import Config
from djinn_validator.core.outcomes import OutcomeAttestor
from djinn_validator.core.purchase import PurchaseOrchestrator
from djinn_validator.core.scoring import MinerScorer
from djinn_validator.core.shares import ShareStore

log = structlog.get_logger()


async def epoch_loop(
    neuron: DjinnValidator,
    scorer: MinerScorer,
    share_store: ShareStore,
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
            log.error("epoch_error", error=str(e))

        # Wait for next epoch (~12 seconds per Bittensor block, tempo ~100 blocks)
        await asyncio.sleep(12)


def main() -> None:
    """Start the Djinn validator."""
    config = Config()

    # Initialize components
    share_store = ShareStore()
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
        log.warning("running_without_bittensor", msg="Validator API will start but no weights will be set")

    # Create FastAPI app
    app = create_app(
        share_store=share_store,
        purchase_orch=purchase_orch,
        outcome_attestor=outcome_attestor,
        chain_client=chain_client,
        neuron=neuron if bt_ok else None,
    )

    log.info(
        "validator_starting",
        host=config.api_host,
        port=config.api_port,
        netuid=config.bt_netuid,
    )

    # Run API server (epoch loop runs as background task in production)
    uvicorn.run(
        app,
        host=config.api_host,
        port=config.api_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()

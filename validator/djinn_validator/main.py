"""Entry point for the Djinn Protocol Bittensor validator.

Starts the FastAPI server and the Bittensor epoch loop concurrently.
"""

from __future__ import annotations

import asyncio
import os
import random
import signal

import httpx
import structlog
import uvicorn

from djinn_validator import __version__
from djinn_validator.logging import configure_logging

configure_logging()

from djinn_validator.api.server import create_app
from djinn_validator.bt.neuron import DjinnValidator
from djinn_validator.chain.contracts import ChainClient
from djinn_validator.config import Config
from djinn_validator.core.mpc_coordinator import MPCCoordinator
from djinn_validator.core.outcomes import OutcomeAttestor
from djinn_validator.core.purchase import PurchaseOrchestrator
from djinn_validator.core.challenges import challenge_miners
from djinn_validator.core.scoring import MinerScorer
from djinn_validator.core.shares import ShareStore


def _sanitize_url(url: str) -> str:
    """Strip credentials and path from URL for safe logging."""
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.hostname}:{parsed.port or 443}"
    except Exception:
        return "<unparseable>"

log = structlog.get_logger()


async def _settle_outcomes(
    outcome_attestor: OutcomeAttestor,
    chain_client: ChainClient,
    resolved: list[object],
    neuron: DjinnValidator,
) -> None:
    """Write consensus outcomes on-chain for newly resolved signals.

    For each resolved signal that reaches consensus:
    1. Look up the genius address from SignalCommitment
    2. Look up all purchases for the signal from Escrow
    3. Call Account.recordOutcome() and Escrow.setOutcome() for each purchase
    """
    from djinn_validator.core.outcomes import OutcomeAttestation

    # Count validators with permits for consensus threshold
    total_validators = 0
    try:
        total_validators = sum(
            1 for uid in range(neuron.metagraph.n.item())
            if neuron.metagraph.validator_permit[uid]
        )
    except Exception:
        total_validators = 1  # Fallback: just this validator

    settled_count = 0
    for attestation in resolved:
        if not isinstance(attestation, OutcomeAttestation):
            continue

        signal_id = attestation.signal_id
        consensus = outcome_attestor.check_consensus(signal_id, total_validators)
        if consensus is None:
            continue

        # Convert string signal_id to int for on-chain lookup
        try:
            signal_id_int = int(signal_id)
        except (ValueError, TypeError):
            log.warning("non_numeric_signal_id", signal_id=signal_id)
            continue

        # Get genius address from on-chain signal
        signal_data = await chain_client.get_signal(signal_id_int)
        genius = signal_data.get("genius", "")
        if not genius or genius == "0x" + "0" * 40:
            log.warning("signal_genius_not_found", signal_id=signal_id)
            continue

        # Get all purchases for this signal
        purchase_ids = await chain_client.get_purchases_by_signal(signal_id_int)
        if not purchase_ids:
            log.debug("no_purchases_for_signal", signal_id=signal_id)
            continue

        for pid in purchase_ids:
            purchase = await chain_client.get_purchase(pid)
            if not purchase:
                continue

            idiot = purchase.get("idiot", "")
            if not idiot or idiot == "0x" + "0" * 40:
                continue

            # Skip already settled
            if purchase.get("outcome", 0) != 0:
                continue

            try:
                result = await chain_client.settle_purchase(
                    genius=genius,
                    idiot=idiot,
                    purchase_id=pid,
                    outcome=consensus.value,
                )
                if result.get("account_tx") or result.get("escrow_tx"):
                    settled_count += 1
            except Exception as e:
                log.error(
                    "settle_purchase_failed",
                    signal_id=signal_id,
                    purchase_id=pid,
                    err=str(e),
                )

    if settled_count:
        log.info("outcomes_settled_on_chain", count=settled_count)


async def epoch_loop(
    neuron: DjinnValidator,
    scorer: MinerScorer,
    share_store: ShareStore,
    outcome_attestor: OutcomeAttestor,
    chain_client: ChainClient | None = None,
) -> None:
    """Main validator epoch loop: sync metagraph, score miners, set weights."""
    log.info(
        "epoch_loop_started",
        settlement_enabled=chain_client is not None and chain_client.can_write,
    )
    consecutive_errors = 0
    # Throttle miner challenges: once every CHALLENGE_INTERVAL_EPOCHS epochs (~10 min)
    CHALLENGE_INTERVAL_EPOCHS = 50  # 50 * 12s = 10 minutes
    epoch_count = 0

    while True:
        try:
            # Sync metagraph
            neuron.sync_metagraph()

            # Health-check all miners by pinging their axon /health endpoint
            miner_uids = neuron.get_miner_uids()
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                for uid in miner_uids:
                    axon = neuron.get_axon_info(uid)
                    hotkey = axon.get("hotkey", f"uid-{uid}")
                    ip = axon.get("ip", "")
                    port = axon.get("port", 0)
                    metrics = scorer.get_or_create(uid, hotkey)

                    if not ip or not port:
                        metrics.record_health_check(responded=False)
                        log.debug("miner_no_axon", uid=uid, hotkey=hotkey)
                        continue

                    url = f"http://{ip}:{port}/health"
                    try:
                        resp = await client.get(url)
                        responded = resp.status_code == 200
                    except httpx.HTTPError:
                        responded = False

                    metrics.record_health_check(responded=responded)
                    log.debug(
                        "miner_health_check",
                        uid=uid,
                        hotkey=hotkey,
                        url=url,
                        responded=responded,
                    )

            # Challenge miners for accuracy scoring (throttled)
            epoch_count += 1
            if epoch_count % CHALLENGE_INTERVAL_EPOCHS == 0:
                sports_api_key = os.environ.get("SPORTS_API_KEY", "")
                if sports_api_key and miner_uids:
                    miner_axons = []
                    for uid in miner_uids:
                        axon = neuron.get_axon_info(uid)
                        miner_axons.append({
                            "uid": uid,
                            "hotkey": axon.get("hotkey", f"uid-{uid}"),
                            "ip": axon.get("ip", ""),
                            "port": axon.get("port", 0),
                        })
                    try:
                        await challenge_miners(scorer, miner_axons, sports_api_key)
                    except Exception as e:
                        log.warning("challenge_miners_error", err=str(e))

            # Resolve any pending signal outcomes
            hotkey = ""
            if neuron.wallet:
                hotkey = neuron.wallet.hotkey.ss58_address
            resolved = await outcome_attestor.resolve_all_pending(hotkey)
            if resolved:
                log.info("outcomes_resolved", count=len(resolved))

            # Settle resolved outcomes on-chain
            if resolved and chain_client and chain_client.can_write:
                await _settle_outcomes(
                    outcome_attestor, chain_client, resolved, neuron,
                )

            # Prune old resolved signals to prevent memory growth
            outcome_attestor.cleanup_resolved()

            # Determine if this is an active epoch (any signals being processed)
            is_active = share_store.count > 0

            # Compute and set weights
            if neuron.should_set_weights():
                weights = scorer.compute_weights(is_active)
                if weights:
                    success = neuron.set_weights(weights)
                    if success:
                        neuron.record_weight_set()
                    log.info("weights_updated", n_miners=len(weights), active=is_active, success=success)

            # Reset per-epoch metrics (also increments consecutive_epochs
            # for miners that participated this epoch)
            scorer.reset_epoch()

            consecutive_errors = 0

        except asyncio.CancelledError:
            log.info("epoch_loop_cancelled")
            return
        except (KeyboardInterrupt, SystemExit):
            raise
        except Exception as e:
            consecutive_errors += 1
            base = min(12 * (2**consecutive_errors), 300)
            backoff = base * (0.5 + random.random())  # jitter: 50-150% of base
            level = "critical" if consecutive_errors >= 10 else "error"
            getattr(log, level)(
                "epoch_error",
                err=str(e),
                error_type=type(e).__name__,
                consecutive=consecutive_errors,
                backoff_s=round(backoff, 1),
                exc_info=True,
            )
            await asyncio.sleep(backoff)
            continue

        # Wait for next epoch (~12 seconds per Bittensor block, tempo ~100 blocks)
        await asyncio.sleep(12)


async def mpc_cleanup_loop(mpc_coordinator: MPCCoordinator) -> None:
    """Periodically remove expired MPC sessions to prevent memory growth."""
    log.info("mpc_cleanup_loop_started")
    while True:
        try:
            await asyncio.sleep(300)  # Every 5 minutes
            removed = mpc_coordinator.cleanup_expired()
            if removed > 0:
                log.info("mpc_sessions_cleaned", count=removed)
        except asyncio.CancelledError:
            log.info("mpc_cleanup_loop_cancelled")
            return
        except Exception as e:
            log.error("mpc_cleanup_error", error=str(e))


async def run_server(app: object, host: str, port: int) -> None:
    """Run uvicorn as an async task."""
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
        timeout_graceful_shutdown=10,
        timeout_keep_alive=65,
    )
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
        private_key=config.base_validator_private_key,
        chain_id=config.base_chain_id,
    )

    # Initialize Bittensor neuron
    neuron = DjinnValidator(
        netuid=config.bt_netuid,
        network=config.bt_network,
        wallet_name=config.bt_wallet_name,
        hotkey_name=config.bt_wallet_hotkey,
        axon_port=config.api_port,
        external_ip=config.external_ip or None,
        external_port=config.external_port or None,
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
        rate_limit_capacity=config.rate_limit_capacity,
        rate_limit_rate=config.rate_limit_rate,
        mpc_availability_timeout=config.mpc_availability_timeout,
        shares_threshold=config.shares_threshold,
    )

    log.info(
        "validator_starting",
        version=__version__,
        host=config.api_host,
        port=config.api_port,
        netuid=config.bt_netuid,
        bt_network=config.bt_network,
        bt_connected=bt_ok,
        rpc_url=_sanitize_url(config.base_rpc_url),
        shares_held=share_store.count,
        settlement_enabled=chain_client.can_write,
        settlement_address=chain_client.validator_address or "none",
        log_format=os.getenv("LOG_FORMAT", "console"),
    )

    # Run API server, epoch loop, and MPC cleanup concurrently
    running_tasks = [
        asyncio.create_task(run_server(app, config.api_host, config.api_port)),
        asyncio.create_task(mpc_cleanup_loop(mpc_coordinator)),
    ]
    if bt_ok:
        running_tasks.append(asyncio.create_task(
            epoch_loop(neuron, scorer, share_store, outcome_attestor, chain_client)
        ))

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
    try:
        await asyncio.wait_for(
            asyncio.gather(*running_tasks, return_exceptions=True),
            timeout=15.0,
        )
    except TimeoutError:
        log.warning("shutdown_timeout", msg="Tasks did not finish within 15s")
    try:
        await outcome_attestor.close()
    except Exception as e:
        log.warning("outcome_attestor_close_error", error=str(e))
    try:
        await chain_client.close()
    except Exception as e:
        log.warning("chain_client_close_error", error=str(e))
    try:
        removed = mpc_coordinator.cleanup_expired()
        if removed:
            log.info("mpc_sessions_cleaned_on_shutdown", removed=removed)
    except Exception as e:
        log.warning("mpc_cleanup_error", error=str(e))
    try:
        share_store.close()
    except Exception as e:
        log.warning("share_store_close_error", error=str(e))
    log.info("shutdown_complete")


def main() -> None:
    """Start the Djinn validator."""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()

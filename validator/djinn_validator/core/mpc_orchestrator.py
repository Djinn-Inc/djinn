"""MPC orchestration for the purchase flow.

Coordinates the full secure MPC protocol across multiple validators:
1. Discovers peer validators from the Bittensor metagraph
2. Creates an MPC session with Beaver triples
3. Distributes triple shares to peers via HTTP
4. Collects contributions and computes the result
5. Broadcasts the result to all participants

Falls back to single-validator prototype mode when:
- Bittensor is not connected (dev mode)
- Fewer than threshold validators are reachable
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import time
from typing import TYPE_CHECKING, Any

import httpx
import structlog

from djinn_validator.core.mpc import (
    DistributedParticipantState,
    MPCResult,
    _split_secret_at_points,
    check_availability,
    compute_local_contribution,
    reconstruct_at_zero,
    secure_check_availability,
)
from djinn_validator.core.mpc_coordinator import MPCCoordinator, SessionStatus
from djinn_validator.utils.crypto import BN254_PRIME, Share

if TYPE_CHECKING:
    from djinn_validator.bt.neuron import DjinnValidator

log = structlog.get_logger()

# Timeout for inter-validator HTTP calls (configurable via env)
PEER_TIMEOUT = float(os.getenv("MPC_PEER_TIMEOUT", "10.0"))


class MPCOrchestrator:
    """Orchestrates MPC sessions for signal availability checks.

    Used by the purchase endpoint to run the secure MPC protocol
    across multiple validators, falling back to single-validator
    prototype mode when necessary.
    """

    def __init__(
        self,
        coordinator: MPCCoordinator,
        neuron: "DjinnValidator | None" = None,
        threshold: int = 7,
    ) -> None:
        self._coordinator = coordinator
        self._neuron = neuron
        self._threshold = threshold

    def _get_peer_validators(self) -> list[dict[str, Any]]:
        """Discover peer validator addresses from the metagraph.

        Returns list of {uid, hotkey, ip, port} for each validator.
        """
        if self._neuron is None or self._neuron.metagraph is None:
            return []

        peers = []
        metagraph = self._neuron.metagraph
        for uid in range(metagraph.n.item()):
            if not metagraph.validator_permit[uid].item():
                continue
            if uid == self._neuron.uid:
                continue  # Skip ourselves

            axon = metagraph.axons[uid]
            if not axon.ip or axon.ip == "0.0.0.0":
                continue

            peers.append({
                "uid": uid,
                "hotkey": metagraph.hotkeys[uid],
                "ip": axon.ip,
                "port": axon.port,
                "url": f"http://{axon.ip}:{axon.port}",
            })

        return peers

    async def _collect_peer_shares(
        self,
        peers: list[dict[str, Any]],
        signal_id: str,
    ) -> list[Share]:
        """Request shares from peer validators for a signal.

        Each validator holds one Shamir share of the real signal index.
        We need at least `threshold` shares to run the MPC.
        """
        shares = []
        async with httpx.AsyncClient(timeout=PEER_TIMEOUT) as client:
            for peer in peers:
                try:
                    resp = await client.get(
                        f"{peer['url']}/v1/signal/{signal_id}/share_info",
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        shares.append(Share(
                            x=data["share_x"],
                            y=int(data["share_y"], 16),
                        ))
                except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as e:
                    log.warning(
                        "peer_share_request_failed",
                        peer_uid=peer["uid"],
                        error=str(e),
                    )
        return shares

    async def check_availability(
        self,
        signal_id: str,
        local_share: Share,
        available_indices: set[int],
    ) -> MPCResult:
        """Run the MPC availability check.

        Attempts multi-validator secure MPC first.
        Falls back to single-validator prototype if insufficient peers.
        """
        peers = self._get_peer_validators()

        if not peers:
            # Dev mode: single-validator prototype
            log.info(
                "mpc_single_validator_mode",
                signal_id=signal_id,
                reason="no peers discovered",
            )
            return self._single_validator_check(local_share, available_indices)

        # Collect shares from peers
        all_shares = [local_share]

        # In production, we'd collect shares from peers.
        # For the current phase, peers share their share_x coordinates
        # and we use the coordinator to run the protocol with collected data.
        # The full distributed protocol (each validator computes locally and
        # exchanges d,e values) requires the networking round-trips implemented
        # in the /v1/mpc/* endpoints.

        # For now, if we have enough shares locally (e.g., test setup where
        # one validator holds all shares), use secure_check_availability.
        if len(all_shares) >= self._threshold:
            log.info(
                "mpc_secure_mode",
                signal_id=signal_id,
                participants=len(all_shares),
            )
            return secure_check_availability(
                shares=all_shares,
                available_indices=available_indices,
                threshold=self._threshold,
            )

        # Not enough peers — try distributed protocol via HTTP
        result = await self._distributed_mpc(
            signal_id, local_share, available_indices, peers,
        )
        if result is not None:
            return result

        # Final fallback: single-validator mode
        log.warning(
            "mpc_fallback_single_validator",
            signal_id=signal_id,
            reason="distributed MPC failed",
        )
        return self._single_validator_check(local_share, available_indices)

    async def _distributed_mpc(
        self,
        signal_id: str,
        local_share: Share,
        available_indices: set[int],
        peers: list[dict[str, Any]],
    ) -> MPCResult | None:
        """Run the distributed MPC protocol via HTTP.

        Full protocol:
        1. Generate random mask r and split into shares
        2. Create session with Beaver triples
        3. Send /v1/mpc/init to all peers with their triple shares + r shares
        4. For each multiplication gate, collect (d_i, e_i) from all peers
        5. Reconstruct opened d, e and feed into next gate
        6. Open final result and broadcast to peers
        """
        p = BN254_PRIME
        my_x = local_share.x
        sorted_avail = sorted(available_indices)
        n_gates = len(sorted_avail)

        if n_gates == 0:
            return MPCResult(available=False, participating_validators=1)

        raw_xs = [my_x] + [peer["uid"] + 1 for peer in peers]
        participant_xs = sorted(set(x for x in raw_xs if 1 <= x <= 255))

        if len(participant_xs) < self._threshold:
            log.warning(
                "insufficient_mpc_participants",
                available=len(participant_xs),
                threshold=self._threshold,
            )
            return None

        # Generate random mask r (nonzero)
        r = secrets.randbelow(p - 1) + 1
        r_shares = _split_secret_at_points(r, participant_xs, self._threshold, p)
        r_share_map = {s.x: s.y for s in r_shares}

        # Create MPC session with Beaver triples
        session = self._coordinator.create_session(
            signal_id=signal_id,
            available_indices=sorted_avail,
            coordinator_x=my_x,
            participant_xs=participant_xs,
            threshold=self._threshold,
        )

        # Build our own participant state
        my_triples = self._coordinator.get_triple_shares_for_participant(
            session.session_id, my_x,
        )
        if my_triples is None:
            return None

        my_state = DistributedParticipantState(
            validator_x=my_x,
            secret_share_y=local_share.y,
            r_share_y=r_share_map[my_x],
            available_indices=sorted_avail,
            triple_a=[ts["a"] for ts in my_triples],
            triple_b=[ts["b"] for ts in my_triples],
            triple_c=[ts["c"] for ts in my_triples],
        )

        # Distribute session invitations with triple shares + r shares
        accepted_peers: list[dict[str, Any]] = []

        async def _init_peer(
            client: httpx.AsyncClient, peer: dict[str, Any],
        ) -> dict[str, Any] | None:
            peer_x = peer["uid"] + 1
            triple_shares = self._coordinator.get_triple_shares_for_participant(
                session.session_id, peer_x,
            )
            peer_r = r_share_map.get(peer_x)
            if triple_shares is None or peer_r is None:
                return None
            try:
                resp = await client.post(
                    f"{peer['url']}/v1/mpc/init",
                    json={
                        "session_id": session.session_id,
                        "signal_id": signal_id,
                        "available_indices": sorted_avail,
                        "coordinator_x": my_x,
                        "participant_xs": participant_xs,
                        "threshold": self._threshold,
                        "triple_shares": [
                            {k: hex(v) for k, v in ts.items()}
                            for ts in triple_shares
                        ],
                        "r_share_y": hex(peer_r),
                    },
                )
                if resp.status_code == 200 and resp.json().get("accepted"):
                    return peer
            except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as e:
                log.warning(
                    "mpc_init_failed",
                    peer_uid=peer["uid"],
                    error_type=type(e).__name__,
                    error=str(e),
                )
            return None

        async with httpx.AsyncClient(timeout=PEER_TIMEOUT) as client:
            results = await asyncio.gather(
                *(_init_peer(client, peer) for peer in peers),
                return_exceptions=True,
            )
            accepted_peers = [
                r for r in results
                if r is not None and not isinstance(r, BaseException)
            ]

        if len(accepted_peers) + 1 < self._threshold:
            log.warning(
                "mpc_insufficient_accepted",
                accepted=len(accepted_peers) + 1,
                threshold=self._threshold,
            )
            return None

        log.info(
            "mpc_distributed_session",
            session_id=session.session_id,
            accepted_peers=len(accepted_peers),
        )

        # Run per-gate protocol
        active_peers = list(accepted_peers)
        prev_d: int | None = None
        prev_e: int | None = None

        for gate_idx in range(n_gates):
            # Compute our own (d_i, e_i)
            my_d, my_e = my_state.compute_gate(gate_idx, prev_d, prev_e)
            d_vals: dict[int, int] = {my_x: my_d}
            e_vals: dict[int, int] = {my_x: my_e}

            # Collect from peers in parallel
            async def _collect_gate(
                client: httpx.AsyncClient,
                peer: dict[str, Any],
                g_idx: int,
                p_d: int | None,
                p_e: int | None,
            ) -> tuple[int, int, int] | None:
                try:
                    resp = await client.post(
                        f"{peer['url']}/v1/mpc/compute_gate",
                        json={
                            "session_id": session.session_id,
                            "gate_idx": g_idx,
                            "prev_opened_d": hex(p_d) if p_d is not None else None,
                            "prev_opened_e": hex(p_e) if p_e is not None else None,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        peer_x = peer["uid"] + 1
                        return peer_x, int(data["d_value"], 16), int(data["e_value"], 16)
                except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as e:
                    log.warning(
                        "mpc_gate_failed",
                        peer_uid=peer["uid"],
                        gate_idx=g_idx,
                        error_type=type(e).__name__,
                        error=str(e),
                    )
                return None

            async with httpx.AsyncClient(timeout=PEER_TIMEOUT) as client:
                results = await asyncio.gather(
                    *(_collect_gate(client, peer, gate_idx, prev_d, prev_e)
                      for peer in active_peers),
                    return_exceptions=True,
                )

                failed = []
                for i, result in enumerate(results):
                    if result is None or isinstance(result, BaseException):
                        failed.append(active_peers[i])
                    else:
                        peer_x, d_val, e_val = result
                        d_vals[peer_x] = d_val
                        e_vals[peer_x] = e_val

                for fp in failed:
                    active_peers.remove(fp)

            if len(d_vals) < self._threshold:
                log.warning(
                    "mpc_gate_insufficient",
                    gate_idx=gate_idx,
                    remaining=len(d_vals),
                    threshold=self._threshold,
                )
                return None

            # Reconstruct publicly opened d and e
            prev_d = reconstruct_at_zero(d_vals, p)
            prev_e = reconstruct_at_zero(e_vals, p)

        # Compute final output shares z_i for each participant
        z_vals: dict[int, int] = {}
        last = n_gates - 1
        for vx in d_vals:
            ts = self._coordinator.get_triple_shares_for_participant(
                session.session_id, vx,
            )
            if ts is None:
                continue
            z_i = (
                prev_d * prev_e
                + prev_d * ts[last]["b"]
                + prev_e * ts[last]["a"]
                + ts[last]["c"]
            ) % p
            z_vals[vx] = z_i

        # Reconstruct the final result: r * P(s) — zero iff s ∈ available set
        result_value = reconstruct_at_zero(z_vals, p)
        available = result_value == 0

        mpc_result = MPCResult(
            available=available,
            participating_validators=len(z_vals),
        )

        # Update session state
        with self._coordinator._lock:
            session.result = mpc_result
            session.status = SessionStatus.COMPLETE

        log.info(
            "mpc_distributed_result",
            session_id=session.session_id,
            available=available,
            participants=len(z_vals),
            gates=n_gates,
        )

        # Broadcast result to peers
        async with httpx.AsyncClient(timeout=PEER_TIMEOUT) as client:
            for peer in active_peers:
                try:
                    await client.post(
                        f"{peer['url']}/v1/mpc/result",
                        json={
                            "session_id": session.session_id,
                            "signal_id": signal_id,
                            "available": available,
                            "participating_validators": len(z_vals),
                        },
                    )
                except httpx.HTTPError as e:
                    log.warning(
                        "mpc_result_broadcast_failed",
                        peer_uid=peer["uid"],
                        error_type=type(e).__name__,
                        error=str(e),
                    )

        return mpc_result

    def _single_validator_check(
        self,
        share: Share,
        available_indices: set[int],
    ) -> MPCResult:
        """Prototype single-validator availability check.

        The aggregator reconstructs the secret. Used in dev mode.
        """
        all_xs = [share.x]
        contrib = compute_local_contribution(share, all_xs)
        return check_availability([contrib], available_indices, threshold=1)

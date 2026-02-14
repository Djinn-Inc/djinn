"""Outcome attestation — queries sports APIs and builds consensus.

Validators independently query official sports data sources, then
reach 2/3+ consensus before writing outcomes on-chain.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any

import httpx
import structlog

log = structlog.get_logger()


class Outcome(IntEnum):
    """Signal outcome matching the smart contract enum."""

    PENDING = 0
    FAVORABLE = 1
    UNFAVORABLE = 2
    VOID = 3


@dataclass
class EventResult:
    """Result of a sporting event relevant to a signal."""

    event_id: str
    home_score: int | None = None
    away_score: int | None = None
    status: str = "pending"  # pending, final, postponed, cancelled
    raw_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class OutcomeAttestation:
    """A validator's attestation of a signal's outcome."""

    signal_id: str
    validator_hotkey: str
    outcome: Outcome
    event_result: EventResult
    timestamp: float = field(default_factory=time.time)


class OutcomeAttestor:
    """Manages outcome attestation and consensus building."""

    def __init__(self, sports_api_key: str = "") -> None:
        self._api_key = sports_api_key
        self._client = httpx.AsyncClient(timeout=30.0)
        self._attestations: dict[str, list[OutcomeAttestation]] = {}

    async def fetch_event_result(self, event_id: str, sport: str = "basketball_nba") -> EventResult:
        """Fetch event result from sports data API.

        Uses The Odds API for event scores. In production, multiple
        sources would be queried for cross-validation.
        """
        if not self._api_key:
            log.warning("no_sports_api_key", event_id=event_id)
            return EventResult(event_id=event_id, status="pending")

        try:
            url = f"https://api.the-odds-api.com/v4/sports/{sport}/scores"
            params = {
                "apiKey": self._api_key,
                "eventIds": event_id,
            }
            resp = await self._client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            if not data:
                return EventResult(event_id=event_id, status="pending")

            event = data[0]
            if not event.get("completed"):
                return EventResult(
                    event_id=event_id,
                    status="pending",
                    raw_data=event,
                )

            scores = event.get("scores", [])
            home_score = None
            away_score = None
            for s in scores:
                if s.get("name") == event.get("home_team"):
                    home_score = int(s["score"])
                elif s.get("name") == event.get("away_team"):
                    away_score = int(s["score"])

            return EventResult(
                event_id=event_id,
                home_score=home_score,
                away_score=away_score,
                status="final",
                raw_data=event,
            )

        except httpx.HTTPError as e:
            log.error("sports_api_error", event_id=event_id, error=str(e))
            return EventResult(event_id=event_id, status="error")

    def attest(
        self,
        signal_id: str,
        validator_hotkey: str,
        outcome: Outcome,
        event_result: EventResult,
    ) -> OutcomeAttestation:
        """Record this validator's outcome attestation."""
        attestation = OutcomeAttestation(
            signal_id=signal_id,
            validator_hotkey=validator_hotkey,
            outcome=outcome,
            event_result=event_result,
        )

        if signal_id not in self._attestations:
            self._attestations[signal_id] = []
        self._attestations[signal_id].append(attestation)

        log.info(
            "outcome_attested",
            signal_id=signal_id,
            outcome=outcome.name,
        )
        return attestation

    def check_consensus(
        self,
        signal_id: str,
        total_validators: int,
        quorum: float = 2 / 3,
    ) -> Outcome | None:
        """Check if 2/3+ consensus has been reached for a signal.

        Returns the consensus outcome, or None if not yet reached.
        """
        attestations = self._attestations.get(signal_id, [])
        if not attestations:
            return None

        threshold = int(total_validators * quorum) + 1

        # Count votes per outcome
        votes: dict[Outcome, int] = {}
        for a in attestations:
            votes[a.outcome] = votes.get(a.outcome, 0) + 1

        for outcome, count in votes.items():
            if count >= threshold:
                log.info(
                    "consensus_reached",
                    signal_id=signal_id,
                    outcome=outcome.name,
                    votes=count,
                    threshold=threshold,
                )
                return outcome

        return None

    async def close(self) -> None:
        await self._client.aclose()

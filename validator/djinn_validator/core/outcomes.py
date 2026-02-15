"""Outcome attestation — queries sports APIs and builds consensus.

Validators independently query official sports data sources, then
reach 2/3+ consensus before writing outcomes on-chain.

Outcome determination logic:
- SPREADS: Team must cover the spread (score diff > spread for favorites,
           or lose by fewer than spread for underdogs). Push = VOID.
- TOTALS:  Combined score must be over/under the total. Push = VOID.
- H2H:     Selected team must win outright. Tie = VOID.
"""

from __future__ import annotations

import re
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
    home_team: str = ""
    away_team: str = ""
    home_score: int | None = None
    away_score: int | None = None
    status: str = "pending"  # pending, final, postponed, cancelled
    raw_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedPick:
    """A structured representation of a signal pick string.

    Examples:
        "Lakers -3.5 (-110)"  → market=spreads, team=Lakers, line=-3.5
        "Over 218.5 (-110)"   → market=totals, side=Over, line=218.5
        "Celtics ML (-150)"   → market=h2h, team=Celtics
    """

    market: str  # "spreads", "totals", "h2h"
    team: str = ""  # Team name (for spreads/h2h)
    side: str = ""  # "Over"/"Under" (for totals)
    line: float | None = None  # Spread or total line
    odds: int | None = None  # American odds (informational only)


@dataclass
class SignalMetadata:
    """Metadata for a purchased signal, used for outcome resolution."""

    signal_id: str
    sport: str  # The Odds API sport key, e.g., "basketball_nba"
    event_id: str  # The Odds API event ID
    home_team: str
    away_team: str
    pick: ParsedPick
    purchased_at: float = field(default_factory=time.time)
    resolved: bool = False


@dataclass
class OutcomeAttestation:
    """A validator's attestation of a signal's outcome."""

    signal_id: str
    validator_hotkey: str
    outcome: Outcome
    event_result: EventResult
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Pick Parsing
# ---------------------------------------------------------------------------

# Regex patterns for different pick formats
_SPREAD_RE = re.compile(
    r"^(.+?)\s+([+-]?\d+(?:\.\d+)?)\s*\(([+-]?\d+)\)$"
)
_TOTAL_RE = re.compile(
    r"^(Over|Under)\s+(\d+(?:\.\d+)?)\s*\(([+-]?\d+)\)$", re.IGNORECASE
)
_ML_RE = re.compile(
    r"^(.+?)\s+ML\s*\(([+-]?\d+)\)$", re.IGNORECASE
)


def parse_pick(pick_str: str) -> ParsedPick:
    """Parse a pick string into structured data.

    Supports formats:
        "Lakers -3.5 (-110)"   → spreads
        "Over 218.5 (-110)"    → totals
        "Under 218.5 (-110)"   → totals
        "Celtics ML (-150)"    → h2h (moneyline)
    """
    pick_str = pick_str.strip()

    # Try totals first (Over/Under)
    m = _TOTAL_RE.match(pick_str)
    if m:
        return ParsedPick(
            market="totals",
            side=m.group(1).capitalize(),
            line=float(m.group(2)),
            odds=int(m.group(3)),
        )

    # Try moneyline
    m = _ML_RE.match(pick_str)
    if m:
        return ParsedPick(
            market="h2h",
            team=m.group(1).strip(),
            odds=int(m.group(2)),
        )

    # Try spread (most common)
    m = _SPREAD_RE.match(pick_str)
    if m:
        return ParsedPick(
            market="spreads",
            team=m.group(1).strip(),
            line=float(m.group(2)),
            odds=int(m.group(3)),
        )

    # Fallback: treat as moneyline without explicit ML tag
    return ParsedPick(market="h2h", team=pick_str)


# ---------------------------------------------------------------------------
# Outcome Determination
# ---------------------------------------------------------------------------


def determine_outcome(
    pick: ParsedPick,
    result: EventResult,
    home_team: str,
    away_team: str,
) -> Outcome:
    """Determine signal outcome from pick + game result.

    Returns VOID for postponed/cancelled games or pushes (exact line hit).
    """
    if result.status in ("postponed", "cancelled"):
        return Outcome.VOID

    if result.status != "final":
        return Outcome.PENDING

    if result.home_score is None or result.away_score is None:
        return Outcome.PENDING

    home = result.home_score
    away = result.away_score

    if pick.market == "spreads":
        return _determine_spread(pick, home, away, home_team, away_team)
    elif pick.market == "totals":
        return _determine_total(pick, home, away)
    elif pick.market == "h2h":
        return _determine_h2h(pick, home, away, home_team, away_team)

    return Outcome.PENDING


def _determine_spread(
    pick: ParsedPick,
    home: int,
    away: int,
    home_team: str,
    away_team: str,
) -> Outcome:
    """Spreads: team + spread vs opponent score."""
    if pick.line is None:
        return Outcome.VOID

    # Determine which team was picked
    is_home = _team_matches(pick.team, home_team)
    is_away = _team_matches(pick.team, away_team)

    if not is_home and not is_away:
        log.warning("team_not_found", pick_team=pick.team, home=home_team, away=away_team)
        return Outcome.VOID

    if is_home:
        adjusted = home + pick.line
        diff = adjusted - away
    else:
        adjusted = away + pick.line
        diff = adjusted - home

    if diff == 0:
        return Outcome.VOID  # Push
    return Outcome.FAVORABLE if diff > 0 else Outcome.UNFAVORABLE


def _determine_total(pick: ParsedPick, home: int, away: int) -> Outcome:
    """Totals: combined score over/under the line."""
    if pick.line is None:
        return Outcome.VOID

    total = home + away

    if total == pick.line:
        return Outcome.VOID  # Push

    if pick.side == "Over":
        return Outcome.FAVORABLE if total > pick.line else Outcome.UNFAVORABLE
    else:
        return Outcome.FAVORABLE if total < pick.line else Outcome.UNFAVORABLE


def _determine_h2h(
    pick: ParsedPick,
    home: int,
    away: int,
    home_team: str,
    away_team: str,
) -> Outcome:
    """Head-to-head (moneyline): picked team must win outright."""
    if home == away:
        return Outcome.VOID  # Tie

    is_home = _team_matches(pick.team, home_team)
    is_away = _team_matches(pick.team, away_team)

    if not is_home and not is_away:
        log.warning("team_not_found", pick_team=pick.team, home=home_team, away=away_team)
        return Outcome.VOID

    if is_home:
        return Outcome.FAVORABLE if home > away else Outcome.UNFAVORABLE
    else:
        return Outcome.FAVORABLE if away > home else Outcome.UNFAVORABLE


def _team_matches(pick_team: str, full_name: str) -> bool:
    """Fuzzy match: pick might use city or mascot, full_name is "City Mascot"."""
    pick_lower = pick_team.lower()
    full_lower = full_name.lower()
    # Exact match
    if pick_lower == full_lower:
        return True
    # Pick is a substring (e.g., "Lakers" in "Los Angeles Lakers")
    if pick_lower in full_lower:
        return True
    # Full name ends with pick (mascot match)
    if full_lower.endswith(pick_lower):
        return True
    return False


# ---------------------------------------------------------------------------
# OutcomeAttestor
# ---------------------------------------------------------------------------


class OutcomeAttestor:
    """Manages outcome attestation and consensus building."""

    def __init__(self, sports_api_key: str = "") -> None:
        self._api_key = sports_api_key
        self._client = httpx.AsyncClient(timeout=30.0)
        self._attestations: dict[str, list[OutcomeAttestation]] = {}
        self._pending_signals: dict[str, SignalMetadata] = {}

    def register_signal(self, metadata: SignalMetadata) -> None:
        """Register a purchased signal for outcome tracking."""
        self._pending_signals[metadata.signal_id] = metadata
        log.info(
            "signal_registered_for_outcome",
            signal_id=metadata.signal_id,
            sport=metadata.sport,
            event_id=metadata.event_id,
            market=metadata.pick.market,
        )

    def get_pending_signals(self) -> list[SignalMetadata]:
        """Return all unresolved signals."""
        return [s for s in self._pending_signals.values() if not s.resolved]

    async def fetch_event_result(self, event_id: str, sport: str = "basketball_nba") -> EventResult:
        """Fetch event result from The Odds API scores endpoint."""
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
            home_team = event.get("home_team", "")
            away_team = event.get("away_team", "")

            if not event.get("completed"):
                return EventResult(
                    event_id=event_id,
                    home_team=home_team,
                    away_team=away_team,
                    status="pending",
                    raw_data=event,
                )

            scores = event.get("scores", [])
            home_score = None
            away_score = None
            for s in scores:
                try:
                    score_val = int(s.get("score", ""))
                except (ValueError, TypeError):
                    continue
                if s.get("name") == home_team:
                    home_score = score_val
                elif s.get("name") == away_team:
                    away_score = score_val

            return EventResult(
                event_id=event_id,
                home_team=home_team,
                away_team=away_team,
                home_score=home_score,
                away_score=away_score,
                status="final",
                raw_data=event,
            )

        except httpx.HTTPError as e:
            log.error("sports_api_error", event_id=event_id, error=str(e))
            return EventResult(event_id=event_id, status="error")

    async def resolve_signal(
        self,
        signal_id: str,
        validator_hotkey: str,
    ) -> OutcomeAttestation | None:
        """Fetch scores and determine outcome for a registered signal.

        Returns the attestation if the game is complete, None if still pending.
        """
        meta = self._pending_signals.get(signal_id)
        if meta is None:
            log.warning("signal_not_registered", signal_id=signal_id)
            return None

        if meta.resolved:
            return None

        result = await self.fetch_event_result(meta.event_id, meta.sport)

        if result.status not in ("final", "postponed", "cancelled"):
            return None

        outcome = determine_outcome(
            meta.pick,
            result,
            meta.home_team,
            meta.away_team,
        )

        if outcome == Outcome.PENDING:
            return None

        meta.resolved = True
        return self.attest(signal_id, validator_hotkey, outcome, result)

    async def resolve_all_pending(self, validator_hotkey: str) -> list[OutcomeAttestation]:
        """Check all pending signals and resolve any with completed games."""
        resolved = []
        for meta in self.get_pending_signals():
            attestation = await self.resolve_signal(meta.signal_id, validator_hotkey)
            if attestation is not None:
                resolved.append(attestation)
        return resolved

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

        if total_validators <= 0:
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

    def cleanup_resolved(self, max_age_seconds: float = 86400) -> int:
        """Remove resolved signals and old attestations to prevent memory growth.

        Removes signals resolved more than max_age_seconds ago (default: 24h).
        Returns count of removed entries.
        """
        now = time.time()
        removed = 0

        # Clean resolved signals older than max_age
        stale_ids = [
            sid for sid, meta in self._pending_signals.items()
            if meta.resolved and now - meta.purchased_at > max_age_seconds
        ]
        for sid in stale_ids:
            del self._pending_signals[sid]
            self._attestations.pop(sid, None)
            removed += 1

        if removed:
            log.info("outcomes_cleaned", removed=removed)

        return removed

    async def close(self) -> None:
        await self._client.aclose()

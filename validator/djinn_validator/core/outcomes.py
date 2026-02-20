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

import asyncio
import math
import random
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
    purchased_at: float = field(default_factory=time.monotonic)
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

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-:.]{1,256}$")

# Supported sport keys from The Odds API.
# Prevents arbitrary path injection into the API URL.
SUPPORTED_SPORTS: frozenset[str] = frozenset(
    {
        "americanfootball_nfl",
        "americanfootball_ncaaf",
        "basketball_nba",
        "basketball_ncaab",
        "baseball_mlb",
        "icehockey_nhl",
        "soccer_epl",
        "soccer_usa_mls",
        "soccer_spain_la_liga",
        "soccer_germany_bundesliga",
        "soccer_italy_serie_a",
        "soccer_france_ligue_one",
        "soccer_uefa_champs_league",
        "mma_mixed_martial_arts",
        "tennis_atp_aus_open",
        "tennis_atp_us_open",
        "tennis_atp_wimbledon",
        "tennis_atp_french_open",
    }
)

# Regex patterns for different pick formats
_SPREAD_RE = re.compile(r"^(.+?)\s+([+-]?\d+(?:\.\d+)?)\s*\(([+-]?\d+)\)$")
_TOTAL_RE = re.compile(r"^(Over|Under)\s+(\d+(?:\.\d+)?)\s*\(([+-]?\d+)\)$", re.IGNORECASE)
_ML_RE = re.compile(r"^(.+?)\s+ML\s*\(([+-]?\d+)\)$", re.IGNORECASE)


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
    if is_home and is_away:
        log.warning("ambiguous_team_match", pick_team=pick.team, home=home_team, away=away_team)
        return Outcome.VOID

    if is_home:
        adjusted = home + pick.line
        diff = adjusted - away
    else:
        adjusted = away + pick.line
        diff = adjusted - home

    if abs(diff) < 1e-9:
        return Outcome.VOID  # Push
    return Outcome.FAVORABLE if diff > 0 else Outcome.UNFAVORABLE


def _determine_total(pick: ParsedPick, home: int, away: int) -> Outcome:
    """Totals: combined score over/under the line."""
    if pick.line is None:
        return Outcome.VOID

    total = home + away

    if abs(total - pick.line) < 1e-9:
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
    if is_home and is_away:
        log.warning("ambiguous_team_match", pick_team=pick.team, home=home_team, away=away_team)
        return Outcome.VOID

    if is_home:
        return Outcome.FAVORABLE if home > away else Outcome.UNFAVORABLE
    else:
        return Outcome.FAVORABLE if away > home else Outcome.UNFAVORABLE


def _team_matches(pick_team: str, full_name: str) -> bool:
    """Word-boundary match: pick might use city or mascot, full_name is "City Mascot"."""
    pick_lower = pick_team.lower()
    full_lower = full_name.lower()
    # Exact match
    if pick_lower == full_lower:
        return True
    # Word-boundary match (e.g., "Lakers" matches "Los Angeles Lakers")
    words = full_lower.split()
    if pick_lower in words:
        return True
    # Multi-word pick (e.g., "Kansas City" in "Kansas City Chiefs")
    if len(pick_lower.split()) > 1 and full_lower.startswith(pick_lower + " "):
        return True
    return False


# ---------------------------------------------------------------------------
# OutcomeAttestor
# ---------------------------------------------------------------------------


class OutcomeAttestor:
    """Manages outcome attestation and consensus building."""

    MAX_PENDING_SIGNALS = 10_000
    MAX_ATTESTATIONS_PER_SIGNAL = 100
    CIRCUIT_BREAKER_THRESHOLD = 5  # Open circuit after this many consecutive failures
    CIRCUIT_BREAKER_RESET_SECONDS = 60.0  # Wait this long before retrying after circuit opens

    def __init__(self, sports_api_key: str = "") -> None:
        self._api_key = sports_api_key
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        self._client = httpx.AsyncClient(timeout=30.0, limits=limits)
        self._attestations: dict[str, list[OutcomeAttestation]] = {}
        self._pending_signals: dict[str, SignalMetadata] = {}
        self._lock = asyncio.Lock()
        self._consecutive_api_failures = 0
        self._circuit_opened_at: float | None = None  # monotonic timestamp

    def register_signal(self, metadata: SignalMetadata) -> None:
        """Register a purchased signal for outcome tracking."""
        if len(self._pending_signals) >= self.MAX_PENDING_SIGNALS:
            # Synchronous eviction of already-resolved signals at capacity
            now = time.monotonic()
            stale = [
                sid for sid, m in list(self._pending_signals.items())
                if m.resolved and now - m.purchased_at > 3600
            ]
            for sid in stale:
                del self._pending_signals[sid]
                self._attestations.pop(sid, None)
            if not stale:
                log.warning("pending_signals_at_capacity", max=self.MAX_PENDING_SIGNALS)
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

    def _is_circuit_open(self) -> bool:
        """Check if the circuit breaker is open (API calls should be skipped)."""
        if self._consecutive_api_failures < self.CIRCUIT_BREAKER_THRESHOLD:
            return False
        if self._circuit_opened_at is None:
            return False
        elapsed = time.monotonic() - self._circuit_opened_at
        if elapsed >= self.CIRCUIT_BREAKER_RESET_SECONDS:
            # Half-open: allow one attempt to see if API recovered
            return False
        return True

    def _record_api_success(self) -> None:
        """Reset circuit breaker on successful API call."""
        self._consecutive_api_failures = 0
        self._circuit_opened_at = None

    def _record_api_failure(self) -> None:
        """Track API failure and open circuit if threshold reached."""
        self._consecutive_api_failures += 1
        if self._consecutive_api_failures >= self.CIRCUIT_BREAKER_THRESHOLD:
            if self._circuit_opened_at is None:
                self._circuit_opened_at = time.monotonic()
                log.warning(
                    "sports_api_circuit_opened",
                    consecutive_failures=self._consecutive_api_failures,
                    reset_after_s=self.CIRCUIT_BREAKER_RESET_SECONDS,
                )

    async def fetch_event_result(self, event_id: str, sport: str = "basketball_nba") -> EventResult:
        """Fetch event result from The Odds API scores endpoint."""
        if not _SAFE_ID_RE.match(event_id):
            log.warning("invalid_event_id", event_id=event_id[:50])
            return EventResult(event_id=event_id, status="error")
        if sport not in SUPPORTED_SPORTS:
            log.warning("unsupported_sport_key", sport=sport[:50])
            return EventResult(event_id=event_id, status="error")
        if not self._api_key:
            log.warning("no_sports_api_key", event_id=event_id)
            return EventResult(event_id=event_id, status="pending")

        # Circuit breaker: skip API call if too many recent failures
        if self._is_circuit_open():
            log.debug("sports_api_circuit_open", event_id=event_id)
            return EventResult(event_id=event_id, status="pending")

        url = f"https://api.the-odds-api.com/v4/sports/{sport}/scores"
        params = {
            "apiKey": self._api_key,
            "eventIds": event_id,
        }

        last_error: Exception = Exception("all retries exhausted")
        for attempt in range(3):
            try:
                resp = await self._client.get(url, params=params)
                if resp.status_code >= 500:
                    log.warning(
                        "sports_api_server_error",
                        event_id=event_id,
                        status=resp.status_code,
                        attempt=attempt + 1,
                    )
                    if attempt < 2:
                        base = 1.0 * (attempt + 1)
                        await asyncio.sleep(base * (0.5 + random.random()))
                        continue
                    self._record_api_failure()
                    return EventResult(event_id=event_id, status="error")
                if resp.status_code >= 400:
                    log.error(
                        "sports_api_client_error",
                        event_id=event_id,
                        status=resp.status_code,
                    )
                    # 4xx errors don't count as infrastructure failure
                    return EventResult(event_id=event_id, status="error")
                data = resp.json()
                self._record_api_success()
                break
            except httpx.HTTPError as e:
                last_error = e
                log.warning(
                    "sports_api_network_error",
                    event_id=event_id,
                    error_type=type(e).__name__,
                    error=str(e),
                    attempt=attempt + 1,
                )
                if attempt < 2:
                    base = 1.0 * (attempt + 1)
                    await asyncio.sleep(base * (0.5 + random.random()))
                    continue
                self._record_api_failure()
                return EventResult(event_id=event_id, status="error")
        else:
            log.error("sports_api_exhausted_retries", event_id=event_id, error=str(last_error))
            self._record_api_failure()
            return EventResult(event_id=event_id, status="error")

        try:
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

        except (ValueError, KeyError, IndexError) as e:
            log.error("sports_api_parse_error", event_id=event_id, error=str(e))
            return EventResult(event_id=event_id, status="error")

    async def resolve_signal(
        self,
        signal_id: str,
        validator_hotkey: str,
    ) -> OutcomeAttestation | None:
        """Fetch scores and determine outcome for a registered signal.

        Returns the attestation if the game is complete, None if still pending.
        Uses a lock to prevent concurrent resolve_signal calls from
        double-resolving the same signal.
        """
        async with self._lock:
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

        async with self._lock:
            if meta.resolved:
                return None  # Another coroutine resolved it while we were fetching
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
        # Check for duplicate attestation from same validator
        existing = self._attestations.get(signal_id, [])
        for att in existing:
            if att.validator_hotkey == validator_hotkey:
                log.warning(
                    "duplicate_attestation_skipped",
                    signal_id=signal_id,
                    validator_hotkey=validator_hotkey,
                    existing_outcome=att.outcome.name,
                )
                return att

        attestation = OutcomeAttestation(
            signal_id=signal_id,
            validator_hotkey=validator_hotkey,
            outcome=outcome,
            event_result=event_result,
        )

        if signal_id not in self._attestations:
            self._attestations[signal_id] = []
        if len(self._attestations[signal_id]) < self.MAX_ATTESTATIONS_PER_SIGNAL:
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

        # ≥ 2/3 quorum: ceil ensures we round up for non-integer products.
        # Previous formula (int(x) + 1) was off-by-one when total_validators
        # * quorum was exact (e.g. 3 * 2/3 = 2 → required 3/3 instead of 2/3).
        threshold = math.ceil(total_validators * quorum)

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

    async def cleanup_resolved(self, max_age_seconds: float = 86400) -> int:
        """Remove resolved signals and old attestations to prevent memory growth.

        Removes signals resolved more than max_age_seconds ago (default: 24h).
        Returns count of removed entries.  Protected by the same lock as
        resolve_signal to prevent TOCTOU races.
        """
        async with self._lock:
            now = time.monotonic()
            removed = 0

            stale_ids = [
                sid
                for sid, meta in list(self._pending_signals.items())
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
        try:
            await asyncio.wait_for(self._client.aclose(), timeout=5.0)
        except TimeoutError:
            log.warning("outcome_attestor_close_timeout")
        except Exception as e:
            log.warning("outcome_attestor_close_error", error=str(e))

"""Tests for outcome attestation — pick parsing, outcome determination, and resolution."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from djinn_validator.core.outcomes import (
    SUPPORTED_SPORTS,
    EventResult,
    Outcome,
    OutcomeAttestor,
    ParsedPick,
    SignalMetadata,
    _team_matches,
    determine_outcome,
    parse_pick,
)


# ---------------------------------------------------------------------------
# Pick Parsing
# ---------------------------------------------------------------------------


class TestParsePick:
    def test_spread_favorite(self) -> None:
        pick = parse_pick("Lakers -3.5 (-110)")
        assert pick.market == "spreads"
        assert pick.team == "Lakers"
        assert pick.line == -3.5
        assert pick.odds == -110

    def test_spread_underdog(self) -> None:
        pick = parse_pick("Celtics +5.5 (-110)")
        assert pick.market == "spreads"
        assert pick.team == "Celtics"
        assert pick.line == 5.5
        assert pick.odds == -110

    def test_spread_pk(self) -> None:
        pick = parse_pick("Warriors 0 (-105)")
        assert pick.market == "spreads"
        assert pick.team == "Warriors"
        assert pick.line == 0.0

    def test_total_over(self) -> None:
        pick = parse_pick("Over 218.5 (-110)")
        assert pick.market == "totals"
        assert pick.side == "Over"
        assert pick.line == 218.5
        assert pick.odds == -110

    def test_total_under(self) -> None:
        pick = parse_pick("Under 210.0 (-115)")
        assert pick.market == "totals"
        assert pick.side == "Under"
        assert pick.line == 210.0
        assert pick.odds == -115

    def test_moneyline(self) -> None:
        pick = parse_pick("Celtics ML (-150)")
        assert pick.market == "h2h"
        assert pick.team == "Celtics"
        assert pick.odds == -150

    def test_moneyline_plus(self) -> None:
        pick = parse_pick("Knicks ML (+200)")
        assert pick.market == "h2h"
        assert pick.team == "Knicks"
        assert pick.odds == 200

    def test_fallback_unknown_format(self) -> None:
        pick = parse_pick("Some Weird Pick")
        assert pick.market == "h2h"
        assert pick.team == "Some Weird Pick"


# ---------------------------------------------------------------------------
# Team Matching
# ---------------------------------------------------------------------------


class TestTeamMatches:
    def test_exact_match(self) -> None:
        assert _team_matches("Los Angeles Lakers", "Los Angeles Lakers")

    def test_mascot_match(self) -> None:
        assert _team_matches("Lakers", "Los Angeles Lakers")

    def test_city_match(self) -> None:
        assert _team_matches("Los Angeles", "Los Angeles Lakers")

    def test_no_match(self) -> None:
        assert not _team_matches("Celtics", "Los Angeles Lakers")

    def test_case_insensitive(self) -> None:
        assert _team_matches("lakers", "Los Angeles Lakers")


# ---------------------------------------------------------------------------
# Outcome Determination — Spreads
# ---------------------------------------------------------------------------


class TestDetermineSpread:
    def _result(self, home: int, away: int) -> EventResult:
        return EventResult(
            event_id="test", home_score=home, away_score=away, status="final"
        )

    def test_favorite_covers(self) -> None:
        pick = ParsedPick(market="spreads", team="Lakers", line=-3.5, odds=-110)
        # Lakers 110, Celtics 105 → Lakers won by 5, covers -3.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_favorite_fails_to_cover(self) -> None:
        pick = ParsedPick(market="spreads", team="Lakers", line=-7.5, odds=-110)
        # Lakers 110, Celtics 105 → Lakers won by 5, doesn't cover -7.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.UNFAVORABLE

    def test_underdog_covers(self) -> None:
        pick = ParsedPick(market="spreads", team="Celtics", line=5.5, odds=-110)
        # Lakers 110, Celtics 105 → Celtics lost by 5, covered +5.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_underdog_fails(self) -> None:
        pick = ParsedPick(market="spreads", team="Celtics", line=3.5, odds=-110)
        # Lakers 110, Celtics 105 → Celtics lost by 5, didn't cover +3.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.UNFAVORABLE

    def test_push(self) -> None:
        pick = ParsedPick(market="spreads", team="Lakers", line=-5.0, odds=-110)
        # Lakers 110, Celtics 105 → won by exactly 5, push
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.VOID

    def test_away_team_spread(self) -> None:
        pick = ParsedPick(market="spreads", team="Celtics", line=-2.0, odds=-110)
        # Lakers 100, Celtics 105 → Celtics won by 5, covers -2.0
        result = determine_outcome(pick, self._result(100, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE


# ---------------------------------------------------------------------------
# Outcome Determination — Totals
# ---------------------------------------------------------------------------


class TestDetermineTotal:
    def _result(self, home: int, away: int) -> EventResult:
        return EventResult(
            event_id="test", home_score=home, away_score=away, status="final"
        )

    def test_over_hits(self) -> None:
        pick = ParsedPick(market="totals", side="Over", line=210.5, odds=-110)
        # 110 + 105 = 215 > 210.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_over_misses(self) -> None:
        pick = ParsedPick(market="totals", side="Over", line=220.5, odds=-110)
        # 110 + 105 = 215 < 220.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.UNFAVORABLE

    def test_under_hits(self) -> None:
        pick = ParsedPick(market="totals", side="Under", line=220.5, odds=-110)
        # 110 + 105 = 215 < 220.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_under_misses(self) -> None:
        pick = ParsedPick(market="totals", side="Under", line=210.5, odds=-110)
        # 110 + 105 = 215 > 210.5
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.UNFAVORABLE

    def test_push(self) -> None:
        pick = ParsedPick(market="totals", side="Over", line=215.0, odds=-110)
        # 110 + 105 = 215 == 215.0
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.VOID


# ---------------------------------------------------------------------------
# Outcome Determination — H2H
# ---------------------------------------------------------------------------


class TestDetermineH2H:
    def _result(self, home: int, away: int) -> EventResult:
        return EventResult(
            event_id="test", home_score=home, away_score=away, status="final"
        )

    def test_home_win_pick_home(self) -> None:
        pick = ParsedPick(market="h2h", team="Lakers", odds=-150)
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_home_win_pick_away(self) -> None:
        pick = ParsedPick(market="h2h", team="Celtics", odds=200)
        result = determine_outcome(pick, self._result(110, 105), "Lakers", "Celtics")
        assert result == Outcome.UNFAVORABLE

    def test_away_win_pick_away(self) -> None:
        pick = ParsedPick(market="h2h", team="Celtics", odds=-130)
        result = determine_outcome(pick, self._result(100, 105), "Lakers", "Celtics")
        assert result == Outcome.FAVORABLE

    def test_tie(self) -> None:
        pick = ParsedPick(market="h2h", team="Lakers", odds=-110)
        result = determine_outcome(pick, self._result(105, 105), "Lakers", "Celtics")
        assert result == Outcome.VOID


# ---------------------------------------------------------------------------
# Edge Cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_postponed_game(self) -> None:
        pick = ParsedPick(market="spreads", team="Lakers", line=-3.5, odds=-110)
        result = EventResult(event_id="test", status="postponed")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.VOID

    def test_cancelled_game(self) -> None:
        pick = ParsedPick(market="h2h", team="Lakers", odds=-110)
        result = EventResult(event_id="test", status="cancelled")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.VOID

    def test_pending_game(self) -> None:
        pick = ParsedPick(market="h2h", team="Lakers", odds=-110)
        result = EventResult(event_id="test", status="pending")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.PENDING

    def test_team_not_found(self) -> None:
        pick = ParsedPick(market="spreads", team="76ers", line=-3.5, odds=-110)
        result = EventResult(
            event_id="test", home_score=110, away_score=105, status="final"
        )
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.VOID

    def test_missing_scores(self) -> None:
        pick = ParsedPick(market="h2h", team="Lakers", odds=-110)
        result = EventResult(event_id="test", status="final")  # no scores
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.PENDING

    def test_spread_none_line(self) -> None:
        """Spread with no line should return VOID."""
        pick = ParsedPick(market="spreads", team="Lakers", line=None, odds=-110)
        result = EventResult(event_id="test", home_score=110, away_score=105, status="final")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.VOID

    def test_total_none_line(self) -> None:
        """Total with no line should return VOID."""
        pick = ParsedPick(market="totals", side="Over", line=None, odds=-110)
        result = EventResult(event_id="test", home_score=110, away_score=105, status="final")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.VOID

    def test_unknown_market(self) -> None:
        """Unknown market type returns PENDING."""
        pick = ParsedPick(market="unknown", team="Lakers")
        result = EventResult(event_id="test", home_score=110, away_score=105, status="final")
        assert determine_outcome(pick, result, "Lakers", "Celtics") == Outcome.PENDING


# ---------------------------------------------------------------------------
# OutcomeAttestor
# ---------------------------------------------------------------------------


class TestOutcomeAttestor:
    def test_register_and_get_pending(self) -> None:
        attestor = OutcomeAttestor()
        meta = SignalMetadata(
            signal_id="sig1",
            sport="basketball_nba",
            event_id="evt1",
            home_team="Lakers",
            away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
        )
        attestor.register_signal(meta)
        pending = attestor.get_pending_signals()
        assert len(pending) == 1
        assert pending[0].signal_id == "sig1"

    def test_attest_and_consensus(self) -> None:
        attestor = OutcomeAttestor()
        result = EventResult(
            event_id="evt1", home_score=110, away_score=105, status="final"
        )

        # 3 validators, ≥2/3 quorum → threshold = ceil(3*2/3) = 2
        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 3) is None  # 1 < 2

        attestor.attest("sig1", "v2", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 3) == Outcome.FAVORABLE  # 2 >= 2

    def test_consensus_zero_validators(self) -> None:
        attestor = OutcomeAttestor()
        result = EventResult(
            event_id="evt1", home_score=110, away_score=105, status="final"
        )
        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        # Zero validators — should return None, not crash
        assert attestor.check_consensus("sig1", 0) is None

    def test_consensus_disagreement(self) -> None:
        attestor = OutcomeAttestor()
        result = EventResult(
            event_id="evt1", home_score=110, away_score=105, status="final"
        )

        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        attestor.attest("sig1", "v2", Outcome.UNFAVORABLE, result)
        attestor.attest("sig1", "v3", Outcome.FAVORABLE, result)
        # 2 favorable, 1 unfavorable — threshold for 3 is 2, so consensus reached
        assert attestor.check_consensus("sig1", 3) == Outcome.FAVORABLE

    @pytest.mark.asyncio
    async def test_resolve_signal_pending(self) -> None:
        attestor = OutcomeAttestor()  # No API key → returns pending
        meta = SignalMetadata(
            signal_id="sig1",
            sport="basketball_nba",
            event_id="evt1",
            home_team="Lakers",
            away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
        )
        attestor.register_signal(meta)
        result = await attestor.resolve_signal("sig1", "v1")
        assert result is None  # Game pending
        assert not meta.resolved

    @pytest.mark.asyncio
    async def test_cleanup_resolved_removes_old_signals(self) -> None:
        attestor = OutcomeAttestor()
        meta = SignalMetadata(
            signal_id="sig1",
            sport="basketball_nba",
            event_id="evt1",
            home_team="Lakers",
            away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
            purchased_at=0.0,  # Very old timestamp
        )
        meta.resolved = True
        attestor.register_signal(meta)

        # Also add an attestation so we verify it gets cleaned too
        result = EventResult(event_id="evt1", home_score=110, away_score=105, status="final")
        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)

        removed = await attestor.cleanup_resolved(max_age_seconds=1)
        assert removed == 1
        assert attestor.get_pending_signals() == []
        assert attestor.check_consensus("sig1", 3) is None  # Attestations gone too

    @pytest.mark.asyncio
    async def test_cleanup_resolved_keeps_recent(self) -> None:
        attestor = OutcomeAttestor()
        meta = SignalMetadata(
            signal_id="sig1",
            sport="basketball_nba",
            event_id="evt1",
            home_team="Lakers",
            away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
            # purchased_at defaults to time.monotonic() — very recent
        )
        meta.resolved = True
        attestor.register_signal(meta)

        removed = await attestor.cleanup_resolved(max_age_seconds=86400)
        assert removed == 0  # Still recent, not cleaned

    @pytest.mark.asyncio
    async def test_cleanup_resolved_ignores_unresolved(self) -> None:
        attestor = OutcomeAttestor()
        meta = SignalMetadata(
            signal_id="sig1",
            sport="basketball_nba",
            event_id="evt1",
            home_team="Lakers",
            away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
            purchased_at=0.0,  # Very old
        )
        # Not resolved — should not be cleaned even if old
        attestor.register_signal(meta)

        removed = await attestor.cleanup_resolved(max_age_seconds=1)
        assert removed == 0

    def test_consensus_threshold_rounding(self) -> None:
        """Threshold = ceil(n * 2/3). For n=3: ceil(2.0) = 2."""
        attestor = OutcomeAttestor()
        result = EventResult(event_id="evt1", status="final", home_score=100, away_score=90)

        # With 3 validators, threshold is ceil(3*2/3) = 2 → need 2/3
        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 3) is None  # 1 < 2
        attestor.attest("sig1", "v2", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 3) == Outcome.FAVORABLE  # 2 >= 2

    def test_consensus_with_4_validators(self) -> None:
        """For n=4: int(4*2/3)+1 = int(2.66)+1 = 3 → need 3 of 4."""
        attestor = OutcomeAttestor()
        result = EventResult(event_id="evt1", status="final", home_score=100, away_score=90)

        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        attestor.attest("sig1", "v2", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 4) is None  # 2 < 3
        attestor.attest("sig1", "v3", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", 4) == Outcome.FAVORABLE  # 3 >= 3

    def test_consensus_negative_validators(self) -> None:
        """Negative validator count should not crash."""
        attestor = OutcomeAttestor()
        result = EventResult(event_id="evt1", status="final", home_score=100, away_score=90)
        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        assert attestor.check_consensus("sig1", -1) is None

    def test_resolve_unregistered_signal(self) -> None:
        """Resolving a signal that was never registered returns None."""
        import asyncio
        attestor = OutcomeAttestor()
        result = asyncio.get_event_loop().run_until_complete(
            attestor.resolve_signal("nonexistent", "v1")
        )
        assert result is None

    def test_resolve_already_resolved(self) -> None:
        """Resolving an already-resolved signal returns None."""
        import asyncio
        attestor = OutcomeAttestor()
        meta = SignalMetadata(
            signal_id="sig1", sport="basketball_nba", event_id="evt1",
            home_team="Lakers", away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
        )
        meta.resolved = True
        attestor.register_signal(meta)
        result = asyncio.get_event_loop().run_until_complete(
            attestor.resolve_signal("sig1", "v1")
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_close(self) -> None:
        attestor = OutcomeAttestor()
        await attestor.close()  # Should not raise

    @pytest.mark.asyncio
    async def test_resolve_all_pending_no_api_key(self) -> None:
        """resolve_all returns empty when API key not set (all pending)."""
        attestor = OutcomeAttestor()
        for i in range(3):
            meta = SignalMetadata(
                signal_id=f"sig-{i}", sport="basketball_nba",
                event_id=f"evt-{i}", home_team="Lakers", away_team="Celtics",
                pick=parse_pick("Lakers -3.5 (-110)"),
            )
            attestor.register_signal(meta)

        resolved = await attestor.resolve_all_pending("v1")
        assert resolved == []
        assert len(attestor.get_pending_signals()) == 3

    def test_consensus_split_vote_no_consensus(self) -> None:
        """3-way split: no outcome reaches threshold."""
        attestor = OutcomeAttestor()
        result = EventResult(event_id="evt1", status="final", home_score=100, away_score=90)

        attestor.attest("sig1", "v1", Outcome.FAVORABLE, result)
        attestor.attest("sig1", "v2", Outcome.UNFAVORABLE, result)
        attestor.attest("sig1", "v3", Outcome.VOID, result)

        assert attestor.check_consensus("sig1", 3) is None

    def test_consensus_no_attestations(self) -> None:
        """Signal with no attestations returns None."""
        attestor = OutcomeAttestor()
        assert attestor.check_consensus("nonexistent", 10) is None

    def test_register_duplicate_overwrites(self) -> None:
        """Re-registering same signal_id overwrites the metadata."""
        attestor = OutcomeAttestor()
        meta1 = SignalMetadata(
            signal_id="sig1", sport="basketball_nba",
            event_id="evt1", home_team="Lakers", away_team="Celtics",
            pick=parse_pick("Lakers -3.5 (-110)"),
        )
        meta2 = SignalMetadata(
            signal_id="sig1", sport="football_nfl",
            event_id="evt2", home_team="Chiefs", away_team="Bills",
            pick=parse_pick("Chiefs ML (-200)"),
        )
        attestor.register_signal(meta1)
        attestor.register_signal(meta2)

        pending = attestor.get_pending_signals()
        assert len(pending) == 1
        assert pending[0].sport == "football_nfl"

    @pytest.mark.asyncio
    async def test_cleanup_multiple_resolved(self) -> None:
        """Cleanup removes all old resolved signals."""
        attestor = OutcomeAttestor()
        for i in range(5):
            meta = SignalMetadata(
                signal_id=f"sig-{i}", sport="basketball_nba",
                event_id=f"evt-{i}", home_team="A", away_team="B",
                pick=parse_pick("A ML (-110)"),
                purchased_at=0.0,
            )
            meta.resolved = True
            attestor.register_signal(meta)

        removed = await attestor.cleanup_resolved(max_age_seconds=1)
        assert removed == 5
        assert attestor.get_pending_signals() == []


# ---------------------------------------------------------------------------
# fetch_event_result Retry Behavior
# ---------------------------------------------------------------------------


class TestFetchEventResultRetry:
    """Tests for HTTP retry logic in fetch_event_result."""

    def _make_response(self, status_code: int, json_data: list | None = None) -> httpx.Response:
        """Create a mock httpx.Response."""
        resp = httpx.Response(
            status_code=status_code,
            json=json_data if json_data is not None else [],
            request=httpx.Request("GET", "https://api.the-odds-api.com/v4/sports/basketball_nba/scores"),
        )
        return resp

    @pytest.mark.asyncio
    async def test_5xx_retries_then_returns_error(self) -> None:
        """Server errors (5xx) should be retried up to 3 times."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(503))
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "error"
        assert mock_client.get.call_count == 3

    @pytest.mark.asyncio
    async def test_5xx_then_success(self) -> None:
        """Recovery after initial 5xx should return valid data."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[
            self._make_response(502),
            self._make_response(200, []),
        ])
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "pending"  # Empty data → pending
        assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_4xx_no_retry(self) -> None:
        """Client errors (4xx) should NOT be retried."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(401))
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "error"
        assert mock_client.get.call_count == 1  # No retry

    @pytest.mark.asyncio
    async def test_404_no_retry(self) -> None:
        """404 is a client error — no retry."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(404))
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "error"
        assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_network_error_retries(self) -> None:
        """Network errors (httpx.HTTPError) should be retried."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("connection refused")
        )
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "error"
        assert mock_client.get.call_count == 3

    @pytest.mark.asyncio
    async def test_network_error_then_success(self) -> None:
        """Recovery after network error should return valid data."""
        completed_event = [{
            "home_team": "Lakers",
            "away_team": "Celtics",
            "completed": True,
            "scores": [
                {"name": "Lakers", "score": "110"},
                {"name": "Celtics", "score": "105"},
            ],
        }]
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[
            httpx.ConnectError("connection refused"),
            self._make_response(200, completed_event),
        ])
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "final"
        assert result.home_score == 110
        assert result.away_score == 105
        assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_invalid_event_id_skips_http(self) -> None:
        """Invalid event ID should return error without making HTTP call."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evil;drop table", "basketball_nba")

        assert result.status == "error"
        assert mock_client.get.call_count == 0

    @pytest.mark.asyncio
    async def test_invalid_sport_skips_http(self) -> None:
        """Invalid sport key should return error without making HTTP call."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "bad sport!")

        assert result.status == "error"
        assert mock_client.get.call_count == 0

    @pytest.mark.asyncio
    async def test_unsupported_sport_skips_http(self) -> None:
        """Valid-looking but unsupported sport key should return error."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "cricket_ipl")

        assert result.status == "error"
        assert mock_client.get.call_count == 0

    @pytest.mark.asyncio
    async def test_no_api_key_returns_pending(self) -> None:
        """No API key should return pending without HTTP call."""
        attestor = OutcomeAttestor(sports_api_key="")
        mock_client = AsyncMock()
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "pending"
        assert mock_client.get.call_count == 0

    @pytest.mark.asyncio
    async def test_200_completed_event_parsing(self) -> None:
        """Successful response with completed game parses correctly."""
        event_data = [{
            "home_team": "Los Angeles Lakers",
            "away_team": "Boston Celtics",
            "completed": True,
            "scores": [
                {"name": "Los Angeles Lakers", "score": "115"},
                {"name": "Boston Celtics", "score": "108"},
            ],
        }]
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(200, event_data))
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "final"
        assert result.home_team == "Los Angeles Lakers"
        assert result.away_team == "Boston Celtics"
        assert result.home_score == 115
        assert result.away_score == 108

    @pytest.mark.asyncio
    async def test_200_pending_event(self) -> None:
        """Successful response with non-completed game returns pending."""
        event_data = [{
            "home_team": "Lakers",
            "away_team": "Celtics",
            "completed": False,
        }]
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(200, event_data))
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_200_empty_response(self) -> None:
        """Empty array response returns pending."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(200, []))
        attestor._client = mock_client

        result = await attestor.fetch_event_result("evt1", "basketball_nba")

        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_5xx_backoff_delays(self) -> None:
        """Verify that 5xx retries use increasing backoff delays with jitter."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(500))
        attestor._client = mock_client

        sleep_calls = []
        async def mock_sleep(delay: float) -> None:
            sleep_calls.append(delay)

        with patch("djinn_validator.core.outcomes.asyncio.sleep", side_effect=mock_sleep):
            await attestor.fetch_event_result("evt1", "basketball_nba")

        assert len(sleep_calls) == 2
        # base=1.0 * jitter[0.5,1.5] → [0.5, 1.5]
        assert 0.5 <= sleep_calls[0] <= 1.5
        # base=2.0 * jitter[0.5,1.5] → [1.0, 3.0]
        assert 1.0 <= sleep_calls[1] <= 3.0


# ---------------------------------------------------------------------------
# Circuit Breaker Tests
# ---------------------------------------------------------------------------


class TestCircuitBreaker:
    """Tests for the sports API circuit breaker."""

    def _make_response(self, status_code: int, json_data: list | None = None) -> httpx.Response:
        resp = httpx.Response(
            status_code=status_code,
            json=json_data if json_data is not None else [],
            request=httpx.Request("GET", "https://api.the-odds-api.com/v4/sports/basketball_nba/scores"),
        )
        return resp

    @pytest.mark.asyncio
    async def test_circuit_opens_after_threshold_failures(self) -> None:
        """Circuit opens after CIRCUIT_BREAKER_THRESHOLD consecutive failures."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 3
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(500))
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            # Each call counts as 1 failure (after exhausting 3 retries)
            for _ in range(3):
                await attestor.fetch_event_result("evt1", "basketball_nba")

        assert attestor._consecutive_api_failures == 3
        assert attestor._circuit_opened_at is not None

    @pytest.mark.asyncio
    async def test_circuit_open_skips_api_call(self) -> None:
        """When circuit is open, API calls are skipped and return pending."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 2
        attestor.CIRCUIT_BREAKER_RESET_SECONDS = 60.0
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(500))
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            # Trigger circuit breaker (2 failures)
            for _ in range(2):
                await attestor.fetch_event_result("evt1", "basketball_nba")

        call_count_before = mock_client.get.call_count

        # Next call should be skipped entirely
        result = await attestor.fetch_event_result("evt2", "basketball_nba")
        assert result.status == "pending"
        assert mock_client.get.call_count == call_count_before  # No new API call

    @pytest.mark.asyncio
    async def test_circuit_resets_after_timeout(self) -> None:
        """Circuit resets to half-open after CIRCUIT_BREAKER_RESET_SECONDS."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 2
        attestor.CIRCUIT_BREAKER_RESET_SECONDS = 10.0
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(500))
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            for _ in range(2):
                await attestor.fetch_event_result("evt1", "basketball_nba")

        assert attestor._is_circuit_open()

        # Move time forward past reset
        attestor._circuit_opened_at = time.monotonic() - 11.0

        assert not attestor._is_circuit_open()  # Half-open now

    @pytest.mark.asyncio
    async def test_success_resets_circuit(self) -> None:
        """A successful API call fully resets the circuit breaker."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 2
        mock_client = AsyncMock()
        attestor._client = mock_client

        # Simulate failures to open circuit
        attestor._consecutive_api_failures = 5
        attestor._circuit_opened_at = time.monotonic() - 100  # Expired, half-open

        # Next call succeeds
        mock_client.get = AsyncMock(return_value=self._make_response(200, []))
        result = await attestor.fetch_event_result("evt1", "basketball_nba")
        assert result.status == "pending"  # Empty data → pending

        # Circuit should be fully reset
        assert attestor._consecutive_api_failures == 0
        assert attestor._circuit_opened_at is None

    @pytest.mark.asyncio
    async def test_4xx_does_not_increment_failures(self) -> None:
        """Client errors (4xx) don't affect the circuit breaker."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 3
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=self._make_response(401))
        attestor._client = mock_client

        for _ in range(5):
            await attestor.fetch_event_result("evt1", "basketball_nba")

        assert attestor._consecutive_api_failures == 0
        assert not attestor._is_circuit_open()

    @pytest.mark.asyncio
    async def test_network_error_increments_failures(self) -> None:
        """Network errors increment the circuit breaker failure counter."""
        attestor = OutcomeAttestor(sports_api_key="test-key")
        attestor.CIRCUIT_BREAKER_THRESHOLD = 2
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        attestor._client = mock_client

        with patch("djinn_validator.core.outcomes.asyncio.sleep", new_callable=AsyncMock):
            for _ in range(2):
                await attestor.fetch_event_result("evt1", "basketball_nba")

        assert attestor._consecutive_api_failures == 2
        assert attestor._is_circuit_open()

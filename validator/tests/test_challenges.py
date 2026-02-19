"""Tests for the miner challenge system."""

import pytest

from djinn_validator.core.challenges import build_challenge_lines, challenge_miners
from djinn_validator.core.scoring import MinerScorer


class TestBuildChallengeLines:
    """Tests for build_challenge_lines()."""

    def _make_event(self, event_id: str = "evt1", home: str = "Lakers", away: str = "Celtics") -> dict:
        return {
            "id": event_id,
            "home_team": home,
            "away_team": away,
            "bookmakers": [
                {
                    "key": "fanduel",
                    "markets": [
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": home, "price": 1.91, "point": -3.5},
                                {"name": away, "price": 1.91, "point": 3.5},
                            ],
                        },
                        {
                            "key": "totals",
                            "outcomes": [
                                {"name": "Over", "price": 1.95, "point": 218.5},
                                {"name": "Under", "price": 1.87, "point": 218.5},
                            ],
                        },
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": home, "price": 1.60},
                                {"name": away, "price": 2.40},
                            ],
                        },
                    ],
                }
            ],
        }

    def test_builds_lines_from_events(self) -> None:
        events = [self._make_event()]
        lines = build_challenge_lines(events, "basketball_nba")
        assert len(lines) > 0
        assert len(lines) <= 10

    def test_all_lines_have_required_fields(self) -> None:
        events = [self._make_event(), self._make_event("evt2")]
        lines = build_challenge_lines(events, "basketball_nba")
        for line in lines:
            assert "index" in line
            assert 1 <= line["index"] <= 10
            assert "sport" in line
            assert "event_id" in line
            assert "market" in line
            assert "ground_truth_available" in line

    def test_includes_synthetic_unavailable_lines(self) -> None:
        events = [self._make_event(), self._make_event("evt2"), self._make_event("evt3")]
        lines = build_challenge_lines(events, "basketball_nba")
        unavailable = [l for l in lines if not l["ground_truth_available"]]
        assert len(unavailable) > 0

    def test_indices_are_unique(self) -> None:
        events = [self._make_event(), self._make_event("evt2")]
        lines = build_challenge_lines(events, "basketball_nba")
        indices = [l["index"] for l in lines]
        assert len(indices) == len(set(indices))

    def test_empty_events_returns_empty(self) -> None:
        assert build_challenge_lines([], "basketball_nba") == []

    def test_events_without_bookmakers_returns_empty(self) -> None:
        events = [{"id": "e1", "home_team": "A", "away_team": "B", "bookmakers": []}]
        assert build_challenge_lines(events, "basketball_nba") == []


@pytest.mark.asyncio
async def test_challenge_miners_no_api_key() -> None:
    """challenge_miners returns 0 when no API key is provided."""
    scorer = MinerScorer()
    result = await challenge_miners(scorer, [], "")
    assert result == 0


@pytest.mark.asyncio
async def test_challenge_miners_no_miners() -> None:
    """challenge_miners handles empty miner list gracefully."""
    scorer = MinerScorer()
    result = await challenge_miners(scorer, [], "test-key")
    # Returns 0 because no miners to challenge (and odds fetch may fail with bad key)
    assert result == 0

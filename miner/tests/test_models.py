"""Tests for Pydantic request/response model validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from djinn_miner.api.models import (
    CandidateLine,
    CheckRequest,
    ProofRequest,
)


class TestCandidateLine:
    def test_valid_line(self) -> None:
        line = CandidateLine(
            index=1,
            sport="basketball_nba",
            event_id="ev-1",
            home_team="Lakers",
            away_team="Celtics",
            market="spreads",
            line=-3.5,
            side="Lakers",
        )
        assert line.index == 1

    def test_index_too_low(self) -> None:
        with pytest.raises(ValidationError, match="index"):
            CandidateLine(
                index=0,
                sport="basketball_nba",
                event_id="ev-1",
                home_team="Lakers",
                away_team="Celtics",
                market="spreads",
                line=-3.5,
                side="Lakers",
            )

    def test_index_too_high(self) -> None:
        with pytest.raises(ValidationError, match="index"):
            CandidateLine(
                index=11,
                sport="basketball_nba",
                event_id="ev-1",
                home_team="Lakers",
                away_team="Celtics",
                market="spreads",
                line=-3.5,
                side="Lakers",
            )

    def test_h2h_line_can_be_none(self) -> None:
        line = CandidateLine(
            index=1,
            sport="basketball_nba",
            event_id="ev-1",
            home_team="Lakers",
            away_team="Celtics",
            market="h2h",
            line=None,
            side="Lakers",
        )
        assert line.line is None


class TestCheckRequest:
    def test_valid_request(self) -> None:
        req = CheckRequest(
            lines=[
                CandidateLine(
                    index=1,
                    sport="basketball_nba",
                    event_id="ev-1",
                    home_team="Lakers",
                    away_team="Celtics",
                    market="spreads",
                    line=-3.5,
                    side="Lakers",
                ),
            ],
        )
        assert len(req.lines) == 1

    def test_empty_lines_rejected(self) -> None:
        with pytest.raises(ValidationError, match="lines"):
            CheckRequest(lines=[])

    def test_too_many_lines_rejected(self) -> None:
        line = CandidateLine(
            index=1,
            sport="basketball_nba",
            event_id="ev-1",
            home_team="Lakers",
            away_team="Celtics",
            market="spreads",
            line=-3.5,
            side="Lakers",
        )
        with pytest.raises(ValidationError, match="lines"):
            CheckRequest(lines=[line] * 11)


class TestProofRequest:
    def test_valid_request(self) -> None:
        req = ProofRequest(query_id="q-1")
        assert req.session_data == ""

    def test_with_session_data(self) -> None:
        req = ProofRequest(query_id="q-1", session_data="some-session")
        assert req.session_data == "some-session"

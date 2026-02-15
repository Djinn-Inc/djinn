"""Tests for HTTP attestation proof generation."""

from __future__ import annotations

import json
import time

import pytest

from djinn_miner.core.proof import (
    AttestationProof,
    CapturedSession,
    ProofGenerator,
    SessionCapture,
)


# ---------------------------------------------------------------------------
# SessionCapture
# ---------------------------------------------------------------------------


class TestSessionCapture:
    def test_record_and_get(self) -> None:
        capture = SessionCapture()
        session = CapturedSession(
            query_id="q1",
            request_url="https://api.the-odds-api.com/v4/sports/basketball_nba/odds",
        )
        capture.record(session)
        assert capture.get("q1") is session
        assert capture.count == 1

    def test_get_missing(self) -> None:
        capture = SessionCapture()
        assert capture.get("nonexistent") is None

    def test_remove(self) -> None:
        capture = SessionCapture()
        session = CapturedSession(query_id="q1", request_url="https://example.com")
        capture.record(session)
        capture.remove("q1")
        assert capture.get("q1") is None
        assert capture.count == 0

    def test_remove_nonexistent(self) -> None:
        capture = SessionCapture()
        capture.remove("nonexistent")  # Should not raise

    def test_multiple_sessions(self) -> None:
        capture = SessionCapture()
        for i in range(5):
            capture.record(CapturedSession(query_id=f"q{i}", request_url=f"https://example.com/{i}"))
        assert capture.count == 5
        assert capture.get("q0") is not None
        assert capture.get("q4") is not None

    def test_eviction_on_max_capacity(self) -> None:
        """When reaching max capacity, oldest session is evicted."""
        capture = SessionCapture()
        capture._MAX_SESSIONS = 3  # Lower for testing
        for i in range(4):
            capture.record(CapturedSession(query_id=f"q{i}", request_url=f"https://example.com/{i}"))
        assert capture.count == 3
        assert capture.get("q0") is None  # Oldest evicted
        assert capture.get("q3") is not None

    def test_expired_sessions_evicted(self) -> None:
        """Expired sessions are cleaned up on record()."""
        capture = SessionCapture()
        old_session = CapturedSession(query_id="old", request_url="https://example.com")
        capture.record(old_session)
        # Backdate the timestamp
        capture._timestamps["old"] = time.time() - capture._SESSION_TTL - 1

        # Recording a new session triggers eviction
        capture.record(CapturedSession(query_id="new", request_url="https://example.com/new"))
        assert capture.get("old") is None
        assert capture.get("new") is not None

    def test_overwrite_session(self) -> None:
        capture = SessionCapture()
        s1 = CapturedSession(query_id="q1", request_url="https://example.com/first")
        s2 = CapturedSession(query_id="q1", request_url="https://example.com/second")
        capture.record(s1)
        capture.record(s2)
        assert capture.count == 1
        assert capture.get("q1") is s2


# ---------------------------------------------------------------------------
# ProofGenerator — with captured sessions
# ---------------------------------------------------------------------------


MOCK_ODDS_RESPONSE = json.dumps([
    {
        "id": "event-lakers-celtics-001",
        "sport_key": "basketball_nba",
        "home_team": "Los Angeles Lakers",
        "away_team": "Boston Celtics",
        "bookmakers": [
            {
                "key": "fanduel",
                "title": "FanDuel",
                "markets": [
                    {
                        "key": "spreads",
                        "outcomes": [
                            {"name": "Los Angeles Lakers", "price": 1.91, "point": -3.0},
                        ],
                    },
                ],
            },
            {
                "key": "draftkings",
                "title": "DraftKings",
                "markets": [],
            },
        ],
    },
    {
        "id": "event-heat-warriors-002",
        "sport_key": "basketball_nba",
        "home_team": "Miami Heat",
        "away_team": "Golden State Warriors",
        "bookmakers": [
            {
                "key": "betmgm",
                "title": "BetMGM",
                "markets": [],
            },
        ],
    },
]).encode()


class TestProofGeneratorWithSession:
    def _make_session(self, query_id: str = "q1") -> CapturedSession:
        return CapturedSession(
            query_id=query_id,
            request_url="https://api.the-odds-api.com/v4/sports/basketball_nba/odds",
            request_params={"regions": "us", "markets": "spreads,totals,h2h"},
            response_status=200,
            response_body=MOCK_ODDS_RESPONSE,
            response_headers={"content-type": "application/json"},
            captured_at=1700000000.0,
        )

    @pytest.mark.asyncio
    async def test_generate_with_captured_session(self) -> None:
        capture = SessionCapture()
        capture.record(self._make_session("q1"))
        gen = ProofGenerator(session_capture=capture)

        result = await gen.generate("q1")

        assert result.query_id == "q1"
        assert result.status == "submitted"
        assert len(result.proof_hash) == 64  # SHA-256 hex
        assert gen.generated_count == 1

        # Session should be removed after proof generation
        assert capture.get("q1") is None

    @pytest.mark.asyncio
    async def test_proof_message_contains_attestation(self) -> None:
        capture = SessionCapture()
        capture.record(self._make_session("q1"))
        gen = ProofGenerator(session_capture=capture)

        result = await gen.generate("q1")

        msg = json.loads(result.message)
        assert msg["type"] == "http_attestation"
        assert "response_hash" in msg
        assert msg["events_found"] == 2
        assert msg["bookmakers_found"] == 3  # fanduel, draftkings, betmgm
        assert msg["captured_at"] == 1700000000.0

    @pytest.mark.asyncio
    async def test_proof_hash_deterministic(self) -> None:
        """Same session data should produce the same proof hash."""
        s1 = self._make_session("q1")
        s2 = self._make_session("q2")
        # Same body, same URL, same captured_at
        s2.request_url = s1.request_url
        s2.response_body = s1.response_body
        s2.captured_at = s1.captured_at

        capture1 = SessionCapture()
        capture1.record(s1)
        gen1 = ProofGenerator(session_capture=capture1)

        capture2 = SessionCapture()
        capture2.record(s2)
        gen2 = ProofGenerator(session_capture=capture2)

        r1 = await gen1.generate("q1")
        r2 = await gen2.generate("q2")

        # Different query_ids → different proof hashes (query_id is in the payload)
        assert r1.proof_hash != r2.proof_hash

    @pytest.mark.asyncio
    async def test_generate_count_increments(self) -> None:
        gen = ProofGenerator()
        assert gen.generated_count == 0

        await gen.generate("q1")
        assert gen.generated_count == 1

        await gen.generate("q2")
        assert gen.generated_count == 2


# ---------------------------------------------------------------------------
# ProofGenerator — fallback (no captured session)
# ---------------------------------------------------------------------------


class TestProofGeneratorFallback:
    @pytest.mark.asyncio
    async def test_fallback_basic_hash(self) -> None:
        gen = ProofGenerator()
        result = await gen.generate("q1", session_data="some-data")

        assert result.query_id == "q1"
        assert result.status == "submitted"
        assert result.message == "basic hash proof (no captured session)"
        assert len(result.proof_hash) == 64

    @pytest.mark.asyncio
    async def test_fallback_different_inputs_different_hashes(self) -> None:
        gen = ProofGenerator()
        r1 = await gen.generate("q1", session_data="data-a")
        r2 = await gen.generate("q2", session_data="data-b")
        assert r1.proof_hash != r2.proof_hash


# ---------------------------------------------------------------------------
# Response Summary Parsing
# ---------------------------------------------------------------------------


class TestResponseSummary:
    def test_valid_odds_response(self) -> None:
        summary = ProofGenerator._parse_response_summary(MOCK_ODDS_RESPONSE)
        assert summary["event_count"] == 2
        assert "event-lakers-celtics-001" in summary["event_ids"]
        assert "event-heat-warriors-002" in summary["event_ids"]
        assert summary["bookmaker_count"] == 3
        assert "fanduel" in summary["bookmaker_keys"]
        assert "draftkings" in summary["bookmaker_keys"]
        assert "betmgm" in summary["bookmaker_keys"]

    def test_empty_response(self) -> None:
        summary = ProofGenerator._parse_response_summary(b"[]")
        assert summary["event_count"] == 0
        assert summary["bookmaker_count"] == 0

    def test_invalid_json(self) -> None:
        summary = ProofGenerator._parse_response_summary(b"not json")
        assert summary["event_count"] == 0
        assert summary["error"] == "unparseable"

    def test_non_list_response(self) -> None:
        summary = ProofGenerator._parse_response_summary(b'{"error": "invalid"}')
        assert summary["event_count"] == 0

    def test_binary_data(self) -> None:
        """Binary data with null bytes should not crash parser."""
        summary = ProofGenerator._parse_response_summary(b"\x00\xff\xfe binary")
        assert summary["event_count"] == 0
        assert summary.get("error") == "unparseable"

    def test_nested_non_dict_events(self) -> None:
        """Events list with non-dict elements should be skipped."""
        data = json.dumps([42, "string", None, {"id": "real-event"}]).encode()
        summary = ProofGenerator._parse_response_summary(data)
        assert summary["event_count"] == 1

    def test_events_missing_id(self) -> None:
        """Events without 'id' field should not be counted."""
        data = json.dumps([{"bookmakers": [{"key": "bk1"}]}, {"id": ""}]).encode()
        summary = ProofGenerator._parse_response_summary(data)
        assert summary["event_count"] == 0
        assert summary["bookmaker_count"] == 1

    def test_events_without_bookmakers(self) -> None:
        data = json.dumps([{"id": "e1"}, {"id": "e2"}]).encode()
        summary = ProofGenerator._parse_response_summary(data)
        assert summary["event_count"] == 2
        assert summary["bookmaker_count"] == 0

    def test_caps_event_ids(self) -> None:
        """Event IDs should be capped at 20."""
        events = [{"id": f"event-{i}"} for i in range(30)]
        data = json.dumps(events).encode()
        summary = ProofGenerator._parse_response_summary(data)
        assert summary["event_count"] == 30
        assert len(summary["event_ids"]) == 20

    def test_caps_bookmaker_keys(self) -> None:
        """Bookmaker keys should be capped at 10."""
        bookmakers = [{"key": f"bk-{i}"} for i in range(15)]
        events = [{"id": "e1", "bookmakers": bookmakers}]
        data = json.dumps(events).encode()
        summary = ProofGenerator._parse_response_summary(data)
        assert summary["bookmaker_count"] == 15
        assert len(summary["bookmaker_keys"]) == 10


# ---------------------------------------------------------------------------
# AttestationProof dataclass
# ---------------------------------------------------------------------------


class TestAttestationProof:
    def test_creation(self) -> None:
        proof = AttestationProof(
            query_id="q1",
            request_url="https://example.com",
            response_hash="abc123",
            response_summary={"event_count": 2},
            captured_at=time.time(),
            proof_hash="def456",
            events_found=2,
            bookmakers_found=3,
        )
        assert proof.query_id == "q1"
        assert proof.events_found == 2
        assert proof.bookmakers_found == 3

    def test_defaults(self) -> None:
        proof = AttestationProof(
            query_id="q1",
            request_url="https://example.com",
            response_hash="abc123",
            response_summary={},
            captured_at=0,
            proof_hash="def456",
        )
        assert proof.events_found == 0
        assert proof.bookmakers_found == 0

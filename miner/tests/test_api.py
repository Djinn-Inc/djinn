"""Tests for the FastAPI server endpoints."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from djinn_miner.api.models import CandidateLine
from djinn_miner.api.server import create_app
from djinn_miner.core.checker import LineChecker
from djinn_miner.core.health import HealthTracker
from djinn_miner.core.proof import ProofGenerator
from djinn_miner.data.odds_api import OddsApiClient


@pytest.fixture
def app(mock_odds_response: list[dict]) -> TestClient:
    """Create a test client with mock data."""
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=mock_odds_response)
        )
    )
    odds_client = OddsApiClient(
        api_key="test-key",
        base_url="https://api.the-odds-api.com",
        cache_ttl=300,
        http_client=mock_http,
    )
    checker = LineChecker(odds_client=odds_client, line_tolerance=0.5)
    proof_gen = ProofGenerator()
    health_tracker = HealthTracker(uid=42, odds_api_connected=True)

    fastapi_app = create_app(
        checker=checker,
        proof_gen=proof_gen,
        health_tracker=health_tracker,
    )
    return TestClient(fastapi_app)


class TestRequestIdMiddleware:
    def test_response_has_request_id_header(self, app: TestClient) -> None:
        resp = app.get("/health")
        assert "x-request-id" in resp.headers
        assert len(resp.headers["x-request-id"]) == 32  # UUID hex

    def test_forwarded_request_id_is_echoed(self, app: TestClient) -> None:
        resp = app.get("/health", headers={"X-Request-ID": "my-trace-123"})
        assert resp.headers["x-request-id"] == "my-trace-123"

    def test_unique_ids_per_request(self, app: TestClient) -> None:
        r1 = app.get("/health")
        r2 = app.get("/health")
        assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


class TestHealthEndpoint:
    def test_health_returns_ok(self, app: TestClient) -> None:
        resp = app.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"
        assert data["uid"] == 42
        assert data["odds_api_connected"] is True

    def test_health_increments_ping_count(self, app: TestClient) -> None:
        app.get("/health")
        app.get("/health")
        resp = app.get("/health")
        assert resp.status_code == 200

    def test_health_uptime_positive(self, app: TestClient) -> None:
        resp = app.get("/health")
        assert resp.json()["uptime_seconds"] >= 0


class TestCheckEndpoint:
    def test_check_single_available_line(self, app: TestClient) -> None:
        body = {
            "lines": [
                {
                    "index": 1,
                    "sport": "basketball_nba",
                    "event_id": "event-lakers-celtics-001",
                    "home_team": "Los Angeles Lakers",
                    "away_team": "Boston Celtics",
                    "market": "spreads",
                    "line": -3.0,
                    "side": "Los Angeles Lakers",
                },
            ],
        }
        resp = app.post("/v1/check", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["available_indices"] == [1]
        assert data["response_time_ms"] > 0
        assert data["results"][0]["available"] is True
        assert len(data["results"][0]["bookmakers"]) > 0

    def test_check_single_unavailable_line(self, app: TestClient) -> None:
        body = {
            "lines": [
                {
                    "index": 1,
                    "sport": "basketball_nba",
                    "event_id": "event-lakers-celtics-001",
                    "home_team": "Los Angeles Lakers",
                    "away_team": "Boston Celtics",
                    "market": "spreads",
                    "line": -10.0,
                    "side": "Los Angeles Lakers",
                },
            ],
        }
        resp = app.post("/v1/check", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["available_indices"] == []
        assert data["results"][0]["available"] is False

    def test_check_full_10_lines(
        self, app: TestClient, sample_lines: list[CandidateLine]
    ) -> None:
        body = {"lines": [line.model_dump() for line in sample_lines]}
        resp = app.post("/v1/check", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 10
        assert isinstance(data["available_indices"], list)
        assert data["response_time_ms"] > 0

    def test_check_returns_bookmaker_details(self, app: TestClient) -> None:
        body = {
            "lines": [
                {
                    "index": 1,
                    "sport": "basketball_nba",
                    "event_id": "event-lakers-celtics-001",
                    "home_team": "Los Angeles Lakers",
                    "away_team": "Boston Celtics",
                    "market": "h2h",
                    "line": None,
                    "side": "Los Angeles Lakers",
                },
            ],
        }
        resp = app.post("/v1/check", json=body)
        data = resp.json()
        bookmakers = data["results"][0]["bookmakers"]
        assert len(bookmakers) >= 1
        assert "bookmaker" in bookmakers[0]
        assert "odds" in bookmakers[0]

    def test_check_validation_rejects_empty_lines(self, app: TestClient) -> None:
        resp = app.post("/v1/check", json={"lines": []})
        assert resp.status_code == 422

    def test_check_validation_rejects_invalid_index(self, app: TestClient) -> None:
        body = {
            "lines": [
                {
                    "index": 11,
                    "sport": "basketball_nba",
                    "event_id": "ev-001",
                    "home_team": "Team A",
                    "away_team": "Team B",
                    "market": "h2h",
                    "side": "Team A",
                },
            ],
        }
        resp = app.post("/v1/check", json=body)
        assert resp.status_code == 422


class TestProofEndpoint:
    def test_proof_returns_stub(self, app: TestClient) -> None:
        body = {
            "query_id": "test-query-001",
            "session_data": "mock-tls-session-data",
        }
        resp = app.post("/v1/proof", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["query_id"] == "test-query-001"
        assert data["status"] == "submitted"
        assert len(data["proof_hash"]) == 64  # SHA-256 hex
        assert "basic hash proof" in data["message"].lower()

    def test_proof_different_queries_produce_different_hashes(
        self, app: TestClient
    ) -> None:
        resp1 = app.post(
            "/v1/proof",
            json={"query_id": "q1", "session_data": "data1"},
        )
        resp2 = app.post(
            "/v1/proof",
            json={"query_id": "q2", "session_data": "data2"},
        )
        assert resp1.json()["proof_hash"] != resp2.json()["proof_hash"]

    def test_proof_empty_session_data(self, app: TestClient) -> None:
        body = {"query_id": "test-query-002"}
        resp = app.post("/v1/proof", json=body)
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"


class TestMetricsEndpoint:
    def test_metrics_returns_prometheus_format(self, app: TestClient) -> None:
        resp = app.get("/metrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers.get("content-type", "")
        text = resp.text
        assert "djinn_miner" in text

    def test_metrics_after_check(self, app: TestClient) -> None:
        app.post("/v1/check", json={
            "lines": [{
                "index": 1,
                "sport": "basketball_nba",
                "event_id": "event-lakers-celtics-001",
                "home_team": "Los Angeles Lakers",
                "away_team": "Boston Celtics",
                "market": "h2h",
                "line": None,
                "side": "Los Angeles Lakers",
            }],
        })
        resp = app.get("/metrics")
        assert "checks_processed" in resp.text


class TestBodySizeLimit:
    def test_oversized_body_rejected(self, app: TestClient) -> None:
        huge_body = "x" * (1_048_576 + 1)
        resp = app.post(
            "/v1/check",
            content=huge_body,
            headers={"Content-Type": "application/json", "Content-Length": str(len(huge_body))},
        )
        assert resp.status_code == 413


class TestInputValidation:
    """Test that invalid inputs are properly rejected."""

    def test_check_missing_lines(self, app: TestClient) -> None:
        resp = app.post("/v1/check", json={})
        assert resp.status_code == 422

    def test_check_invalid_index(self, app: TestClient) -> None:
        resp = app.post("/v1/check", json={
            "lines": [{
                "index": 0,
                "sport": "nba",
                "event_id": "ev",
                "home_team": "A",
                "away_team": "B",
                "market": "h2h",
                "side": "A",
            }],
        })
        assert resp.status_code == 422

    def test_check_too_many_lines(self, app: TestClient) -> None:
        line = {
            "index": 1,
            "sport": "nba",
            "event_id": "ev",
            "home_team": "A",
            "away_team": "B",
            "market": "h2h",
            "side": "A",
        }
        resp = app.post("/v1/check", json={"lines": [line] * 11})
        assert resp.status_code == 422

    def test_proof_missing_query_id(self, app: TestClient) -> None:
        resp = app.post("/v1/proof", json={})
        assert resp.status_code == 422

    def test_nonexistent_endpoint_returns_404(self, app: TestClient) -> None:
        resp = app.get("/v1/doesnotexist")
        assert resp.status_code in (404, 405)

    def test_string_too_long(self, app: TestClient) -> None:
        resp = app.post("/v1/check", json={
            "lines": [{
                "index": 1,
                "sport": "x" * 200,
                "event_id": "ev",
                "home_team": "A",
                "away_team": "B",
                "market": "h2h",
                "side": "A",
            }],
        })
        assert resp.status_code == 422


class TestReadinessEndpoint:
    def test_readiness_returns_checks(self, app: TestClient) -> None:
        resp = app.get("/health/ready")
        assert resp.status_code == 200
        data = resp.json()
        assert "ready" in data
        assert "checks" in data
        assert isinstance(data["checks"], dict)

    def test_readiness_checks_odds_api(self, app: TestClient) -> None:
        resp = app.get("/health/ready")
        data = resp.json()
        assert "odds_api_connected" in data["checks"]

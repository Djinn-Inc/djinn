"""Tests for the validator REST API."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from djinn_validator.api.server import create_app
from djinn_validator.core.outcomes import OutcomeAttestor
from djinn_validator.core.purchase import PurchaseOrchestrator
from djinn_validator.core.shares import ShareStore
from djinn_validator.utils.crypto import Share


@pytest.fixture
def share_store() -> ShareStore:
    return ShareStore()


@pytest.fixture
def client(share_store: ShareStore) -> TestClient:
    purchase_orch = PurchaseOrchestrator(share_store)
    outcome_attestor = OutcomeAttestor()
    app = create_app(share_store, purchase_orch, outcome_attestor)
    return TestClient(app)


@pytest.fixture
def client_with_chain(share_store: ShareStore) -> TestClient:
    """Client with a mock chain client that reports connected."""
    purchase_orch = PurchaseOrchestrator(share_store)
    outcome_attestor = OutcomeAttestor()
    mock_chain = AsyncMock()
    mock_chain.is_connected = AsyncMock(return_value=True)
    app = create_app(share_store, purchase_orch, outcome_attestor, chain_client=mock_chain)
    return TestClient(app)


class TestRequestIdMiddleware:
    def test_response_has_request_id_header(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert "x-request-id" in resp.headers
        assert len(resp.headers["x-request-id"]) == 32  # UUID hex

    def test_forwarded_request_id_is_echoed(self, client: TestClient) -> None:
        resp = client.get("/health", headers={"X-Request-ID": "my-trace-123"})
        assert resp.headers["x-request-id"] == "my-trace-123"

    def test_unique_ids_per_request(self, client: TestClient) -> None:
        r1 = client.get("/health")
        r2 = client.get("/health")
        assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


class TestHealthEndpoint:
    def test_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"


class TestStoreShare:
    def test_store_share(self, client: TestClient, share_store: ShareStore) -> None:
        resp = client.post("/v1/signal", json={
            "signal_id": "sig-1",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": hex(12345),
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["stored"] is True
        assert share_store.has("sig-1")

    def test_rejects_share_y_exceeding_prime(self, client: TestClient) -> None:
        from djinn_validator.utils.crypto import BN254_PRIME
        resp = client.post("/v1/signal", json={
            "signal_id": "sig-bad",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": hex(BN254_PRIME + 1),
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 400
        assert "BN254" in resp.json()["detail"]

    def test_rejects_invalid_share_x(self, client: TestClient) -> None:
        """Pydantic rejects share_x outside [1, 10] with 422."""
        resp = client.post("/v1/signal", json={
            "signal_id": "sig-bad",
            "genius_address": "0xGenius",
            "share_x": 0,
            "share_y": hex(42),
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 422

    def test_rejects_invalid_hex(self, client: TestClient) -> None:
        """Pydantic hex validator rejects non-hex share_y with 422."""
        resp = client.post("/v1/signal", json={
            "signal_id": "sig-bad",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": "not-hex",
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 422


class TestPurchase:
    def test_purchase_nonexistent_signal(self, client: TestClient) -> None:
        resp = client.post("/v1/signal/unknown/purchase", json={
            "buyer_address": "0xBuyer",
            "sportsbook": "DraftKings",
            "available_indices": [1, 3, 5],
        })
        assert resp.status_code == 404

    def test_purchase_available_signal(self, client: TestClient, share_store: ShareStore) -> None:
        # Store a share where the secret (real index) is 5
        from djinn_validator.utils.crypto import generate_signal_index_shares
        shares = generate_signal_index_shares(5)
        share_store.store(
            "sig-1", "0xGenius",
            shares[0],  # This validator holds share 1
            b"encrypted-aes-key",
        )

        resp = client.post("/v1/signal/sig-1/purchase", json={
            "buyer_address": "0xBuyer",
            "sportsbook": "DraftKings",
            "available_indices": [1, 3, 5, 7, 9],  # 5 is available
        })
        assert resp.status_code == 200
        data = resp.json()
        # In single-validator mode, availability depends on the polynomial
        # evaluation at the share point, not the actual secret.
        # The test verifies the API flow works end-to-end.
        assert data["signal_id"] == "sig-1"
        assert data["status"] in ("complete", "unavailable")


class TestOutcome:
    def test_attest_outcome(self, client: TestClient, share_store: ShareStore) -> None:
        # Store a share first
        share_store.store("sig-1", "0xG", Share(x=1, y=1), b"key")

        resp = client.post("/v1/signal/sig-1/outcome", json={
            "signal_id": "sig-1",
            "event_id": "event-123",
            "outcome": 1,  # Favorable
            "validator_hotkey": "5xxx",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["outcome"] == 1


class TestAnalytics:
    def test_analytics_accepted(self, client: TestClient) -> None:
        resp = client.post("/v1/analytics/attempt", json={
            "event_type": "purchase_attempt",
            "data": {"signal_id": "sig-1"},
        })
        assert resp.status_code == 200
        assert resp.json()["received"] is True


class TestMetricsEndpoint:
    def test_metrics_returns_prometheus_format(self, client: TestClient) -> None:
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers.get("content-type", "")
        text = resp.text
        assert "djinn_validator" in text

    def test_metrics_after_store_share(self, client: TestClient) -> None:
        # Store a share to increment counters
        client.post("/v1/signal", json={
            "signal_id": "met-1",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": "abcdef",
            "encrypted_key_share": "deadbeef",
        })
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "shares_stored" in resp.text


class TestBodySizeLimit:
    def test_oversized_body_rejected(self, client: TestClient) -> None:
        huge_body = "x" * (1_048_576 + 1)
        resp = client.post(
            "/v1/signal",
            content=huge_body,
            headers={"Content-Type": "application/json", "Content-Length": str(len(huge_body))},
        )
        assert resp.status_code == 413


class TestInputValidation:
    """Test that invalid inputs are properly rejected."""

    def test_store_share_missing_fields(self, client: TestClient) -> None:
        resp = client.post("/v1/signal", json={"signal_id": "sig-1"})
        assert resp.status_code == 422

    def test_store_share_invalid_hex(self, client: TestClient) -> None:
        resp = client.post("/v1/signal", json={
            "signal_id": "sig-1",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": "not-hex!",
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 422

    def test_purchase_empty_indices(self, client: TestClient) -> None:
        resp = client.post("/v1/signal/sig-1/purchase", json={
            "buyer_address": "0xBuyer",
            "sportsbook": "DK",
            "available_indices": [],
        })
        assert resp.status_code == 422

    def test_outcome_invalid_value(self, client: TestClient) -> None:
        resp = client.post("/v1/signal/sig-1/outcome", json={
            "signal_id": "sig-1",
            "event_id": "ev-1",
            "outcome": 5,
            "validator_hotkey": "5xxx",
        })
        assert resp.status_code == 422

    def test_analytics_oversized_data(self, client: TestClient) -> None:
        resp = client.post("/v1/analytics/attempt", json={
            "event_type": "test",
            "data": {f"k{i}": i for i in range(60)},
        })
        assert resp.status_code == 422

    def test_mpc_init_coordinator_x_out_of_range(self, client: TestClient) -> None:
        resp = client.post("/v1/mpc/init", json={
            "session_id": "s-1",
            "signal_id": "sig-1",
            "available_indices": [1],
            "coordinator_x": 0,
            "participant_xs": [1, 2],
        })
        assert resp.status_code == 422

    def test_signal_id_rejects_special_chars(self, client: TestClient) -> None:
        """Signal IDs with special characters should be rejected by Pydantic."""
        resp = client.post("/v1/signal", json={
            "signal_id": "sig/../../../etc/passwd",
            "genius_address": "0xGenius",
            "share_x": 1,
            "share_y": "abcdef",
            "encrypted_key_share": "deadbeef",
        })
        assert resp.status_code == 422

    def test_purchase_path_rejects_special_chars(self, client: TestClient) -> None:
        """Signal IDs with spaces/special chars in path should be rejected."""
        resp = client.post("/v1/signal/sig id with spaces/purchase", json={
            "buyer_address": "0xBuyer",
            "sportsbook": "DK",
            "available_indices": [1, 3, 5],
        })
        assert resp.status_code == 400

    def test_outcome_path_rejects_special_chars(self, client: TestClient) -> None:
        resp = client.post("/v1/signal/sig.bad.id/outcome", json={
            "signal_id": "sig-1",
            "event_id": "ev-1",
            "outcome": 1,
            "validator_hotkey": "5xxx",
        })
        assert resp.status_code == 400

    def test_nonexistent_endpoint_returns_404(self, client: TestClient) -> None:
        resp = client.get("/v1/doesnotexist")
        assert resp.status_code in (404, 405)


class TestMPCEndpoints:
    def test_mpc_status_nonexistent_session(self, client: TestClient) -> None:
        resp = client.get("/v1/mpc/nonexistent-session-id/status")
        assert resp.status_code == 404

    def test_mpc_result_nonexistent_session(self, client: TestClient) -> None:
        resp = client.post("/v1/mpc/result", json={
            "session_id": "nonexistent",
            "signal_id": "sig-1",
            "available": True,
            "participating_validators": 3,
        })
        assert resp.status_code == 200
        assert resp.json()["acknowledged"] is False

    def test_mpc_round1_invalid_hex(self, client: TestClient) -> None:
        resp = client.post("/v1/mpc/round1", json={
            "session_id": "s-1",
            "gate_idx": 0,
            "validator_x": 1,
            "d_value": "not-hex!",
            "e_value": "ff",
        })
        assert resp.status_code == 422


class TestReadinessEndpoint:
    def test_readiness_returns_checks(self, client: TestClient) -> None:
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        data = resp.json()
        assert "ready" in data
        assert "checks" in data
        assert isinstance(data["checks"], dict)

    def test_readiness_checks_rpc(self, client: TestClient) -> None:
        resp = client.get("/health/ready")
        data = resp.json()
        # No chain client injected in test → rpc should be False
        assert data["checks"]["rpc"] is False

    def test_readiness_checks_bt_connected(self, client: TestClient) -> None:
        resp = client.get("/health/ready")
        data = resp.json()
        # No neuron in test → bt_connected should be False
        assert data["checks"]["bt_connected"] is False

    def test_readiness_not_ready_without_deps(self, client: TestClient) -> None:
        resp = client.get("/health/ready")
        data = resp.json()
        # Without chain client and neuron, not fully ready
        assert data["ready"] is False

    def test_readiness_rpc_passes_with_chain_client(self, client_with_chain: TestClient) -> None:
        resp = client_with_chain.get("/health/ready")
        data = resp.json()
        assert data["checks"]["rpc"] is True

    def test_health_chain_status_with_mock(self, client_with_chain: TestClient) -> None:
        resp = client_with_chain.get("/health")
        data = resp.json()
        assert data["chain_connected"] is True

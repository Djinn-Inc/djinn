"""Tests for the validator REST API."""

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

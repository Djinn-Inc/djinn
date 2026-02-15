"""Pydantic request/response models for the validator REST API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StoreShareRequest(BaseModel):
    """POST /v1/signal — Accept encrypted key share from a Genius."""

    signal_id: str
    genius_address: str
    share_x: int = Field(ge=1, le=10)
    share_y: str  # Hex-encoded field element
    encrypted_key_share: str  # Hex-encoded encrypted AES key share


class StoreShareResponse(BaseModel):
    signal_id: str
    stored: bool


class PurchaseRequest(BaseModel):
    """POST /v1/signal/{id}/purchase — Buyer requests a signal purchase."""

    buyer_address: str
    sportsbook: str
    available_indices: list[int] = Field(min_length=1, max_length=10)


class PurchaseResponse(BaseModel):
    signal_id: str
    status: str
    available: bool | None = None
    encrypted_key_share: str | None = None  # Hex-encoded, only on success
    message: str = ""


class OutcomeRequest(BaseModel):
    """POST /v1/signal/{id}/outcome — Submit an outcome attestation."""

    signal_id: str
    event_id: str
    outcome: int = Field(ge=0, le=3)  # 0=Pending, 1=Favorable, 2=Unfavorable, 3=Void
    validator_hotkey: str


class OutcomeResponse(BaseModel):
    signal_id: str
    outcome: int
    consensus_reached: bool
    consensus_outcome: int | None = None


class RegisterSignalRequest(BaseModel):
    """POST /v1/signal/{id}/register — Register a purchased signal for outcome tracking."""

    sport: str  # The Odds API sport key, e.g., "basketball_nba"
    event_id: str  # The Odds API event ID
    home_team: str
    away_team: str
    pick: str  # e.g., "Lakers -3.5 (-110)"


class RegisterSignalResponse(BaseModel):
    signal_id: str
    registered: bool
    market: str = ""


class ResolveResponse(BaseModel):
    """POST /v1/signals/resolve — Resolve all pending signals."""

    resolved_count: int
    results: list[dict] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """GET /health — Validator health check."""

    status: str
    version: str = "0.1.0"
    uid: int | None = None
    shares_held: int = 0
    pending_outcomes: int = 0
    chain_connected: bool = False
    bt_connected: bool = False


class AnalyticsRequest(BaseModel):
    """POST /v1/analytics/attempt — Fire-and-forget analytics."""

    event_type: str
    data: dict = Field(default_factory=dict)

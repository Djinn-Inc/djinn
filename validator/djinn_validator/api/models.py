"""Pydantic request/response models for the validator REST API."""

from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

_HEX_RE = re.compile(r"^(0x)?[0-9a-fA-F]+$")
_SIGNAL_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,256}$")
_ETH_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_EVENT_ID_RE = re.compile(r"^[a-zA-Z0-9_\-:.]{1,256}$")


def _validate_hex(v: str, field_name: str) -> str:
    if not _HEX_RE.match(v):
        raise ValueError(f"{field_name} must be a hex string")
    return v


def _validate_signal_id(v: str) -> str:
    if not _SIGNAL_ID_RE.match(v):
        raise ValueError("signal_id must be 1-256 alphanumeric chars, hyphens, or underscores")
    return v


class StoreShareRequest(BaseModel):
    """POST /v1/signal — Accept encrypted key share from a Genius."""

    signal_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    genius_address: str = Field(max_length=256)
    share_x: int = Field(ge=1, le=10)
    share_y: str = Field(max_length=512)  # Hex-encoded field element
    encrypted_key_share: str = Field(max_length=4096)  # Hex-encoded encrypted AES key share

    @field_validator("share_y")
    @classmethod
    def validate_share_y(cls, v: str) -> str:
        return _validate_hex(v, "share_y")

    @field_validator("encrypted_key_share")
    @classmethod
    def validate_encrypted_key_share(cls, v: str) -> str:
        return _validate_hex(v, "encrypted_key_share")


class StoreShareResponse(BaseModel):
    signal_id: str
    stored: bool


class PurchaseRequest(BaseModel):
    """POST /v1/signal/{id}/purchase — Buyer requests a signal purchase."""

    buyer_address: str = Field(max_length=256)
    sportsbook: str = Field(max_length=256)
    available_indices: list[int] = Field(min_length=1, max_length=10)

    @field_validator("buyer_address")
    @classmethod
    def validate_buyer_address(cls, v: str) -> str:
        if not _ETH_ADDRESS_RE.match(v):
            raise ValueError("buyer_address must be a valid Ethereum address (0x + 40 hex chars)")
        return v

    @field_validator("available_indices")
    @classmethod
    def validate_indices_range(cls, v: list[int]) -> list[int]:
        for idx in v:
            if idx < 1 or idx > 10:
                raise ValueError(f"available_indices values must be 1-10, got {idx}")
        if len(set(v)) != len(v):
            raise ValueError("available_indices must not contain duplicates")
        return v


class PurchaseResponse(BaseModel):
    signal_id: str
    status: str
    available: bool | None = None
    encrypted_key_share: str | None = None  # Hex-encoded, only on success
    message: str = ""


class OutcomeRequest(BaseModel):
    """POST /v1/signal/{id}/outcome — Submit an outcome attestation."""

    signal_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    event_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-:.]+$")
    outcome: int = Field(ge=0, le=3)  # 0=Pending, 1=Favorable, 2=Unfavorable, 3=Void
    validator_hotkey: str = Field(max_length=256)


class OutcomeResponse(BaseModel):
    signal_id: str
    outcome: int
    consensus_reached: bool
    consensus_outcome: int | None = None


class RegisterSignalRequest(BaseModel):
    """POST /v1/signal/{id}/register — Register a purchased signal for outcome tracking."""

    sport: str = Field(max_length=128)  # The Odds API sport key, e.g., "basketball_nba"
    event_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-:.]+$")  # The Odds API event ID
    home_team: str = Field(max_length=256)
    away_team: str = Field(max_length=256)
    pick: str = Field(max_length=512)  # e.g., "Lakers -3.5 (-110)"


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


class ReadinessResponse(BaseModel):
    """GET /health/ready — Deep readiness probe."""

    ready: bool
    checks: dict[str, bool] = Field(default_factory=dict)


class AnalyticsRequest(BaseModel):
    """POST /v1/analytics/attempt — Fire-and-forget analytics."""

    event_type: str = Field(max_length=128)
    data: dict = Field(default_factory=dict, max_length=50)


# ---------------------------------------------------------------------------
# MPC Coordination Models (inter-validator communication)
# ---------------------------------------------------------------------------


class MPCInitRequest(BaseModel):
    """POST /v1/mpc/init — Coordinator invites this validator to an MPC session."""

    session_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    signal_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    available_indices: list[int] = Field(max_length=10)
    coordinator_x: int = Field(ge=1, le=255)
    participant_xs: list[int] = Field(max_length=20)
    threshold: int = Field(default=7, ge=1, le=20)
    # This validator's Beaver triple shares (one dict per gate)
    triple_shares: list[dict[str, str]] = Field(default_factory=list, max_length=20)  # hex-encoded


class MPCInitResponse(BaseModel):
    session_id: str
    accepted: bool
    message: str = ""


class MPCRound1Request(BaseModel):
    """POST /v1/mpc/round1 — Submit Round 1 message (d, e values) for a gate."""

    session_id: str = Field(max_length=256)
    gate_idx: int = Field(ge=0, le=20)
    validator_x: int = Field(ge=1, le=255)
    d_value: str = Field(max_length=260)  # Hex-encoded
    e_value: str = Field(max_length=260)  # Hex-encoded

    @field_validator("d_value", "e_value")
    @classmethod
    def validate_hex(cls, v: str) -> str:
        return _validate_hex(v, "d_value/e_value")


class MPCRound1Response(BaseModel):
    session_id: str
    gate_idx: int
    accepted: bool


class MPCResultRequest(BaseModel):
    """POST /v1/mpc/result — Coordinator broadcasts the opened result."""

    session_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    signal_id: str = Field(max_length=256, pattern=r"^[a-zA-Z0-9_\-]+$")
    available: bool
    participating_validators: int = Field(ge=0, le=255)


class MPCResultResponse(BaseModel):
    session_id: str
    acknowledged: bool


class MPCSessionStatusResponse(BaseModel):
    """GET /v1/mpc/{session_id}/status — Check MPC session status."""

    session_id: str
    status: str
    available: bool | None = None
    participants_responded: int = 0
    total_participants: int = 0

"""Pydantic request/response models for the miner REST API."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

_VALID_MARKETS = {"spreads", "totals", "h2h"}


class CandidateLine(BaseModel):
    """A single candidate line from the 10-line set sent by validators.

    Each line represents a specific bet at a specific event. The miner
    checks if this exact line (within tolerance) is available at any sportsbook.
    """

    index: int = Field(ge=1, le=10, description="Line index (1-10)")
    sport: str = Field(max_length=128, description="Sport key, e.g. 'basketball_nba'")
    event_id: str = Field(max_length=256, description="Unique event identifier")
    home_team: str = Field(max_length=256, description="Home team name")
    away_team: str = Field(max_length=256, description="Away team name")
    market: str = Field(max_length=64, description="Market type: 'spreads', 'totals', or 'h2h'")
    line: float | None = Field(
        default=None,
        description="Line value (e.g. -3.0 for spreads, 218.5 for totals). None for h2h.",
    )
    side: str = Field(
        max_length=256,
        description="Which side: team name for spreads/h2h, 'Over'/'Under' for totals",
    )

    @field_validator("market")
    @classmethod
    def validate_market(cls, v: str) -> str:
        if v not in _VALID_MARKETS:
            raise ValueError(f"market must be one of {_VALID_MARKETS}, got '{v}'")
        return v


class CheckRequest(BaseModel):
    """POST /v1/check — Receive 10 candidate lines, return availability."""

    lines: list[CandidateLine] = Field(
        min_length=1,
        max_length=10,
        description="Up to 10 candidate lines to check",
    )


class BookmakerAvailability(BaseModel):
    """Availability of a single line at a specific bookmaker."""

    bookmaker: str
    odds: float = Field(description="Decimal odds offered")


class LineResult(BaseModel):
    """Result for a single candidate line."""

    index: int = Field(ge=1, le=10)
    available: bool
    bookmakers: list[BookmakerAvailability] = Field(default_factory=list, max_length=50)


class CheckResponse(BaseModel):
    """Response to a line availability check."""

    results: list[LineResult]
    available_indices: list[int] = Field(
        description="Indices of lines that are available at 1+ sportsbooks",
    )
    response_time_ms: float = Field(description="Time taken to process the request in ms")


class ProofRequest(BaseModel):
    """POST /v1/proof — Request proof generation for a previous check query."""

    query_id: str = Field(max_length=256, description="ID of the original check query")
    session_data: str = Field(default="", max_length=10_000, description="Optional session data for fallback proof")


class ProofResponse(BaseModel):
    """Response from proof submission."""

    query_id: str
    proof_hash: str = Field(description="Hash of the generated proof")
    status: str = Field(description="'submitted', 'verified', 'failed'")
    message: str = ""


class HealthResponse(BaseModel):
    """GET /health — Miner health check."""

    status: str
    version: str = "0.1.0"
    uid: int | None = None
    odds_api_connected: bool = False
    bt_connected: bool = False
    uptime_seconds: float = 0.0


class ReadinessResponse(BaseModel):
    """GET /health/ready — Deep readiness probe."""

    ready: bool
    checks: dict[str, bool] = Field(default_factory=dict)

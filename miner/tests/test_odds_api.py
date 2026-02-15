"""Tests for The Odds API client."""

from __future__ import annotations

import time

import httpx
import pytest

from djinn_miner.data.odds_api import BookmakerOdds, CachedOdds, OddsApiClient


@pytest.fixture
def client(mock_odds_response: list[dict]) -> OddsApiClient:
    """Create an OddsApiClient with a mock HTTP client."""
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=mock_odds_response)
        )
    )
    return OddsApiClient(
        api_key="test-key",
        base_url="https://api.the-odds-api.com",
        cache_ttl=30,
        http_client=mock_http,
    )


@pytest.mark.asyncio
async def test_get_odds_fetches_data(client: OddsApiClient, mock_odds_response: list[dict]) -> None:
    result = await client.get_odds("basketball_nba")
    assert len(result) == len(mock_odds_response)
    assert result[0]["id"] == "event-lakers-celtics-001"


@pytest.mark.asyncio
async def test_get_odds_uses_cache(client: OddsApiClient) -> None:
    result1 = await client.get_odds("basketball_nba")
    result2 = await client.get_odds("basketball_nba")
    assert result1 is result2


@pytest.mark.asyncio
async def test_get_odds_cache_expires(mock_odds_response: list[dict]) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=mock_odds_response)

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    c = OddsApiClient(api_key="test", cache_ttl=0, http_client=mock_http)

    await c.get_odds("basketball_nba")
    await c.get_odds("basketball_nba")
    assert call_count == 2


@pytest.mark.asyncio
async def test_get_odds_resolves_sport_key(mock_odds_response: list[dict]) -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(200, json=mock_odds_response)

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    c = OddsApiClient(api_key="test", http_client=mock_http)

    await c.get_odds("football_nfl")
    assert "americanfootball_nfl" in requested_urls[0]


@pytest.mark.asyncio
async def test_get_odds_http_error() -> None:
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(401, json={"error": "unauthorized"})
        )
    )
    c = OddsApiClient(api_key="bad-key", http_client=mock_http)

    with pytest.raises(httpx.HTTPStatusError):
        await c.get_odds("basketball_nba")


def test_parse_bookmaker_odds_all_events(client: OddsApiClient, mock_odds_response: list[dict]) -> None:
    result = client.parse_bookmaker_odds(mock_odds_response)
    assert len(result) > 0
    assert all(isinstance(o, BookmakerOdds) for o in result)


def test_parse_bookmaker_odds_filter_by_event_id(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        event_id="event-lakers-celtics-001",
    )
    # Should only include odds from the Lakers-Celtics event
    bookmakers_with_data = {o.bookmaker_key for o in result}
    assert "fanduel" in bookmakers_with_data
    assert "draftkings" in bookmakers_with_data


def test_parse_bookmaker_odds_filter_by_teams(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        home_team="Miami Heat",
        away_team="Golden State Warriors",
    )
    # Heat-Warriors event only has FanDuel
    bookmakers = {o.bookmaker_key for o in result}
    assert bookmakers == {"fanduel"}


def test_parse_bookmaker_odds_team_match_case_insensitive(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        home_team="miami heat",
        away_team="golden state warriors",
    )
    assert len(result) > 0


def test_parse_bookmaker_odds_no_match(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        event_id="nonexistent-event",
        home_team="Fake Team",
        away_team="Other Fake Team",
    )
    assert len(result) == 0


def test_parse_bookmaker_odds_spreads_have_points(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        event_id="event-lakers-celtics-001",
    )
    spreads = [o for o in result if o.market == "spreads"]
    assert len(spreads) > 0
    assert all(o.point is not None for o in spreads)


def test_parse_bookmaker_odds_h2h_no_points(
    client: OddsApiClient, mock_odds_response: list[dict]
) -> None:
    result = client.parse_bookmaker_odds(
        mock_odds_response,
        event_id="event-lakers-celtics-001",
    )
    h2h = [o for o in result if o.market == "h2h"]
    assert len(h2h) > 0
    assert all(o.point is None for o in h2h)


def test_clear_cache(client: OddsApiClient) -> None:
    # Seed cache manually
    client._cache["test_key"] = CachedOdds(data=[{}], expires_at=time.monotonic() + 100)
    assert len(client._cache) == 1
    client.clear_cache()
    assert len(client._cache) == 0


@pytest.mark.asyncio
async def test_get_odds_captures_session(mock_odds_response: list[dict]) -> None:
    """When a SessionCapture is provided, get_odds should record the raw response."""
    from djinn_miner.core.proof import SessionCapture

    capture = SessionCapture()
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=mock_odds_response)
        )
    )
    c = OddsApiClient(
        api_key="test-key",
        cache_ttl=0,
        http_client=mock_http,
        session_capture=capture,
    )

    await c.get_odds("basketball_nba")
    assert capture.count == 1


@pytest.mark.asyncio
async def test_get_odds_no_capture_when_cached(mock_odds_response: list[dict]) -> None:
    """Cached responses should NOT trigger session capture (no HTTP call made)."""
    from djinn_miner.core.proof import SessionCapture

    capture = SessionCapture()
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=mock_odds_response)
        )
    )
    c = OddsApiClient(
        api_key="test-key",
        cache_ttl=60,
        http_client=mock_http,
        session_capture=capture,
    )

    await c.get_odds("basketball_nba")
    assert capture.count == 1  # First call captured

    await c.get_odds("basketball_nba")
    assert capture.count == 1  # Second call used cache, no new capture


@pytest.mark.asyncio
async def test_captured_session_strips_api_key(mock_odds_response: list[dict]) -> None:
    """The API key should not appear in the captured session params."""
    from djinn_miner.core.proof import SessionCapture

    capture = SessionCapture()
    mock_http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=mock_odds_response)
        )
    )
    c = OddsApiClient(
        api_key="secret-key-123",
        cache_ttl=0,
        http_client=mock_http,
        session_capture=capture,
    )

    await c.get_odds("basketball_nba")

    # Get the captured session
    sessions = list(capture._sessions.values())
    assert len(sessions) == 1
    session = sessions[0]
    assert "apiKey" not in session.request_params
    assert "secret-key-123" not in str(session.request_params)

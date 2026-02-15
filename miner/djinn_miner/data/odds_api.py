"""The Odds API integration for real-time sportsbook odds.

Queries api.the-odds-api.com/v4/sports/{sport}/odds to fetch live odds
from multiple bookmakers. Caches responses for a configurable TTL.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import httpx
import structlog

if TYPE_CHECKING:
    from djinn_miner.core.proof import SessionCapture

log = structlog.get_logger()

# Supported sports mapped to The Odds API sport keys
SUPPORTED_SPORTS: dict[str, str] = {
    "basketball_nba": "basketball_nba",
    "football_nfl": "americanfootball_nfl",
    "football_ncaaf": "americanfootball_ncaaf",
    "basketball_ncaab": "basketball_ncaab",
    "baseball_mlb": "baseball_mlb",
    "hockey_nhl": "icehockey_nhl",
    "soccer_epl": "soccer_epl",
    "mma_ufc": "mma_mixed_martial_arts",
}


@dataclass
class CachedOdds:
    """A cached odds response with its expiry time."""

    data: list[dict[str, Any]]
    expires_at: float


@dataclass
class BookmakerOdds:
    """Parsed odds from a single bookmaker for a single outcome."""

    bookmaker_key: str
    bookmaker_title: str
    market: str  # "spreads", "totals", "h2h"
    name: str  # Team name or "Over"/"Under"
    price: float  # Decimal odds
    point: float | None = None  # Spread or total line value


class OddsApiClient:
    """Async client for The Odds API with response caching."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.the-odds-api.com",
        cache_ttl: int = 30,
        http_client: httpx.AsyncClient | None = None,
        session_capture: SessionCapture | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._cache_ttl = cache_ttl
        self._cache: dict[str, CachedOdds] = {}
        self._client = http_client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = http_client is None
        self._session_capture = session_capture

    async def close(self) -> None:
        """Close the HTTP client if we own it."""
        if self._owns_client:
            await self._client.aclose()

    def _resolve_sport_key(self, sport: str) -> str:
        """Map an internal sport key to The Odds API sport key."""
        return SUPPORTED_SPORTS.get(sport, sport)

    async def get_odds(
        self,
        sport: str,
        markets: str = "spreads,totals,h2h",
    ) -> list[dict[str, Any]]:
        """Fetch live odds for a sport from The Odds API.

        Returns raw event data from the API, using cache when available.
        """
        api_sport = self._resolve_sport_key(sport)
        cache_key = f"{api_sport}:{markets}"

        cached = self._cache.get(cache_key)
        if cached and cached.expires_at > time.monotonic():
            log.debug("odds_cache_hit", sport=api_sport)
            return cached.data

        url = f"{self._base_url}/v4/sports/{api_sport}/odds"
        params = {
            "apiKey": self._api_key,
            "regions": "us",
            "markets": markets,
            "oddsFormat": "decimal",
        }

        try:
            resp = await self._client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            log.error("odds_api_http_error", status=e.response.status_code, sport=api_sport)
            raise
        except httpx.RequestError as e:
            log.error("odds_api_request_error", error=str(e), sport=api_sport)
            raise

        # Capture the raw HTTP session for proof generation
        if self._session_capture is not None:
            from djinn_miner.core.proof import CapturedSession

            # Strip API key from URL for the proof record
            safe_url = url  # params are separate, URL itself has no key
            query_id = f"{api_sport}:{markets}:{uuid.uuid4().hex[:8]}"
            self._session_capture.record(
                CapturedSession(
                    query_id=query_id,
                    request_url=safe_url,
                    request_params={k: v for k, v in params.items() if k != "apiKey"},
                    response_status=resp.status_code,
                    response_body=resp.content,
                    response_headers=dict(resp.headers),
                )
            )

        self._cache[cache_key] = CachedOdds(
            data=data,
            expires_at=time.monotonic() + self._cache_ttl,
        )

        log.info("odds_fetched", sport=api_sport, events=len(data))
        return data

    def parse_bookmaker_odds(
        self,
        events: list[dict[str, Any]],
        event_id: str | None = None,
        home_team: str | None = None,
        away_team: str | None = None,
    ) -> list[BookmakerOdds]:
        """Parse raw API events into structured BookmakerOdds.

        Filters to a specific event if event_id or team names are provided.
        """
        results: list[BookmakerOdds] = []

        for event in events:
            if event_id and event.get("id") != event_id:
                # Also try matching by teams if event_id doesn't match
                if not self._teams_match(event, home_team, away_team):
                    continue
            elif home_team and away_team:
                if not self._teams_match(event, home_team, away_team):
                    continue

            for bookmaker in event.get("bookmakers", []):
                bk_key = bookmaker.get("key", "")
                bk_title = bookmaker.get("title", bk_key)

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key", "")
                    for outcome in market.get("outcomes", []):
                        results.append(
                            BookmakerOdds(
                                bookmaker_key=bk_key,
                                bookmaker_title=bk_title,
                                market=market_key,
                                name=outcome.get("name", ""),
                                price=float(outcome.get("price", 0)),
                                point=outcome.get("point"),
                            )
                        )

        return results

    @staticmethod
    def _teams_match(
        event: dict[str, Any],
        home_team: str | None,
        away_team: str | None,
    ) -> bool:
        """Check if an event matches the given team names (case-insensitive)."""
        if not home_team or not away_team:
            return False
        ev_home = (event.get("home_team") or "").lower()
        ev_away = (event.get("away_team") or "").lower()
        return ev_home == home_team.lower() and ev_away == away_team.lower()

    def clear_cache(self) -> None:
        """Clear all cached data."""
        self._cache.clear()

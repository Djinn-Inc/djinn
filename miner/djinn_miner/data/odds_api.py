"""The Odds API integration for real-time sportsbook odds.

Queries api.the-odds-api.com/v4/sports/{sport}/odds to fetch live odds
from multiple bookmakers. Caches responses for a configurable TTL.
"""

from __future__ import annotations

import asyncio
import math
import random
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
class CachedError:
    """A cached error response — re-raised on cache hit to prevent retry storms."""

    error: Exception
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
    """Async client for The Odds API with response caching and retry."""

    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 0.5  # seconds
    RETRY_MAX_DELAY = 8.0  # seconds
    MAX_CACHE_ENTRIES = 100
    ERROR_CACHE_TTL = 10  # seconds — short TTL for failed responses

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.the-odds-api.com",
        cache_ttl: int = 30,
        http_client: httpx.AsyncClient | None = None,
        session_capture: SessionCapture | None = None,
        max_retries: int = MAX_RETRIES,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._cache_ttl = cache_ttl
        self._cache: dict[str, CachedOdds] = {}
        self._error_cache: dict[str, CachedError] = {}
        self._cache_lock = asyncio.Lock()
        self._client = http_client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = http_client is None
        self._session_capture = session_capture
        self._max_retries = max_retries

    async def close(self) -> None:
        """Close the HTTP client if we own it."""
        if self._owns_client:
            await self._client.aclose()

    def _evict_stale_cache(self) -> None:
        """Remove expired entries and enforce max cache size."""
        now = time.monotonic()
        stale = [k for k, v in self._cache.items() if v.expires_at <= now]
        for k in stale:
            del self._cache[k]
        stale_errors = [k for k, v in self._error_cache.items() if v.expires_at <= now]
        for k in stale_errors:
            del self._error_cache[k]
        if len(self._cache) > self.MAX_CACHE_ENTRIES:
            oldest = sorted(self._cache, key=lambda k: self._cache[k].expires_at)
            for k in oldest[: len(self._cache) - self.MAX_CACHE_ENTRIES]:
                del self._cache[k]

    async def _request_with_retry(
        self,
        url: str,
        params: dict[str, str],
        sport: str,
    ) -> httpx.Response:
        """Execute an HTTP GET with exponential backoff retry.

        Retries on network errors and 5xx responses. Does NOT retry 4xx
        (client errors like 401/429 won't fix themselves).
        """
        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                resp = await self._client.get(url, params=params)
                if resp.status_code < 500:
                    resp.raise_for_status()
                    return resp
                # 5xx: retry
                log.warning(
                    "odds_api_server_error",
                    status=resp.status_code,
                    sport=sport,
                    attempt=attempt + 1,
                )
                last_exc = httpx.HTTPStatusError(
                    f"Server error {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
            except httpx.HTTPStatusError:
                raise  # 4xx — don't retry
            except httpx.RequestError as e:
                log.warning(
                    "odds_api_request_error",
                    error=str(e),
                    sport=sport,
                    attempt=attempt + 1,
                )
                last_exc = e

            if attempt < self._max_retries:
                delay = min(
                    self.RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5),
                    self.RETRY_MAX_DELAY,
                )
                await asyncio.sleep(delay)

        log.error(
            "odds_api_retries_exhausted",
            sport=sport,
            url=url,
            attempts=self._max_retries + 1,
            last_error=str(last_exc),
        )
        raise last_exc  # type: ignore[misc]

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
        Uses an asyncio lock to prevent duplicate API calls on cache miss.
        """
        api_sport = self._resolve_sport_key(sport)
        cache_key = f"{api_sport}:{markets}"

        from djinn_miner.api.metrics import CACHE_OPERATIONS

        now = time.monotonic()

        # Fast path: check cache without lock
        cached = self._cache.get(cache_key)
        if cached and cached.expires_at > now:
            CACHE_OPERATIONS.labels(result="hit").inc()
            log.debug("odds_cache_hit", sport=api_sport)
            return cached.data

        # Fast path: check error cache — re-raise to avoid retry storms
        cached_err = self._error_cache.get(cache_key)
        if cached_err and cached_err.expires_at > now:
            CACHE_OPERATIONS.labels(result="hit").inc()
            log.debug("odds_error_cache_hit", sport=api_sport)
            raise cached_err.error

        async with self._cache_lock:
            now = time.monotonic()
            # Re-check under lock (another coroutine may have populated it)
            cached = self._cache.get(cache_key)
            if cached and cached.expires_at > now:
                CACHE_OPERATIONS.labels(result="hit").inc()
                log.debug("odds_cache_hit", sport=api_sport)
                return cached.data
            cached_err = self._error_cache.get(cache_key)
            if cached_err and cached_err.expires_at > now:
                CACHE_OPERATIONS.labels(result="hit").inc()
                raise cached_err.error
            CACHE_OPERATIONS.labels(result="miss").inc()

            url = f"{self._base_url}/v4/sports/{api_sport}/odds"
            params = {
                "apiKey": self._api_key,
                "regions": "us",
                "markets": markets,
                "oddsFormat": "decimal",
            }

            try:
                resp = await self._request_with_retry(url, params, api_sport)
            except Exception as exc:
                self._evict_stale_cache()
                self._error_cache[cache_key] = CachedError(
                    error=exc,
                    expires_at=time.monotonic() + self.ERROR_CACHE_TTL,
                )
                raise
            try:
                data = resp.json()
            except Exception as exc:
                log.error("odds_api_json_decode_error", sport=api_sport, error=str(exc))
                self._evict_stale_cache()
                self._error_cache[cache_key] = CachedError(
                    error=exc,
                    expires_at=time.monotonic() + self.ERROR_CACHE_TTL,
                )
                raise

            # Capture the raw HTTP session for proof generation
            if self._session_capture is not None:
                from djinn_miner.core.proof import CapturedSession

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

            self._evict_stale_cache()
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
            if not isinstance(event, dict):
                continue
            if event_id and event.get("id") != event_id:
                # Also try matching by teams if event_id doesn't match
                if not self._teams_match(event, home_team, away_team):
                    continue
            elif home_team and away_team:
                if not self._teams_match(event, home_team, away_team):
                    continue

            for bookmaker in event.get("bookmakers", []):
                if not isinstance(bookmaker, dict):
                    continue
                bk_key = bookmaker.get("key", "")
                bk_title = bookmaker.get("title", bk_key)

                for market in bookmaker.get("markets", []):
                    if not isinstance(market, dict):
                        continue
                    market_key = market.get("key", "")
                    for outcome in market.get("outcomes", []):
                        if not isinstance(outcome, dict):
                            continue
                        try:
                            price = float(outcome.get("price", 0))
                        except (ValueError, TypeError):
                            log.debug(
                                "invalid_odds_price",
                                bookmaker=bk_key,
                                raw_price=outcome.get("price"),
                            )
                            price = 0.0
                        if not math.isfinite(price):
                            price = 0.0
                        raw_point = outcome.get("point")
                        point: float | None = None
                        if raw_point is not None:
                            try:
                                point = float(raw_point)
                                if not math.isfinite(point):
                                    point = None
                            except (ValueError, TypeError):
                                point = None
                        results.append(
                            BookmakerOdds(
                                bookmaker_key=bk_key,
                                bookmaker_title=bk_title,
                                market=market_key,
                                name=outcome.get("name", ""),
                                price=price,
                                point=point,
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
        self._error_cache.clear()

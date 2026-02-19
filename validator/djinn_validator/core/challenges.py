"""Miner challenge system — proactively tests miners for accuracy scoring.

Each epoch, the validator:
1. Picks an active sport and fetches current odds from The Odds API
2. Constructs a challenge with known-available lines (ground truth)
3. Sends the challenge to each miner's POST /v1/check endpoint
4. Compares each miner's response against ground truth
5. Records accuracy, latency, and proof submission via MinerScorer

This is the only path that populates accuracy, speed, and coverage metrics.
Without it, only uptime (health checks) is scored.
"""

from __future__ import annotations

import random
import time

import httpx
import structlog

from djinn_validator.core.scoring import MinerScorer

log = structlog.get_logger()

# Sports that The Odds API supports and we challenge on
CHALLENGE_SPORTS = [
    "basketball_nba",
    "americanfootball_nfl",
    "baseball_mlb",
    "icehockey_nhl",
]

# Limit challenges per epoch to conserve API quota
MAX_CHALLENGES_PER_EPOCH = 1


async def fetch_challenge_odds(
    api_key: str,
    sport: str,
    client: httpx.AsyncClient,
) -> list[dict]:
    """Fetch current odds from The Odds API for a sport.

    Returns a list of event dicts with bookmaker odds, or empty list on failure.
    """
    url = f"https://api.the-odds-api.com/v4/sports/{sport}/odds"
    params = {
        "apiKey": api_key,
        "regions": "us",
        "markets": "spreads,totals,h2h",
        "oddsFormat": "decimal",
    }
    try:
        resp = await client.get(url, params=params, timeout=10.0)
        if resp.status_code != 200:
            log.debug("challenge_odds_fetch_failed", sport=sport, status=resp.status_code)
            return []
        return resp.json()
    except Exception as e:
        log.debug("challenge_odds_fetch_error", sport=sport, err=str(e))
        return []


def build_challenge_lines(events: list[dict], sport: str) -> list[dict]:
    """Build a set of 10 candidate lines from real event data.

    Picks lines that we know are available (ground truth = available) and
    mixes in some synthetic lines that should NOT be available (ground truth = unavailable).
    """
    available_lines: list[dict] = []

    for event in events:
        event_id = event.get("id", "")
        home = event.get("home_team", "")
        away = event.get("away_team", "")
        if not event_id or not home or not away:
            continue

        for bm in event.get("bookmakers", []):
            for market in bm.get("markets", []):
                market_key = market.get("key", "")
                if market_key not in ("spreads", "totals", "h2h"):
                    continue
                for outcome in market.get("outcomes", []):
                    line_val = outcome.get("point")
                    side = outcome.get("name", "")
                    odds = outcome.get("price", 0)
                    if not side or odds <= 1.0:
                        continue
                    available_lines.append({
                        "sport": sport,
                        "event_id": event_id,
                        "home_team": home,
                        "away_team": away,
                        "market": market_key,
                        "line": line_val,
                        "side": side,
                        "bookmaker": bm.get("key", ""),
                        "odds": odds,
                        "ground_truth_available": True,
                    })

    if not available_lines:
        return []

    # Select up to 7 real available lines
    real_count = min(7, len(available_lines))
    selected = random.sample(available_lines, real_count)

    # Create synthetic unavailable lines (fake event IDs or extreme lines)
    synthetic_count = min(10 - real_count, 3)
    for i in range(synthetic_count):
        base = random.choice(available_lines)
        selected.append({
            "sport": sport,
            "event_id": f"fake_{base['event_id']}_{i}",
            "home_team": base["home_team"],
            "away_team": base["away_team"],
            "market": base["market"],
            "line": (base.get("line") or 0) + 999.5,  # Extreme line nobody offers
            "side": base["side"],
            "bookmaker": "",
            "odds": 0,
            "ground_truth_available": False,
        })

    # Shuffle and assign indices 1-10
    random.shuffle(selected)
    for i, line in enumerate(selected):
        line["index"] = i + 1

    return selected[:10]


async def challenge_miners(
    scorer: MinerScorer,
    miner_axons: list[dict],
    api_key: str,
) -> int:
    """Run a scoring challenge against all reachable miners.

    Returns the number of miners successfully challenged.
    """
    if not api_key:
        return 0

    # Pick a random sport
    sport = random.choice(CHALLENGE_SPORTS)

    async with httpx.AsyncClient() as client:
        # Fetch ground truth from The Odds API
        events = await fetch_challenge_odds(api_key, sport, client)
        if not events:
            log.debug("no_challenge_events", sport=sport)
            return 0

        challenge_lines = build_challenge_lines(events, sport)
        if len(challenge_lines) < 3:
            log.debug("insufficient_challenge_lines", sport=sport, count=len(challenge_lines))
            return 0

        # Build ground truth set
        ground_truth: dict[int, bool] = {
            line["index"]: line["ground_truth_available"]
            for line in challenge_lines
        }

        # Build the check request payload (matching miner's CheckRequest model)
        check_payload = {
            "lines": [
                {
                    "index": line["index"],
                    "sport": line["sport"],
                    "event_id": line["event_id"],
                    "home_team": line["home_team"],
                    "away_team": line["away_team"],
                    "market": line["market"],
                    "line": line.get("line"),
                    "side": line["side"],
                }
                for line in challenge_lines
            ]
        }

        challenged = 0
        for axon in miner_axons:
            uid = axon["uid"]
            hotkey = axon["hotkey"]
            ip = axon.get("ip", "")
            port = axon.get("port", 0)

            if not ip or not port:
                continue

            metrics = scorer.get_or_create(uid, hotkey)
            url = f"http://{ip}:{port}/v1/check"

            start = time.perf_counter()
            try:
                resp = await client.post(url, json=check_payload, timeout=10.0)
                latency = time.perf_counter() - start

                if resp.status_code != 200:
                    metrics.record_query(
                        correct=False,
                        latency=latency,
                        proof_submitted=False,
                    )
                    log.debug(
                        "challenge_miner_error",
                        uid=uid,
                        status=resp.status_code,
                        latency_s=round(latency, 3),
                    )
                    challenged += 1
                    continue

                data = resp.json()
                miner_available = set(data.get("available_indices", []))

                # Score: count correct answers
                correct_count = 0
                total_count = len(ground_truth)
                for idx, expected in ground_truth.items():
                    miner_says_available = idx in miner_available
                    if miner_says_available == expected:
                        correct_count += 1

                accuracy = correct_count / total_count if total_count > 0 else 0.0
                # Consider "correct" if accuracy >= 70%
                is_correct = accuracy >= 0.7

                metrics.record_query(
                    correct=is_correct,
                    latency=latency,
                    proof_submitted=False,  # Phase 2 proof not yet implemented
                )

                log.info(
                    "challenge_miner_scored",
                    uid=uid,
                    accuracy=round(accuracy, 2),
                    correct=correct_count,
                    total=total_count,
                    latency_s=round(latency, 3),
                )
                challenged += 1

            except httpx.HTTPError as e:
                latency = time.perf_counter() - start
                metrics.record_query(
                    correct=False,
                    latency=latency,
                    proof_submitted=False,
                )
                log.debug(
                    "challenge_miner_unreachable",
                    uid=uid,
                    err=str(e),
                    latency_s=round(latency, 3),
                )
                challenged += 1

    if challenged:
        log.info("challenge_round_complete", sport=sport, miners_challenged=challenged)
    return challenged

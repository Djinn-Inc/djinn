"""Miner scoring module — implements the 4-metric system from PDF v9.

Active epoch weights:
  - Accuracy: 40%  (Phase 1 matches TLSNotary ground truth)
  - Speed:    25%  (Response latency, normalized across miners)
  - Coverage: 20%  (% of queries with valid TLSNotary proof)
  - Uptime:   15%  (% of epochs responding to health checks)

Empty epoch weights (no active signals):
  - Uptime:  50%
  - History: 50%  (Consecutive participation, log-scaled)
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import structlog

log = structlog.get_logger()


@dataclass
class MinerMetrics:
    """Accumulated metrics for a single miner within a scoring window."""

    uid: int
    hotkey: str

    # Accuracy: count of correct vs total queries
    queries_total: int = 0
    queries_correct: int = 0  # Phase 1 matched TLSNotary truth

    # Speed: list of response latencies (seconds)
    latencies: list[float] = field(default_factory=list)

    # Coverage: queries where miner submitted valid TLSNotary proof
    proofs_submitted: int = 0

    # Uptime: health check responses
    health_checks_total: int = 0
    health_checks_responded: int = 0

    # History: consecutive epochs participated
    consecutive_epochs: int = 0

    def accuracy_score(self) -> float:
        """Fraction of queries where Phase 1 result matched ground truth."""
        if self.queries_total == 0:
            return 0.0
        return self.queries_correct / self.queries_total

    def coverage_score(self) -> float:
        """Fraction of queries with valid TLSNotary proof."""
        if self.queries_total == 0:
            return 0.0
        return self.proofs_submitted / self.queries_total

    def uptime_score(self) -> float:
        """Fraction of health checks responded to."""
        if self.health_checks_total == 0:
            return 0.0
        return self.health_checks_responded / self.health_checks_total

    def record_query(
        self,
        correct: bool,
        latency: float,
        proof_submitted: bool,
    ) -> None:
        """Record a single query result."""
        self.queries_total += 1
        if correct:
            self.queries_correct += 1
        self.latencies.append(latency)
        if proof_submitted:
            self.proofs_submitted += 1

    def record_health_check(self, responded: bool) -> None:
        """Record a health check result."""
        self.health_checks_total += 1
        if responded:
            self.health_checks_responded += 1


class MinerScorer:
    """Computes normalized scores across all miners for weight setting."""

    # Active epoch weights (from PDF v9 / DEVIATIONS DEV-001)
    W_ACCURACY = 0.40
    W_SPEED = 0.25
    W_COVERAGE = 0.20
    W_UPTIME = 0.15

    # Empty epoch weights
    W_EMPTY_UPTIME = 0.50
    W_EMPTY_HISTORY = 0.50

    def __init__(self) -> None:
        self._miners: dict[int, MinerMetrics] = {}

    def get_or_create(self, uid: int, hotkey: str) -> MinerMetrics:
        """Get or create metrics for a miner."""
        if uid not in self._miners:
            self._miners[uid] = MinerMetrics(uid=uid, hotkey=hotkey)
        return self._miners[uid]

    def remove(self, uid: int) -> None:
        """Remove a deregistered miner."""
        self._miners.pop(uid, None)

    def compute_weights(self, is_active_epoch: bool) -> dict[int, float]:
        """Compute normalized weights for all tracked miners.

        Returns:
            Mapping of miner UID -> weight (0.0 to 1.0), normalized to sum to 1.
        """
        if not self._miners:
            return {}

        if is_active_epoch:
            return self._compute_active_weights()
        return self._compute_empty_weights()

    def _compute_active_weights(self) -> dict[int, float]:
        miners = list(self._miners.values())

        # Normalize speed: fastest gets 1.0, slowest gets 0.0
        speed_scores = self._normalize_speed(miners)

        raw: dict[int, float] = {}
        for m in miners:
            score = (
                self.W_ACCURACY * m.accuracy_score()
                + self.W_SPEED * speed_scores.get(m.uid, 0.0)
                + self.W_COVERAGE * m.coverage_score()
                + self.W_UPTIME * m.uptime_score()
            )
            raw[m.uid] = score

        return self._normalize(raw)

    def _compute_empty_weights(self) -> dict[int, float]:
        miners = list(self._miners.values())
        max_history = max((m.consecutive_epochs for m in miners), default=1)

        raw: dict[int, float] = {}
        for m in miners:
            # Log-scaled history: log(1 + epochs) / log(1 + max_epochs)
            history = (
                math.log1p(m.consecutive_epochs) / math.log1p(max_history)
                if max_history > 0
                else 0.0
            )
            score = (
                self.W_EMPTY_UPTIME * m.uptime_score()
                + self.W_EMPTY_HISTORY * history
            )
            raw[m.uid] = score

        return self._normalize(raw)

    def _normalize_speed(self, miners: list[MinerMetrics]) -> dict[int, float]:
        """Normalize speed scores: fastest miner gets 1.0, slowest gets 0.0.

        Returns uniform 1.0 scores for all miners when no latencies are recorded,
        so that speed doesn't unfairly penalize miners during low-activity epochs.
        """
        avg_latencies: dict[int, float] = {}
        for m in miners:
            if m.latencies:
                avg_latencies[m.uid] = sum(m.latencies) / len(m.latencies)

        if not avg_latencies:
            return {m.uid: 1.0 for m in miners}

        min_lat = min(avg_latencies.values())
        max_lat = max(avg_latencies.values())
        spread = max_lat - min_lat

        if spread == 0:
            return {uid: 1.0 for uid in avg_latencies}

        return {
            uid: 1.0 - (lat - min_lat) / spread
            for uid, lat in avg_latencies.items()
        }

    @staticmethod
    def _normalize(raw: dict[int, float]) -> dict[int, float]:
        """Normalize weights to sum to 1.0.

        Uses epsilon comparison to avoid division by near-zero floating point sums
        that could produce Infinity or extremely large weights.
        """
        total = sum(raw.values())
        if total < 1e-12:
            n = len(raw)
            return {uid: 1.0 / n for uid in raw} if n > 0 else {}
        return {uid: score / total for uid, score in raw.items()}

    def reset_epoch(self) -> None:
        """Reset per-epoch metrics while preserving history."""
        for m in self._miners.values():
            m.queries_total = 0
            m.queries_correct = 0
            m.latencies.clear()
            m.proofs_submitted = 0
            m.health_checks_total = 0
            m.health_checks_responded = 0

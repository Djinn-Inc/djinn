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
        proof_status: str = "",
    ) -> None:
        """Record a single query result.

        If proof_status is "unverified", the query is never counted as
        correct regardless of the ``correct`` flag — unverified proofs
        cannot be trusted for accuracy scoring (R25-18).
        """
        self.queries_total += 1
        if proof_status == "unverified":
            log.warning(
                "unverified_proof_zero_accuracy",
                uid=self.uid,
                hotkey=self.hotkey,
            )
        elif correct:
            self.queries_correct += 1
        self.latencies.append(latency)
        if proof_submitted:
            self.proofs_submitted += 1

    def record_health_check(self, responded: bool) -> None:
        """Record a health check result."""
        self.health_checks_total += 1
        if responded:
            self.health_checks_responded += 1

    def record_attestation(self, latency: float, proof_valid: bool) -> None:
        """Record a web attestation challenge result.

        Attestation work contributes to accuracy (valid proof = correct),
        coverage (proof submitted), and speed (latency) metrics — the same
        axes as sports challenges.
        """
        self.queries_total += 1
        if proof_valid:
            self.queries_correct += 1
            self.proofs_submitted += 1
        self.latencies.append(latency)


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
        """Get or create metrics for a miner.

        If the hotkey changed (miner deregistered and a new one took the UID),
        reset all metrics so the new miner starts fresh.
        """
        existing = self._miners.get(uid)
        if existing is not None:
            if existing.hotkey != hotkey:
                log.info("miner_hotkey_changed", uid=uid, old=existing.hotkey, new=hotkey)
                self._miners[uid] = MinerMetrics(uid=uid, hotkey=hotkey)
            return self._miners[uid]
        self._miners[uid] = MinerMetrics(uid=uid, hotkey=hotkey)
        return self._miners[uid]

    def remove(self, uid: int) -> None:
        """Remove a deregistered miner."""
        self._miners.pop(uid, None)

    def prune_absent(self, active_uids: set[int]) -> int:
        """Remove metrics for UIDs no longer on the metagraph. Returns count pruned."""
        stale = [uid for uid in self._miners if uid not in active_uids]
        for uid in stale:
            del self._miners[uid]
        if stale:
            log.info("scorer_pruned_absent", count=len(stale), uids=stale)
        return len(stale)

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
            history = math.log1p(m.consecutive_epochs) / math.log1p(max_history) if max_history > 0 else 0.0
            score = self.W_EMPTY_UPTIME * m.uptime_score() + self.W_EMPTY_HISTORY * history
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
            return {m.uid: 1.0 for m in miners}

        # Miners with latencies get normalized scores; miners without queries
        # get the median score so speed doesn't unfairly penalize them.
        scores = {uid: 1.0 - (lat - min_lat) / spread for uid, lat in avg_latencies.items()}
        median = sorted(scores.values())[len(scores) // 2] if scores else 1.0
        for m in miners:
            if m.uid not in scores:
                scores[m.uid] = median
        return scores

    @staticmethod
    def _normalize(raw: dict[int, float]) -> dict[int, float]:
        """Normalize weights to sum to 1.0.

        Uses epsilon comparison to avoid division by near-zero floating point sums
        that could produce Infinity or extremely large weights. Validates all
        outputs are finite to prevent inf/nan propagation to on-chain weight setting.
        """
        total = sum(raw.values())
        if total < 1e-12:
            n = len(raw)
            return {uid: 1.0 / n for uid in raw} if n > 0 else {}
        result = {uid: score / total for uid, score in raw.items()}
        # Guard against floating-point edge cases producing inf or nan
        if not all(math.isfinite(v) for v in result.values()):
            n = len(result)
            return {uid: 1.0 / n for uid in result} if n > 0 else {}
        return result

    def reset_epoch(self) -> None:
        """Reset per-epoch metrics while preserving history.

        Increments consecutive_epochs for miners that participated (responded
        to at least one health check or answered at least one query). Resets
        the counter to 0 for miners that were completely inactive.
        """
        for m in self._miners.values():
            participated = m.queries_total > 0 or m.health_checks_responded > 0
            if participated:
                m.consecutive_epochs += 1
            else:
                m.consecutive_epochs = 0
            m.queries_total = 0
            m.queries_correct = 0
            m.latencies.clear()
            m.proofs_submitted = 0
            m.health_checks_total = 0
            m.health_checks_responded = 0

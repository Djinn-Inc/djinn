"""Tests for miner scoring."""

import math

import pytest

from djinn_validator.core.scoring import MinerMetrics, MinerScorer


class TestMinerMetrics:
    def test_accuracy_score(self) -> None:
        m = MinerMetrics(uid=1, hotkey="h1")
        m.record_query(correct=True, latency=0.1, proof_submitted=False)
        m.record_query(correct=True, latency=0.2, proof_submitted=False)
        m.record_query(correct=False, latency=0.3, proof_submitted=False)
        assert m.accuracy_score() == pytest.approx(2 / 3)

    def test_coverage_score(self) -> None:
        m = MinerMetrics(uid=1, hotkey="h1")
        m.record_query(correct=True, latency=0.1, proof_submitted=True)
        m.record_query(correct=True, latency=0.2, proof_submitted=False)
        assert m.coverage_score() == 0.5

    def test_uptime_score(self) -> None:
        m = MinerMetrics(uid=1, hotkey="h1")
        m.record_health_check(responded=True)
        m.record_health_check(responded=True)
        m.record_health_check(responded=False)
        assert m.uptime_score() == pytest.approx(2 / 3)

    def test_empty_metrics(self) -> None:
        m = MinerMetrics(uid=1, hotkey="h1")
        assert m.accuracy_score() == 0.0
        assert m.coverage_score() == 0.0
        assert m.uptime_score() == 0.0


class TestMinerScorer:
    def test_active_weights_sum_to_one(self) -> None:
        scorer = MinerScorer()
        for uid in range(5):
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_query(correct=True, latency=0.1 * (uid + 1), proof_submitted=True)
            m.record_health_check(responded=True)

        weights = scorer.compute_weights(is_active_epoch=True)
        assert len(weights) == 5
        assert sum(weights.values()) == pytest.approx(1.0)

    def test_empty_weights_sum_to_one(self) -> None:
        scorer = MinerScorer()
        for uid in range(3):
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_health_check(responded=True)
            m.consecutive_epochs = uid + 1

        weights = scorer.compute_weights(is_active_epoch=False)
        assert sum(weights.values()) == pytest.approx(1.0)

    def test_faster_miner_scores_higher(self) -> None:
        scorer = MinerScorer()
        fast = scorer.get_or_create(0, "fast")
        fast.record_query(correct=True, latency=0.05, proof_submitted=True)
        fast.record_health_check(responded=True)

        slow = scorer.get_or_create(1, "slow")
        slow.record_query(correct=True, latency=1.0, proof_submitted=True)
        slow.record_health_check(responded=True)

        weights = scorer.compute_weights(is_active_epoch=True)
        assert weights[0] > weights[1]

    def test_accurate_miner_scores_higher(self) -> None:
        scorer = MinerScorer()
        good = scorer.get_or_create(0, "good")
        for _ in range(10):
            good.record_query(correct=True, latency=0.1, proof_submitted=True)
        good.record_health_check(responded=True)

        bad = scorer.get_or_create(1, "bad")
        for _ in range(10):
            bad.record_query(correct=False, latency=0.1, proof_submitted=True)
        bad.record_health_check(responded=True)

        weights = scorer.compute_weights(is_active_epoch=True)
        assert weights[0] > weights[1]

    def test_weight_components(self) -> None:
        """Verify weight decomposition matches expected ratios."""
        scorer = MinerScorer()
        # Perfect miner
        m = scorer.get_or_create(0, "perfect")
        m.record_query(correct=True, latency=0.1, proof_submitted=True)
        m.record_health_check(responded=True)

        weights = scorer.compute_weights(is_active_epoch=True)
        # Single miner should get weight 1.0
        assert weights[0] == pytest.approx(1.0)

    def test_reset_epoch(self) -> None:
        scorer = MinerScorer()
        m = scorer.get_or_create(0, "h0")
        m.record_query(correct=True, latency=0.1, proof_submitted=True)
        m.record_health_check(responded=True)
        m.consecutive_epochs = 5

        scorer.reset_epoch()
        assert m.queries_total == 0
        assert m.health_checks_total == 0
        assert m.consecutive_epochs == 6  # Incremented (miner participated)

    def test_remove_miner(self) -> None:
        scorer = MinerScorer()
        scorer.get_or_create(0, "h0")
        scorer.get_or_create(1, "h1")
        scorer.remove(0)
        weights = scorer.compute_weights(is_active_epoch=False)
        assert 0 not in weights
        assert 1 in weights

    def test_all_same_latency_scores_equal(self) -> None:
        """When all miners have the same latency, speed scores should be 1.0."""
        scorer = MinerScorer()
        for uid in range(3):
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_query(correct=True, latency=0.5, proof_submitted=True)
            m.record_health_check(responded=True)
        weights = scorer.compute_weights(is_active_epoch=True)
        # All identical → equal weights
        for uid in range(3):
            assert weights[uid] == pytest.approx(1.0 / 3)

    def test_speed_scores_bounded_zero_to_one(self) -> None:
        """Speed normalization must always produce values in [0, 1]."""
        scorer = MinerScorer()
        for uid, lat in enumerate([0.001, 0.5, 1.0, 2.0, 10.0]):
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_query(correct=True, latency=lat, proof_submitted=True)
            m.record_health_check(responded=True)
        scores = scorer._normalize_speed(list(scorer._miners.values()))
        for uid, score in scores.items():
            assert 0.0 <= score <= 1.0, f"uid={uid} score={score} out of bounds"

    def test_no_miners_returns_empty(self) -> None:
        scorer = MinerScorer()
        assert scorer.compute_weights(is_active_epoch=True) == {}
        assert scorer.compute_weights(is_active_epoch=False) == {}

    def test_zero_total_weight_distributes_evenly(self) -> None:
        """When all raw scores are 0, weights should be distributed evenly."""
        scorer = MinerScorer()
        for uid in range(3):
            scorer.get_or_create(uid, f"h{uid}")
            # No queries, no health checks → all scores 0
        weights = scorer.compute_weights(is_active_epoch=True)
        assert len(weights) == 3
        for uid in range(3):
            assert weights[uid] == pytest.approx(1.0 / 3)

    def test_history_log_scaling(self) -> None:
        scorer = MinerScorer()
        new_miner = scorer.get_or_create(0, "new")
        new_miner.consecutive_epochs = 1
        new_miner.record_health_check(responded=True)

        veteran = scorer.get_or_create(1, "vet")
        veteran.consecutive_epochs = 100
        veteran.record_health_check(responded=True)

        weights = scorer.compute_weights(is_active_epoch=False)
        # Veteran should have higher weight due to log-scaled history
        assert weights[1] > weights[0]

    def test_speed_scores_uniform_when_no_latencies(self) -> None:
        """When no miners have latencies, all get speed score 1.0."""
        scorer = MinerScorer()
        for uid in range(3):
            scorer.get_or_create(uid, f"h{uid}")
            # No queries recorded → no latencies
        scores = scorer._normalize_speed(list(scorer._miners.values()))
        assert len(scores) == 3
        for uid in range(3):
            assert scores[uid] == 1.0

    def test_normalize_near_zero_total(self) -> None:
        """Near-zero total should produce uniform weights, not Inf."""
        raw = {0: 1e-15, 1: 1e-15, 2: 1e-15}
        result = MinerScorer._normalize(raw)
        assert len(result) == 3
        for uid in range(3):
            assert result[uid] == pytest.approx(1.0 / 3)
            assert math.isfinite(result[uid])

    def test_normalize_negative_scores_handled(self) -> None:
        """Negative raw scores that sum near zero use uniform fallback."""
        raw = {0: 0.5, 1: -0.5}
        result = MinerScorer._normalize(raw)
        # Total is ~0 so should fall back to uniform
        assert len(result) == 2
        for uid in range(2):
            assert result[uid] == pytest.approx(0.5)

    def test_speed_scores_median_for_unqueried_miners(self) -> None:
        """Miners without latencies get median speed score, not zero."""
        scorer = MinerScorer()
        # Miners 0-2 have latencies; miner 3 has none
        for uid, lat in [(0, 0.1), (1, 0.5), (2, 1.0)]:
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_query(correct=True, latency=lat, proof_submitted=True)
        scorer.get_or_create(3, "h3")  # No queries, no latencies
        scores = scorer._normalize_speed(list(scorer._miners.values()))
        assert 3 in scores, "Unqueried miner must be in speed scores"
        assert scores[3] > 0.0, "Unqueried miner must not be penalized to zero"
        # Median of {1.0, ~0.56, 0.0} = ~0.56
        assert 0.0 < scores[3] < 1.0

    def test_speed_scores_all_same_latency_includes_all(self) -> None:
        """When all latencies are equal, all miners (including unqueried) get 1.0."""
        scorer = MinerScorer()
        for uid in range(3):
            m = scorer.get_or_create(uid, f"h{uid}")
            m.record_query(correct=True, latency=0.5, proof_submitted=True)
        scorer.get_or_create(3, "h3")  # No latencies
        scores = scorer._normalize_speed(list(scorer._miners.values()))
        assert len(scores) == 4
        for uid in range(4):
            assert scores[uid] == 1.0

    def test_normalize_guards_non_finite_values(self) -> None:
        """If division somehow produces inf/nan, falls back to uniform."""
        # Simulate by injecting inf values in raw dict
        raw = {0: float("inf"), 1: 1.0}
        result = MinerScorer._normalize(raw)
        # inf / (inf + 1) = nan, so should fall back to uniform
        assert len(result) == 2
        assert all(math.isfinite(v) for v in result.values())

    def test_normalize_all_finite(self) -> None:
        """Normal case produces all finite weights summing to ~1.0."""
        raw = {0: 3.0, 1: 2.0, 2: 5.0}
        result = MinerScorer._normalize(raw)
        assert sum(result.values()) == pytest.approx(1.0)
        assert all(math.isfinite(v) for v in result.values())


class TestRecordAttestation:
    """Tests for MinerMetrics.record_attestation (web attestation scoring)."""

    def test_valid_attestation_increments_correct_and_proof(self) -> None:
        m = MinerMetrics(uid=0, hotkey="hk0")
        m.record_attestation(latency=2.5, proof_valid=True)
        assert m.queries_total == 1
        assert m.queries_correct == 1
        assert m.proofs_submitted == 1
        assert m.latencies == [2.5]

    def test_invalid_attestation_does_not_increment_correct(self) -> None:
        m = MinerMetrics(uid=0, hotkey="hk0")
        m.record_attestation(latency=5.0, proof_valid=False)
        assert m.queries_total == 1
        assert m.queries_correct == 0
        assert m.proofs_submitted == 0
        assert m.latencies == [5.0]

    def test_attestation_and_sports_accumulate(self) -> None:
        """Attestation and sports queries both count toward the same metrics."""
        m = MinerMetrics(uid=0, hotkey="hk0")
        m.record_query(correct=True, latency=1.0, proof_submitted=False)
        m.record_attestation(latency=3.0, proof_valid=True)
        assert m.queries_total == 2
        assert m.queries_correct == 2
        assert m.proofs_submitted == 1  # Only attestation submitted a proof
        assert m.accuracy_score() == pytest.approx(1.0)
        assert m.coverage_score() == pytest.approx(0.5)  # 1 proof / 2 queries

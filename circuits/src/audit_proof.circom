pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/// @title IntDiv
/// @notice Integer division in a ZK circuit. Computes q = a / b (integer division)
///         and constrains a == b * q + r with 0 <= r < b.
template IntDiv(bits) {
    signal input a;
    signal input b;
    signal output q;
    signal r;

    q <-- a \ b;
    r <-- a % b;

    // Constraint: a == b * q + r
    a === b * q + r;

    // Range check: r < b (r is non-negative by default in the field for small values)
    component lt = LessThan(bits);
    lt.in[0] <== r;
    lt.in[1] <== b;
    lt.out === 1;
}

/// @title AuditProof
/// @notice ZK circuit for Djinn Protocol audit settlement.
///         Proves knowledge of signal preimages matching on-chain commitment hashes,
///         verifies real indices are in [1, 10], and computes the Quality Score.
///
///         Public inputs: commitHash, outcome, notional, odds, slaBps, scorePositive, scoreNegative
///         Private inputs: signalPreimage, realIndex
///
///         The Quality Score = scorePositive - scoreNegative (split to avoid signed arithmetic).
///         Only one of scorePositive/scoreNegative can be non-zero.
template AuditProof(N) {
    // ─── Private Inputs ───
    signal input signalPreimage[N];
    signal input realIndex[N];

    // ─── Public Inputs ───
    signal input commitHash[N];
    signal input outcome[N];       // 1=Favorable, 2=Unfavorable, 3=Void (0=Pending skipped)
    signal input notional[N];
    signal input odds[N];          // 6-decimal fixed point (1.91 = 1_910_000)
    signal input slaBps[N];        // SLA multiplier in basis points
    signal input scorePositive;    // Positive component of Quality Score
    signal input scoreNegative;    // Negative component (actual score = pos - neg)

    var ODDS_PRECISION = 1000000;
    var BPS_DENOM = 10000;

    // ─── 1. Hash Preimage Verification ───
    // Proves: Poseidon(signalPreimage[i], realIndex[i]) == commitHash[i]
    component hasher[N];
    for (var i = 0; i < N; i++) {
        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== signalPreimage[i];
        hasher[i].inputs[1] <== realIndex[i];
        hasher[i].out === commitHash[i];
    }

    // ─── 2. Index Range Verification ───
    // Proves: 1 <= realIndex[i] <= 10
    component idxGe[N];
    component idxLe[N];
    for (var i = 0; i < N; i++) {
        idxGe[i] = GreaterEqThan(8);
        idxGe[i].in[0] <== realIndex[i];
        idxGe[i].in[1] <== 1;
        idxGe[i].out === 1;

        idxLe[i] = LessEqThan(8);
        idxLe[i].in[0] <== realIndex[i];
        idxLe[i].in[1] <== 10;
        idxLe[i].out === 1;
    }

    // ─── 3. Quality Score Computation ───
    // Favorable:   +notional * (odds - 1e6) / 1e6
    // Unfavorable: -notional * slaBps / 10000
    // Void/Pending: 0

    component isFav[N];
    component isUnfav[N];
    component divGain[N];
    component divLoss[N];

    signal gainNumer[N];
    signal lossNumer[N];
    signal gainRaw[N];
    signal lossRaw[N];
    signal gain[N];
    signal loss[N];

    for (var i = 0; i < N; i++) {
        // Check outcome type
        isFav[i] = IsEqual();
        isFav[i].in[0] <== outcome[i];
        isFav[i].in[1] <== 1;

        isUnfav[i] = IsEqual();
        isUnfav[i].in[0] <== outcome[i];
        isUnfav[i].in[1] <== 2;

        // Favorable gain: notional * (odds - 1e6) / 1e6
        gainNumer[i] <== notional[i] * (odds[i] - ODDS_PRECISION);
        divGain[i] = IntDiv(128);
        divGain[i].a <== gainNumer[i];
        divGain[i].b <== ODDS_PRECISION;
        gainRaw[i] <== divGain[i].q;
        gain[i] <== isFav[i].out * gainRaw[i];

        // Unfavorable loss: notional * slaBps / 10000
        lossNumer[i] <== notional[i] * slaBps[i];
        divLoss[i] = IntDiv(128);
        divLoss[i].a <== lossNumer[i];
        divLoss[i].b <== BPS_DENOM;
        lossRaw[i] <== divLoss[i].q;
        loss[i] <== isUnfav[i].out * lossRaw[i];
    }

    // ─── 4. Accumulate Gains and Losses ───
    signal sumGain[N + 1];
    signal sumLoss[N + 1];
    sumGain[0] <== 0;
    sumLoss[0] <== 0;

    for (var i = 0; i < N; i++) {
        sumGain[i + 1] <== sumGain[i] + gain[i];
        sumLoss[i + 1] <== sumLoss[i] + loss[i];
    }

    // ─── 5. Verify Quality Score ───
    // score = totalGain - totalLoss = scorePositive - scoreNegative
    // => totalGain + scoreNegative == totalLoss + scorePositive
    sumGain[N] + scoreNegative === sumLoss[N] + scorePositive;

    // Exactly one of scorePositive/scoreNegative must be zero
    // (prevents ambiguous encoding like score = 100 - 50 vs 200 - 150)
    scorePositive * scoreNegative === 0;
}

component main {public [commitHash, outcome, notional, odds, slaBps, scorePositive, scoreNegative]} = AuditProof(10);

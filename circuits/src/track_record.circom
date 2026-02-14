pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/// @title IntDiv (same as in audit_proof.circom)
template IntDivTR(bits) {
    signal input a;
    signal input b;
    signal output q;
    signal r;

    q <-- a \ b;
    r <-- a % b;

    a === b * q + r;

    component lt = LessThan(bits);
    lt.in[0] <== r;
    lt.in[1] <== b;
    lt.out === 1;
}

/// @title TrackRecord
/// @notice ZK circuit for Djinn Protocol track record proofs.
///         Proves aggregate statistics over a Genius's committed signals:
///         - Total favorable / unfavorable / void counts
///         - Total gain and total loss (for ROI computation)
///         - All verified against on-chain commitment hashes and public outcomes
///
///         The circuit is parameterized by MAX_SIGNALS (e.g., 256 or 512).
///         Signals beyond `signalCount` are ignored (masked out).
///
///         Public inputs: commitHash[], outcome[], notional[], odds[], slaBps[],
///                        signalCount, totalGain, totalLoss, favCount, unfavCount, voidCount
///         Private inputs: signalPreimage[], realIndex[]
template TrackRecord(MAX_SIGNALS) {
    // ─── Private Inputs ───
    signal input signalPreimage[MAX_SIGNALS];
    signal input realIndex[MAX_SIGNALS];

    // ─── Public Inputs ───
    signal input commitHash[MAX_SIGNALS];
    signal input outcome[MAX_SIGNALS];    // 1=Favorable, 2=Unfavorable, 3=Void
    signal input notional[MAX_SIGNALS];
    signal input odds[MAX_SIGNALS];
    signal input slaBps[MAX_SIGNALS];
    signal input signalCount;             // Actual number of signals (<= MAX_SIGNALS)
    signal input totalGain;               // Claimed sum of favorable gains
    signal input totalLoss;               // Claimed sum of unfavorable losses
    signal input favCount;                // Claimed favorable count
    signal input unfavCount;              // Claimed unfavorable count
    signal input voidCount;               // Claimed void count

    var ODDS_PRECISION = 1000000;
    var BPS_DENOM = 10000;

    // ─── 1. Signal Count Range Check ───
    component countLe = LessEqThan(16);
    countLe.in[0] <== signalCount;
    countLe.in[1] <== MAX_SIGNALS;
    countLe.out === 1;

    component countGe = GreaterEqThan(16);
    countGe.in[0] <== signalCount;
    countGe.in[1] <== 1;
    countGe.out === 1;

    // ─── 2. Active Mask ───
    // isActive[i] = 1 if i < signalCount, else 0
    component isActive[MAX_SIGNALS];
    for (var i = 0; i < MAX_SIGNALS; i++) {
        isActive[i] = LessThan(16);
        isActive[i].in[0] <== i;
        isActive[i].in[1] <== signalCount;
    }

    // ─── 3. Hash Verification (only for active signals) ───
    component hasher[MAX_SIGNALS];
    signal computedHash[MAX_SIGNALS];
    signal hashDiff[MAX_SIGNALS];

    for (var i = 0; i < MAX_SIGNALS; i++) {
        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== signalPreimage[i];
        hasher[i].inputs[1] <== realIndex[i];

        computedHash[i] <== hasher[i].out;

        // For active signals: computedHash must match commitHash
        // For inactive: we don't care (diff * isActive == 0)
        hashDiff[i] <== (computedHash[i] - commitHash[i]) * isActive[i].out;
        hashDiff[i] === 0;
    }

    // ─── 4. Index Range Check (only for active signals) ───
    component idxGe[MAX_SIGNALS];
    component idxLe[MAX_SIGNALS];
    signal idxCheck1[MAX_SIGNALS];
    signal idxCheck2[MAX_SIGNALS];

    for (var i = 0; i < MAX_SIGNALS; i++) {
        idxGe[i] = GreaterEqThan(8);
        idxGe[i].in[0] <== realIndex[i];
        idxGe[i].in[1] <== 1;

        idxLe[i] = LessEqThan(8);
        idxLe[i].in[0] <== realIndex[i];
        idxLe[i].in[1] <== 10;

        // For active signals: both checks must pass
        // idxGe * isActive must equal isActive (if active, must be >= 1)
        idxCheck1[i] <== isActive[i].out * (1 - idxGe[i].out);
        idxCheck1[i] === 0;

        idxCheck2[i] <== isActive[i].out * (1 - idxLe[i].out);
        idxCheck2[i] === 0;
    }

    // ─── 5. Score Computation ───
    component isFav[MAX_SIGNALS];
    component isUnfav[MAX_SIGNALS];
    component isVoid[MAX_SIGNALS];
    component divGain[MAX_SIGNALS];
    component divLoss[MAX_SIGNALS];

    signal gainNumer[MAX_SIGNALS];
    signal lossNumer[MAX_SIGNALS];
    signal gainRaw[MAX_SIGNALS];
    signal lossRaw[MAX_SIGNALS];
    signal gain[MAX_SIGNALS];
    signal loss[MAX_SIGNALS];
    signal favBit[MAX_SIGNALS];
    signal unfavBit[MAX_SIGNALS];
    signal voidBit[MAX_SIGNALS];

    for (var i = 0; i < MAX_SIGNALS; i++) {
        isFav[i] = IsEqual();
        isFav[i].in[0] <== outcome[i];
        isFav[i].in[1] <== 1;

        isUnfav[i] = IsEqual();
        isUnfav[i].in[0] <== outcome[i];
        isUnfav[i].in[1] <== 2;

        isVoid[i] = IsEqual();
        isVoid[i].in[0] <== outcome[i];
        isVoid[i].in[1] <== 3;

        // Only count for active signals
        favBit[i] <== isFav[i].out * isActive[i].out;
        unfavBit[i] <== isUnfav[i].out * isActive[i].out;
        voidBit[i] <== isVoid[i].out * isActive[i].out;

        // Gain computation (active favorable only)
        gainNumer[i] <== notional[i] * (odds[i] - ODDS_PRECISION);
        divGain[i] = IntDivTR(128);
        divGain[i].a <== gainNumer[i];
        divGain[i].b <== ODDS_PRECISION;
        gainRaw[i] <== divGain[i].q;
        gain[i] <== favBit[i] * gainRaw[i];

        // Loss computation (active unfavorable only)
        lossNumer[i] <== notional[i] * slaBps[i];
        divLoss[i] = IntDivTR(128);
        divLoss[i].a <== lossNumer[i];
        divLoss[i].b <== BPS_DENOM;
        lossRaw[i] <== divLoss[i].q;
        loss[i] <== unfavBit[i] * lossRaw[i];
    }

    // ─── 6. Accumulate ───
    signal accGain[MAX_SIGNALS + 1];
    signal accLoss[MAX_SIGNALS + 1];
    signal accFav[MAX_SIGNALS + 1];
    signal accUnfav[MAX_SIGNALS + 1];
    signal accVoid[MAX_SIGNALS + 1];

    accGain[0] <== 0;
    accLoss[0] <== 0;
    accFav[0] <== 0;
    accUnfav[0] <== 0;
    accVoid[0] <== 0;

    for (var i = 0; i < MAX_SIGNALS; i++) {
        accGain[i + 1] <== accGain[i] + gain[i];
        accLoss[i + 1] <== accLoss[i] + loss[i];
        accFav[i + 1] <== accFav[i] + favBit[i];
        accUnfav[i + 1] <== accUnfav[i] + unfavBit[i];
        accVoid[i + 1] <== accVoid[i] + voidBit[i];
    }

    // ─── 7. Verify Claimed Aggregates ───
    accGain[MAX_SIGNALS] === totalGain;
    accLoss[MAX_SIGNALS] === totalLoss;
    accFav[MAX_SIGNALS] === favCount;
    accUnfav[MAX_SIGNALS] === unfavCount;
    accVoid[MAX_SIGNALS] === voidCount;

    // Total active signals = fav + unfav + void
    favCount + unfavCount + voidCount === signalCount;
}

component main {public [
    commitHash, outcome, notional, odds, slaBps,
    signalCount, totalGain, totalLoss, favCount, unfavCount, voidCount
]} = TrackRecord(64);

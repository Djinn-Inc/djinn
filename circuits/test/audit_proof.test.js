import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPoseidon } from "circomlibjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const snarkjs = await import("snarkjs");

const WASM_PATH = resolve(__dirname, "../build/audit_proof_js/audit_proof.wasm");
const ZKEY_PATH = resolve(__dirname, "../build/audit_proof.zkey");
const VKEY_PATH = resolve(__dirname, "../build/audit_proof_vkey.json");

const ODDS_PRECISION = 1000000n;
const BPS_DENOM = 10000n;

let poseidon;
let F;

async function setup() {
    poseidon = await buildPoseidon();
    F = poseidon.F;
}

function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs));
}

function computeExpectedScore(signals) {
    let totalGain = 0n;
    let totalLoss = 0n;

    for (const s of signals) {
        if (s.outcome === 1n) {
            // Favorable: +notional * (odds - 1e6) / 1e6
            totalGain += (s.notional * (s.odds - ODDS_PRECISION)) / ODDS_PRECISION;
        } else if (s.outcome === 2n) {
            // Unfavorable: -notional * slaBps / 10000
            totalLoss += (s.notional * s.slaBps) / BPS_DENOM;
        }
    }

    const score = totalGain - totalLoss;
    return {
        scorePositive: score >= 0n ? score : 0n,
        scoreNegative: score < 0n ? -score : 0n,
        totalGain,
        totalLoss,
    };
}

function buildInput(signals) {
    const n = signals.length;
    const commitHash = [];
    const outcome = [];
    const notional = [];
    const odds = [];
    const slaBps = [];
    const signalPreimage = [];
    const realIndex = [];

    for (const s of signals) {
        const hash = poseidonHash([s.preimage, s.index]);
        commitHash.push(hash);
        outcome.push(s.outcome);
        notional.push(s.notional);
        odds.push(s.odds);
        slaBps.push(s.slaBps);
        signalPreimage.push(s.preimage);
        realIndex.push(s.index);
    }

    const { scorePositive, scoreNegative } = computeExpectedScore(signals);

    return {
        signalPreimage,
        realIndex,
        commitHash,
        outcome,
        notional,
        odds,
        slaBps,
        scorePositive,
        scoreNegative,
    };
}

async function generateAndVerifyProof(input) {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        WASM_PATH,
        ZKEY_PATH
    );

    const vkey = JSON.parse(readFileSync(VKEY_PATH, "utf8"));
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    return { proof, publicSignals, valid };
}

// ─── Test Runner ───

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || "Assertion failed");
}

function assertEquals(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ─── Tests ───

console.log("\n=== Audit Proof Circuit Tests ===\n");

await setup();

await test("All favorable signals - positive score", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(1000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n, // Favorable
            notional: 1000000000n, // 1000 USDC (6 decimals)
            odds: 1910000n, // 1.91
            slaBps: 15000n, // 150%
        });
    }

    const input = buildInput(signals);
    assert(input.scorePositive > 0n, "Score should be positive");
    assertEquals(input.scoreNegative, 0n, "Negative component should be zero");

    // Expected: 10 * 1000e6 * 910000 / 1000000 = 10 * 910e6 = 9100e6
    assertEquals(input.scorePositive, 9100000000n, "Score should be 9100e6");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("All unfavorable signals - negative score", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(2000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 2n, // Unfavorable
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);
    assertEquals(input.scorePositive, 0n, "Positive component should be zero");
    assert(input.scoreNegative > 0n, "Negative component should be positive");

    // Expected: 10 * 1000e6 * 15000 / 10000 = 10 * 1500e6 = 15000e6
    assertEquals(input.scoreNegative, 15000000000n, "Score should be -15000e6");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("Mixed outcomes - correct quality score", async () => {
    const signals = [];
    // 6 favorable, 3 unfavorable, 1 void
    const outcomes = [1n, 1n, 1n, 1n, 1n, 1n, 2n, 2n, 2n, 3n];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(3000 + i),
            index: BigInt((i % 10) + 1),
            outcome: outcomes[i],
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);
    // 6 * 910e6 - 3 * 1500e6 = 5460e6 - 4500e6 = 960e6
    assertEquals(input.scorePositive, 960000000n, "Score should be 960e6");
    assertEquals(input.scoreNegative, 0n, "Negative component should be zero");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("All void signals - zero score", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(4000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 3n, // Void
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);
    assertEquals(input.scorePositive, 0n, "Positive should be zero");
    assertEquals(input.scoreNegative, 0n, "Negative should be zero");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("Different notionals and odds per signal", async () => {
    const signals = [];
    const notionals = [
        500000000n, 1000000000n, 2000000000n, 750000000n, 300000000n,
        1500000000n, 800000000n, 1200000000n, 600000000n, 900000000n,
    ];
    const oddsArr = [
        2500000n, 1500000n, 3000000n, 1800000n, 2200000n,
        1400000n, 4000000n, 1100000n, 2800000n, 1600000n,
    ];
    const outcomes = [1n, 1n, 2n, 1n, 3n, 2n, 1n, 2n, 1n, 3n];

    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(5000 + i),
            index: BigInt((i % 10) + 1),
            outcome: outcomes[i],
            notional: notionals[i],
            odds: oddsArr[i],
            slaBps: 12000n, // 120%
        });
    }

    const input = buildInput(signals);
    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid for varied inputs");
});

await test("Invalid hash preimage is rejected", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(6000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);

    // Tamper with a preimage (change the first signal's preimage)
    input.signalPreimage[0] = BigInt(99999);

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject invalid preimage");
});

await test("Wrong score is rejected", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(7000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);

    // Tamper with the claimed score
    input.scorePositive = input.scorePositive + 1n;

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject wrong score");
});

await test("Index out of range is rejected (index = 0)", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(8000 + i),
            index: i === 0 ? 0n : BigInt((i % 10) + 1), // index 0 is invalid
            outcome: 1n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    // Compute commit hash with the invalid index
    const hash0 = poseidonHash([BigInt(8000), 0n]);
    const input = buildInput(signals);
    input.commitHash[0] = hash0; // Fix hash to match tampered index

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject index = 0");
});

await test("Index out of range is rejected (index = 11)", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(9000 + i),
            index: i === 0 ? 11n : BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const hash0 = poseidonHash([BigInt(9000), 11n]);
    const input = buildInput(signals);
    input.commitHash[0] = hash0;

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject index = 11");
});

// ─── Summary ───
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

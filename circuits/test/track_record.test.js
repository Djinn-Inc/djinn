import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPoseidon } from "circomlibjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const snarkjs = await import("snarkjs");

const WASM_PATH = resolve(__dirname, "../build/track_record_js/track_record.wasm");
const ZKEY_PATH = resolve(__dirname, "../build/track_record.zkey");
const VKEY_PATH = resolve(__dirname, "../build/track_record_vkey.json");

const MAX_SIGNALS = 20;  // Matches circuit (DEV-005: reduced from 64 for EVM contract size limit)
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

function padArray(arr, len, defaultVal) {
    const padded = [...arr];
    while (padded.length < len) padded.push(defaultVal);
    return padded;
}

function computeAggregates(signals) {
    let totalGain = 0n;
    let totalLoss = 0n;
    let favCount = 0n;
    let unfavCount = 0n;
    let voidCount = 0n;

    for (const s of signals) {
        if (s.outcome === 1n) {
            totalGain += (s.notional * (s.odds - ODDS_PRECISION)) / ODDS_PRECISION;
            favCount++;
        } else if (s.outcome === 2n) {
            totalLoss += (s.notional * s.slaBps) / BPS_DENOM;
            unfavCount++;
        } else if (s.outcome === 3n) {
            voidCount++;
        }
    }

    return { totalGain, totalLoss, favCount, unfavCount, voidCount };
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

    const { totalGain, totalLoss, favCount, unfavCount, voidCount } = computeAggregates(signals);

    // Pad to MAX_SIGNALS with dummy values
    // Inactive signals: preimage=0, index=1 (valid range), outcome=3 (void), everything else 0
    const dummyHash = poseidonHash([0n, 1n]);

    return {
        signalPreimage: padArray(signalPreimage, MAX_SIGNALS, 0n),
        realIndex: padArray(realIndex, MAX_SIGNALS, 1n),
        commitHash: padArray(commitHash, MAX_SIGNALS, dummyHash),
        outcome: padArray(outcome, MAX_SIGNALS, 3n),
        notional: padArray(notional, MAX_SIGNALS, 0n),
        odds: padArray(odds, MAX_SIGNALS, ODDS_PRECISION),
        slaBps: padArray(slaBps, MAX_SIGNALS, 0n),
        signalCount: BigInt(n),
        totalGain,
        totalLoss,
        favCount,
        unfavCount,
        voidCount,
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

console.log("\n=== Track Record Circuit Tests ===\n");

await setup();

await test("10 favorable signals - correct aggregates", async () => {
    const signals = [];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(1000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);
    assertEquals(input.totalGain, 9100000000n, "Total gain should be 9100e6");
    assertEquals(input.totalLoss, 0n, "Total loss should be 0");
    assertEquals(input.favCount, 10n, "Fav count should be 10");
    assertEquals(input.unfavCount, 0n, "Unfav count should be 0");
    assertEquals(input.voidCount, 0n, "Void count should be 0");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("Mixed outcomes with correct counts", async () => {
    const signals = [];
    const outcomes = [1n, 1n, 1n, 2n, 2n, 3n, 1n, 2n, 3n, 1n];
    for (let i = 0; i < 10; i++) {
        signals.push({
            preimage: BigInt(2000 + i),
            index: BigInt((i % 10) + 1),
            outcome: outcomes[i],
            notional: 1000000000n,
            odds: 2000000n, // 2.0x
            slaBps: 10000n, // 100%
        });
    }

    const input = buildInput(signals);
    // 5 favorable * 1000e6 * (2e6 - 1e6) / 1e6 = 5 * 1000e6 = 5000e6
    assertEquals(input.totalGain, 5000000000n, "Total gain");
    // 3 unfavorable * 1000e6 * 10000 / 10000 = 3 * 1000e6 = 3000e6
    assertEquals(input.totalLoss, 3000000000n, "Total loss");
    assertEquals(input.favCount, 5n, "Fav count");
    assertEquals(input.unfavCount, 3n, "Unfav count");
    assertEquals(input.voidCount, 2n, "Void count");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("Single signal works", async () => {
    const signals = [{
        preimage: BigInt(3000),
        index: 5n,
        outcome: 1n,
        notional: 500000000n, // 500 USDC
        odds: 3000000n, // 3.0x
        slaBps: 10000n,
    }];

    const input = buildInput(signals);
    // 500e6 * (3e6 - 1e6) / 1e6 = 500e6 * 2 = 1000e6
    assertEquals(input.totalGain, 1000000000n, "Total gain");
    assertEquals(input.favCount, 1n, "Fav count");
    assertEquals(input.signalCount, 1n, "Signal count");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("All void signals - zero everything", async () => {
    const signals = [];
    for (let i = 0; i < 5; i++) {
        signals.push({
            preimage: BigInt(4000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 3n,
            notional: 1000000000n,
            odds: 1910000n,
            slaBps: 15000n,
        });
    }

    const input = buildInput(signals);
    assertEquals(input.totalGain, 0n, "Gain should be zero");
    assertEquals(input.totalLoss, 0n, "Loss should be zero");
    assertEquals(input.favCount, 0n, "Fav count zero");
    assertEquals(input.unfavCount, 0n, "Unfav count zero");
    assertEquals(input.voidCount, 5n, "Void count 5");

    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid");
});

await test("Wrong totalGain is rejected", async () => {
    const signals = [];
    for (let i = 0; i < 3; i++) {
        signals.push({
            preimage: BigInt(5000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 2000000n,
            slaBps: 10000n,
        });
    }

    const input = buildInput(signals);
    input.totalGain = input.totalGain + 1n; // Tamper

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject wrong totalGain");
});

await test("Wrong favCount is rejected", async () => {
    const signals = [];
    for (let i = 0; i < 5; i++) {
        signals.push({
            preimage: BigInt(6000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 2000000n,
            slaBps: 10000n,
        });
    }

    const input = buildInput(signals);
    input.favCount = 4n; // Wrong: should be 5
    // Also must fix signalCount to match the constraint fav+unfav+void==signalCount
    // But that would break too, so either way it should fail
    input.voidCount = 1n;

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject wrong favCount");
});

await test("Invalid preimage is rejected", async () => {
    const signals = [];
    for (let i = 0; i < 4; i++) {
        signals.push({
            preimage: BigInt(7000 + i),
            index: BigInt((i % 10) + 1),
            outcome: 1n,
            notional: 1000000000n,
            odds: 2000000n,
            slaBps: 10000n,
        });
    }

    const input = buildInput(signals);
    input.signalPreimage[0] = 99999n; // Tamper

    let threw = false;
    try {
        await generateAndVerifyProof(input);
    } catch {
        threw = true;
    }
    assert(threw, "Should reject invalid preimage");
});

await test("Full batch - 20 signals (MAX_SIGNALS)", async () => {
    const signals = [];
    for (let i = 0; i < 20; i++) {
        signals.push({
            preimage: BigInt(8000 + i),
            index: BigInt((i % 10) + 1),
            outcome: BigInt((i % 3) + 1), // Cycle through 1, 2, 3
            notional: BigInt(500000000 + i * 10000000),
            odds: BigInt(1500000 + i * 50000),
            slaBps: 12000n,
        });
    }

    const input = buildInput(signals);
    const { valid } = await generateAndVerifyProof(input);
    assert(valid, "Proof should be valid for 20 signals (max batch)");
});

// ─── Summary ───
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

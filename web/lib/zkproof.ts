/**
 * Browser-side ZK proof generation for Djinn Protocol.
 *
 * Uses snarkjs to generate Groth16 proofs for:
 * - Audit proofs (quality score computation over 10 signals)
 * - Track record proofs (aggregate statistics over up to 20 signals)
 *
 * Circuit artifacts (.wasm, .zkey, vkey.json) are served from /circuits/.
 */

import * as snarkjs from "snarkjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonBuilder: any = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_WASM = "/circuits/audit_proof.wasm";
const AUDIT_ZKEY = "/circuits/audit_proof.zkey";
const AUDIT_VKEY = "/circuits/audit_proof_vkey.json";

const TRACK_RECORD_WASM = "/circuits/track_record.wasm";
const TRACK_RECORD_ZKEY = "/circuits/track_record.zkey";
const TRACK_RECORD_VKEY = "/circuits/track_record_vkey.json";

const ODDS_PRECISION = 1000000n;
const BPS_DENOM = 10000n;
const MAX_AUDIT_SIGNALS = 10;
const MAX_TRACK_RECORD_SIGNALS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalData {
  preimage: bigint;
  index: bigint;
  outcome: bigint; // 1=Favorable, 2=Unfavorable, 3=Void
  notional: bigint;
  odds: bigint;
  slaBps: bigint;
}

export interface Groth16Proof {
  proof: snarkjs.Groth16Proof;
  publicSignals: string[];
}

export interface AuditProofResult extends Groth16Proof {
  scorePositive: bigint;
  scoreNegative: bigint;
}

export interface TrackRecordProofResult extends Groth16Proof {
  totalGain: bigint;
  totalLoss: bigint;
  favCount: bigint;
  unfavCount: bigint;
  voidCount: bigint;
}

// ---------------------------------------------------------------------------
// Poseidon hash (lazy-loaded)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _poseidon: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _F: any = null;

async function ensurePoseidon(): Promise<void> {
  if (_poseidon) return;
  if (!poseidonBuilder) {
    const mod = await import("circomlibjs");
    poseidonBuilder = mod.buildPoseidon;
  }
  _poseidon = await poseidonBuilder();
  _F = _poseidon.F;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  await ensurePoseidon();
  return _F.toObject(_poseidon(inputs));
}

// ---------------------------------------------------------------------------
// Score computation (matches circuit logic exactly)
// ---------------------------------------------------------------------------

function computeAuditScore(signals: SignalData[]): {
  scorePositive: bigint;
  scoreNegative: bigint;
} {
  let totalGain = 0n;
  let totalLoss = 0n;

  for (const s of signals) {
    if (s.outcome === 1n) {
      totalGain += (s.notional * (s.odds - ODDS_PRECISION)) / ODDS_PRECISION;
    } else if (s.outcome === 2n) {
      totalLoss += (s.notional * s.slaBps) / BPS_DENOM;
    }
  }

  const score = totalGain - totalLoss;
  return {
    scorePositive: score >= 0n ? score : 0n,
    scoreNegative: score < 0n ? -score : 0n,
  };
}

function computeTrackRecordAggregates(signals: SignalData[]): {
  totalGain: bigint;
  totalLoss: bigint;
  favCount: bigint;
  unfavCount: bigint;
  voidCount: bigint;
} {
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

// ---------------------------------------------------------------------------
// Input builders
// ---------------------------------------------------------------------------

async function buildAuditInput(
  signals: SignalData[],
): Promise<Record<string, unknown>> {
  if (signals.length !== MAX_AUDIT_SIGNALS) {
    throw new Error(
      `Audit proof requires exactly ${MAX_AUDIT_SIGNALS} signals, got ${signals.length}`,
    );
  }

  const commitHash: bigint[] = [];
  const outcome: bigint[] = [];
  const notional: bigint[] = [];
  const odds: bigint[] = [];
  const slaBps: bigint[] = [];
  const signalPreimage: bigint[] = [];
  const realIndex: bigint[] = [];

  for (const s of signals) {
    const hash = await poseidonHash([s.preimage, s.index]);
    commitHash.push(hash);
    outcome.push(s.outcome);
    notional.push(s.notional);
    odds.push(s.odds);
    slaBps.push(s.slaBps);
    signalPreimage.push(s.preimage);
    realIndex.push(s.index);
  }

  const { scorePositive, scoreNegative } = computeAuditScore(signals);

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

function padArray(arr: bigint[], len: number, defaultVal: bigint): bigint[] {
  const padded = [...arr];
  while (padded.length < len) padded.push(defaultVal);
  return padded;
}

async function buildTrackRecordInput(
  signals: SignalData[],
): Promise<Record<string, unknown>> {
  if (signals.length > MAX_TRACK_RECORD_SIGNALS) {
    throw new Error(
      `Track record proof supports at most ${MAX_TRACK_RECORD_SIGNALS} signals, got ${signals.length}`,
    );
  }
  if (signals.length === 0) {
    throw new Error("Track record proof requires at least 1 signal");
  }

  const commitHash: bigint[] = [];
  const outcome: bigint[] = [];
  const notional: bigint[] = [];
  const odds: bigint[] = [];
  const slaBps: bigint[] = [];
  const signalPreimage: bigint[] = [];
  const realIndex: bigint[] = [];

  for (const s of signals) {
    const hash = await poseidonHash([s.preimage, s.index]);
    commitHash.push(hash);
    outcome.push(s.outcome);
    notional.push(s.notional);
    odds.push(s.odds);
    slaBps.push(s.slaBps);
    signalPreimage.push(s.preimage);
    realIndex.push(s.index);
  }

  const { totalGain, totalLoss, favCount, unfavCount, voidCount } =
    computeTrackRecordAggregates(signals);

  // Pad to MAX_TRACK_RECORD_SIGNALS with dummy values
  const dummyHash = await poseidonHash([0n, 1n]);

  return {
    signalPreimage: padArray(signalPreimage, MAX_TRACK_RECORD_SIGNALS, 0n),
    realIndex: padArray(realIndex, MAX_TRACK_RECORD_SIGNALS, 1n),
    commitHash: padArray(commitHash, MAX_TRACK_RECORD_SIGNALS, dummyHash),
    outcome: padArray(outcome, MAX_TRACK_RECORD_SIGNALS, 3n),
    notional: padArray(notional, MAX_TRACK_RECORD_SIGNALS, 0n),
    odds: padArray(odds, MAX_TRACK_RECORD_SIGNALS, ODDS_PRECISION),
    slaBps: padArray(slaBps, MAX_TRACK_RECORD_SIGNALS, 0n),
    signalCount: BigInt(signals.length),
    totalGain,
    totalLoss,
    favCount,
    unfavCount,
    voidCount,
  };
}

// ---------------------------------------------------------------------------
// Proof generation
// ---------------------------------------------------------------------------

/**
 * Generate a Groth16 audit proof for 10 signals.
 * Proves the quality score computation is correct without revealing signal details.
 */
export async function generateAuditProof(
  signals: SignalData[],
): Promise<AuditProofResult> {
  const input = await buildAuditInput(signals);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    AUDIT_WASM,
    AUDIT_ZKEY,
  );

  const { scorePositive, scoreNegative } = computeAuditScore(signals);

  return { proof, publicSignals, scorePositive, scoreNegative };
}

/**
 * Generate a Groth16 track record proof for 1-20 signals.
 * Proves aggregate statistics (gains, losses, counts) without revealing individual picks.
 */
export async function generateTrackRecordProof(
  signals: SignalData[],
): Promise<TrackRecordProofResult> {
  const input = await buildTrackRecordInput(signals);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    TRACK_RECORD_WASM,
    TRACK_RECORD_ZKEY,
  );

  const { totalGain, totalLoss, favCount, unfavCount, voidCount } =
    computeTrackRecordAggregates(signals);

  return {
    proof,
    publicSignals,
    totalGain,
    totalLoss,
    favCount,
    unfavCount,
    voidCount,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function fetchVkey(path: string): Promise<snarkjs.VKey> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to fetch verification key: ${path}`);
  return resp.json();
}

/**
 * Verify an audit proof. Returns true if valid.
 */
export async function verifyAuditProof(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
): Promise<boolean> {
  const vkey = await fetchVkey(AUDIT_VKEY);
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Verify a track record proof. Returns true if valid.
 */
export async function verifyTrackRecordProof(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
): Promise<boolean> {
  const vkey = await fetchVkey(TRACK_RECORD_VKEY);
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// ---------------------------------------------------------------------------
// Solidity calldata formatting
// ---------------------------------------------------------------------------

/**
 * Format a Groth16 proof into calldata for on-chain verification.
 * Returns the encoded bytes for the Solidity verifyProof() call.
 */
export async function proofToSolidityCalldata(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
): Promise<string> {
  return snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
}

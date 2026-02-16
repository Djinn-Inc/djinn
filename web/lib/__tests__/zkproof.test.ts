import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock snarkjs
const mockFullProve = vi.fn();
const mockVerify = vi.fn();
const mockExportSolidityCallData = vi.fn();

vi.mock("snarkjs", () => ({
  groth16: {
    fullProve: (...args: unknown[]) => mockFullProve(...args),
    verify: (...args: unknown[]) => mockVerify(...args),
    exportSolidityCallData: (...args: unknown[]) =>
      mockExportSolidityCallData(...args),
  },
}));

// Mock circomlibjs
const mockPoseidon = vi.fn();
const mockF = {
  toObject: vi.fn((x: unknown) => x),
};

vi.mock("circomlibjs", () => ({
  buildPoseidon: async () => {
    const fn = (...args: unknown[]) => mockPoseidon(...args);
    fn.F = mockF;
    return fn;
  },
}));

// Mock fetch for vkey
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  generateAuditProof,
  generateTrackRecordProof,
  verifyAuditProof,
  verifyTrackRecordProof,
  proofToSolidityCalldata,
  poseidonHash,
  type SignalData,
} from "../zkproof";

beforeEach(() => {
  vi.clearAllMocks();
  // Default poseidon behavior: return sum of inputs for predictability
  mockPoseidon.mockImplementation((...args: bigint[][]) => {
    const inputs = args[0];
    return inputs.reduce((a: bigint, b: bigint) => a + b, 0n);
  });
  mockF.toObject.mockImplementation((x: unknown) => x);
});

// ---------------------------------------------------------------------------
// poseidonHash
// ---------------------------------------------------------------------------

describe("poseidonHash", () => {
  it("calls poseidon with inputs and returns field element", async () => {
    mockPoseidon.mockReturnValueOnce(42n);
    mockF.toObject.mockReturnValueOnce(42n);

    const result = await poseidonHash([1n, 2n]);

    expect(result).toBe(42n);
    expect(mockPoseidon).toHaveBeenCalledWith([1n, 2n]);
  });
});

// ---------------------------------------------------------------------------
// generateAuditProof
// ---------------------------------------------------------------------------

describe("generateAuditProof", () => {
  function makeSignals(count: number): SignalData[] {
    return Array.from({ length: count }, (_, i) => ({
      preimage: BigInt(1000 + i),
      index: BigInt(i + 1),
      outcome: 1n, // All favorable
      notional: 1000000n, // 1 USDC
      odds: 2000000n, // 2.0x
      slaBps: 15000n,
    }));
  }

  it("generates proof for 10 signals", async () => {
    const mockProof = { pi_a: [], pi_b: [], pi_c: [], protocol: "groth16" };
    const mockPublicSignals = ["100", "200"];
    mockFullProve.mockResolvedValueOnce({
      proof: mockProof,
      publicSignals: mockPublicSignals,
    });

    const signals = makeSignals(10);
    const result = await generateAuditProof(signals);

    expect(result.proof).toBe(mockProof);
    expect(result.publicSignals).toEqual(mockPublicSignals);
    // All favorable with 2.0x odds on 1 USDC each: gain = 10 * 1M * (2M - 1M) / 1M = 10M
    expect(result.scorePositive).toBe(10000000n);
    expect(result.scoreNegative).toBe(0n);

    // Verify snarkjs.groth16.fullProve was called
    expect(mockFullProve).toHaveBeenCalledOnce();
    const input = mockFullProve.mock.calls[0][0];
    expect(input.signalPreimage).toHaveLength(10);
    expect(input.outcome).toHaveLength(10);
  });

  it("rejects wrong signal count", async () => {
    await expect(generateAuditProof(makeSignals(5))).rejects.toThrow(
      "requires exactly 10 signals",
    );
  });

  it("computes negative score for unfavorable signals", async () => {
    mockFullProve.mockResolvedValueOnce({
      proof: {},
      publicSignals: [],
    });

    const signals = Array.from({ length: 10 }, (_, i) => ({
      preimage: BigInt(1000 + i),
      index: BigInt(i + 1),
      outcome: 2n, // All unfavorable
      notional: 1000000n,
      odds: 2000000n,
      slaBps: 10000n, // 100% SLA
    }));

    const result = await generateAuditProof(signals);
    // loss = 10 * 1M * 10000 / 10000 = 10M
    expect(result.scorePositive).toBe(0n);
    expect(result.scoreNegative).toBe(10000000n);
  });
});

// ---------------------------------------------------------------------------
// generateTrackRecordProof
// ---------------------------------------------------------------------------

describe("generateTrackRecordProof", () => {
  it("generates proof for signals with padding", async () => {
    mockFullProve.mockResolvedValueOnce({
      proof: {},
      publicSignals: ["1", "2"],
    });

    const signals: SignalData[] = [
      {
        preimage: 100n,
        index: 1n,
        outcome: 1n,
        notional: 1000000n,
        odds: 1500000n, // 1.5x
        slaBps: 5000n,
      },
      {
        preimage: 200n,
        index: 2n,
        outcome: 2n,
        notional: 2000000n,
        odds: 1800000n,
        slaBps: 10000n, // 100%
      },
    ];

    const result = await generateTrackRecordProof(signals);

    expect(result.favCount).toBe(1n);
    expect(result.unfavCount).toBe(1n);
    expect(result.voidCount).toBe(0n);
    // gain = 1M * (1.5M - 1M) / 1M = 500000
    expect(result.totalGain).toBe(500000n);
    // loss = 2M * 10000 / 10000 = 2M
    expect(result.totalLoss).toBe(2000000n);

    // Verify padding
    const input = mockFullProve.mock.calls[0][0];
    expect(input.signalPreimage).toHaveLength(20);
    expect(input.signalCount).toBe(2n);
  });

  it("rejects too many signals", async () => {
    const signals = Array.from({ length: 21 }, (_, i) => ({
      preimage: BigInt(i),
      index: BigInt(i + 1),
      outcome: 1n,
      notional: 1n,
      odds: 1000000n,
      slaBps: 0n,
    }));

    await expect(generateTrackRecordProof(signals)).rejects.toThrow(
      "at most 20 signals",
    );
  });

  it("rejects empty signals", async () => {
    await expect(generateTrackRecordProof([])).rejects.toThrow(
      "at least 1 signal",
    );
  });

  it("handles void signals correctly", async () => {
    mockFullProve.mockResolvedValueOnce({
      proof: {},
      publicSignals: [],
    });

    const signals: SignalData[] = [
      {
        preimage: 100n,
        index: 1n,
        outcome: 3n, // Void
        notional: 1000000n,
        odds: 2000000n,
        slaBps: 5000n,
      },
    ];

    const result = await generateTrackRecordProof(signals);
    expect(result.voidCount).toBe(1n);
    expect(result.favCount).toBe(0n);
    expect(result.unfavCount).toBe(0n);
    expect(result.totalGain).toBe(0n);
    expect(result.totalLoss).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

describe("verifyAuditProof", () => {
  it("fetches vkey and calls snarkjs.verify", async () => {
    const vkey = { protocol: "groth16", curve: "bn128" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => vkey,
    });
    mockVerify.mockResolvedValueOnce(true);

    const proof = { pi_a: [], pi_b: [], pi_c: [], protocol: "groth16" };
    const result = await verifyAuditProof(
      proof as unknown as Parameters<typeof verifyAuditProof>[0],
      ["100", "200"],
    );

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/circuits/audit_proof_vkey.json");
    expect(mockVerify).toHaveBeenCalledWith(vkey, ["100", "200"], proof);
  });

  it("throws on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    await expect(
      verifyAuditProof({} as never, []),
    ).rejects.toThrow("Failed to fetch verification key");
  });
});

describe("verifyTrackRecordProof", () => {
  it("uses track record vkey", async () => {
    const vkey = { protocol: "groth16" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => vkey,
    });
    mockVerify.mockResolvedValueOnce(true);

    await verifyTrackRecordProof({} as never, []);

    expect(mockFetch).toHaveBeenCalledWith(
      "/circuits/track_record_vkey.json",
    );
  });
});

// ---------------------------------------------------------------------------
// Solidity calldata
// ---------------------------------------------------------------------------

describe("proofToSolidityCalldata", () => {
  it("calls snarkjs exportSolidityCallData", async () => {
    mockExportSolidityCallData.mockResolvedValueOnce("0x1234");

    const result = await proofToSolidityCalldata({} as never, ["42"]);

    expect(result).toBe("0x1234");
    expect(mockExportSolidityCallData).toHaveBeenCalledWith({}, ["42"]);
  });
});

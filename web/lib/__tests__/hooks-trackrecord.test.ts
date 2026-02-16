import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock contract module
const mockQueryFilter = vi.fn();
const mockFilters = {
  TrackRecordSubmitted: vi.fn().mockReturnValue("mock-filter"),
};

vi.mock("../contracts", () => ({
  getTrackRecordContract: () => ({
    queryFilter: mockQueryFilter,
    filters: mockFilters,
  }),
  ADDRESSES: {
    trackRecord: "0x0000000000000000000000000000000000000007",
    signalCommitment: "0x0000000000000000000000000000000000000001",
    escrow: "0x0000000000000000000000000000000000000002",
    collateral: "0x0000000000000000000000000000000000000003",
    creditLedger: "0x0000000000000000000000000000000000000004",
    account: "0x0000000000000000000000000000000000000005",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    audit: "0x0000000000000000000000000000000000000006",
  },
}));

// Mock the provider hook
const mockProvider = { getBlockNumber: vi.fn() };
vi.mock("../hooks", async () => {
  const actual = await vi.importActual("../hooks");
  return {
    ...(actual as Record<string, unknown>),
    useEthersProvider: () => mockProvider,
  };
});

import { useTrackRecordProofs } from "../hooks/useTrackRecordProofs";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEventLog(args: unknown[], blockNumber: number) {
  return {
    args,
    blockNumber,
  };
}

describe("useTrackRecordProofs", () => {
  const mockEvents = [
    makeEventLog(
      [0n, "0xGenius1", 5n, 500000000n, 200000000n, 3n, 1n, 1n, "0xabc123"],
      100,
    ),
    makeEventLog(
      [1n, "0xGenius1", 10n, 1000000000n, 300000000n, 7n, 2n, 1n, "0xdef456"],
      200,
    ),
  ];

  it("fetches track record proofs for a genius", async () => {
    mockQueryFilter.mockResolvedValueOnce(mockEvents);

    const { result } = renderHook(() =>
      useTrackRecordProofs("0xGenius1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.proofs).toHaveLength(2);
    // Sorted by block number descending
    expect(result.current.proofs[0].recordId).toBe(1n);
    expect(result.current.proofs[0].signalCount).toBe(10n);
    expect(result.current.proofs[1].recordId).toBe(0n);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch without genius address", async () => {
    const { result } = renderHook(() =>
      useTrackRecordProofs(undefined),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.proofs).toHaveLength(0);
    expect(mockQueryFilter).not.toHaveBeenCalled();
  });

  it("clears proofs when address becomes undefined", async () => {
    mockQueryFilter.mockResolvedValueOnce(mockEvents);

    const { result, rerender } = renderHook(
      ({ addr }: { addr?: string }) => useTrackRecordProofs(addr),
      { initialProps: { addr: "0xGenius1" } as { addr?: string } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.proofs).toHaveLength(2);

    rerender({ addr: undefined });

    await waitFor(() => {
      expect(result.current.proofs).toHaveLength(0);
    });
  });

  it("handles fetch error", async () => {
    mockQueryFilter.mockRejectedValueOnce(new Error("RPC timeout"));

    const { result } = renderHook(() =>
      useTrackRecordProofs("0xGenius1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("RPC timeout");
    expect(result.current.proofs).toHaveLength(0);
  });

  it("parses event args correctly", async () => {
    mockQueryFilter.mockResolvedValueOnce([mockEvents[0]]);

    const { result } = renderHook(() =>
      useTrackRecordProofs("0xGenius1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const proof = result.current.proofs[0];
    expect(proof.recordId).toBe(0n);
    expect(proof.genius).toBe("0xGenius1");
    expect(proof.signalCount).toBe(5n);
    expect(proof.totalGain).toBe(500000000n);
    expect(proof.totalLoss).toBe(200000000n);
    expect(proof.favCount).toBe(3n);
    expect(proof.unfavCount).toBe(1n);
    expect(proof.voidCount).toBe(1n);
    expect(proof.proofHash).toBe("0xabc123");
    expect(proof.blockNumber).toBe(100);
  });
});

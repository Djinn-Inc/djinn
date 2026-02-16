"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useEthersProvider } from "../hooks";
import { getTrackRecordContract, ADDRESSES } from "../contracts";

export interface TrackRecordProofEntry {
  recordId: bigint;
  genius: string;
  signalCount: bigint;
  totalGain: bigint;
  totalLoss: bigint;
  favCount: bigint;
  unfavCount: bigint;
  voidCount: bigint;
  proofHash: string;
  blockNumber: number;
}

export function useTrackRecordProofs(geniusAddress?: string) {
  const provider = useEthersProvider();
  const [proofs, setProofs] = useState<TrackRecordProofEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!provider || !geniusAddress || ADDRESSES.trackRecord === ethers.ZeroAddress) {
      setProofs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contract = getTrackRecordContract(provider);
      const filter = contract.filters.TrackRecordSubmitted(null, geniusAddress);
      const events = await contract.queryFilter(filter, 0, "latest");

      const entries: TrackRecordProofEntry[] = events.map((e) => {
        const log = e as ethers.EventLog;
        return {
          recordId: BigInt(log.args[0]),
          genius: String(log.args[1]),
          signalCount: BigInt(log.args[2]),
          totalGain: BigInt(log.args[3]),
          totalLoss: BigInt(log.args[4]),
          favCount: BigInt(log.args[5]),
          unfavCount: BigInt(log.args[6]),
          voidCount: BigInt(log.args[7]),
          proofHash: String(log.args[8]),
          blockNumber: log.blockNumber,
        };
      });

      entries.sort((a, b) => b.blockNumber - a.blockNumber);
      if (!cancelledRef.current) {
        setProofs(entries);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch track record proofs");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [provider, geniusAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { proofs, loading, error, refresh };
}

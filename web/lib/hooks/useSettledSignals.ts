"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getEscrowContract } from "../contracts";
import { fetchGeniusSignals, type SubgraphSignal } from "../subgraph";

/** Private signal data saved to localStorage during signal creation. */
export interface SavedSignalData {
  signalId: string;
  preimage: string;
  realIndex: number;
  sport: string;
  pick: string;
  slaMultiplierBps: number;
  createdAt: number;
}

/** A signal ready for track record proof generation, merging private + on-chain data. */
export interface ProofReadySignal {
  signalId: string;
  preimage: string;
  realIndex: number;
  sport: string;
  pick: string;
  // Per-purchase data (a signal may have multiple purchases)
  purchases: ProofReadyPurchase[];
  status: string;
  createdAt: number;
}

export interface ProofReadyPurchase {
  purchaseId: string;
  notional: string;
  odds: string;
  outcome: string; // "Pending" | "Favorable" | "Unfavorable" | "Void"
  slaBps: string;
}

/** Read saved signal data from localStorage. */
export function getSavedSignals(): SavedSignalData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("djinn-signal-data");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Hook that merges localStorage private signal data with on-chain/subgraph
 * purchase data to produce proof-ready signal records.
 */
export function useSettledSignals(geniusAddress: string | undefined) {
  const provider = useEthersProvider();
  const [signals, setSignals] = useState<ProofReadySignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!geniusAddress) {
      setSignals([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Read private data from localStorage
      const saved = getSavedSignals();
      if (saved.length === 0) {
        setSignals([]);
        return;
      }

      // Step 2: Query subgraph for signal status + purchases
      const subgraphSignals = await fetchGeniusSignals(geniusAddress);
      const subgraphMap = new Map<string, SubgraphSignal>();
      for (const sig of subgraphSignals) {
        subgraphMap.set(sig.id, sig);
      }

      // Step 3: For purchases with settled outcomes, try to get odds from contract
      const escrow = provider ? getEscrowContract(provider) : null;

      const results: ProofReadySignal[] = [];

      for (const s of saved) {
        const subSig = subgraphMap.get(s.signalId);

        const purchases: ProofReadyPurchase[] = [];

        if (subSig?.purchases) {
          for (const p of subSig.purchases) {
            if (p.outcome === "Pending") continue;

            let odds = "0";
            // Try to fetch odds from on-chain Purchase struct
            if (escrow && p.onChainPurchaseId) {
              try {
                const purchase = await escrow.getPurchase(p.onChainPurchaseId);
                odds = purchase.odds?.toString() ?? "0";
              } catch {
                // Contract query failed, odds will be 0
              }
            }

            purchases.push({
              purchaseId: p.onChainPurchaseId,
              notional: p.notional,
              odds,
              outcome: p.outcome,
              slaBps: subSig.slaMultiplierBps,
            });
          }
        }

        results.push({
          signalId: s.signalId,
          preimage: s.preimage,
          realIndex: s.realIndex,
          sport: s.sport,
          pick: s.pick,
          purchases,
          status: subSig?.status ?? "Unknown",
          createdAt: s.createdAt,
        });
      }

      if (!cancelledRef.current) {
        setSignals(results);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load signal data");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [geniusAddress, provider]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { signals, loading, error, refresh };
}

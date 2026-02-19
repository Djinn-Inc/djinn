"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getReadProvider } from "../hooks";
import { getEscrowContract } from "../contracts";
import { fetchGeniusSignals, type SubgraphSignal } from "../subgraph";

/** Private signal data saved to localStorage during signal creation. */
export interface SavedSignalData {
  signalId: string;
  preimage: string;
  realIndex: number;
  sport: string;
  pick: string;
  minOdds?: number | null;
  minOddsAmerican?: string | null;
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

const LEGACY_KEY = "djinn-signal-data";

function signalStorageKey(address: string): string {
  return `djinn-signal-data:${address.toLowerCase()}`;
}

/** Read saved signal data from localStorage, namespaced by wallet address. */
export function getSavedSignals(address?: string): SavedSignalData[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const key = signalStorageKey(address);
    let raw = localStorage.getItem(key);

    // Lazy migration: move legacy non-namespaced data to namespaced key
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        localStorage.setItem(key, legacyRaw);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacyRaw;
      }
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write saved signal data to localStorage, namespaced by wallet address. */
export function saveSavedSignals(address: string, signals: SavedSignalData[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(signalStorageKey(address), JSON.stringify(signals));
  } catch {
    console.warn("Failed to save signal data to localStorage");
  }
}

/**
 * Hook that merges localStorage private signal data with on-chain/subgraph
 * purchase data to produce proof-ready signal records.
 */
export function useSettledSignals(geniusAddress: string | undefined) {
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
      // Step 1: Read private data from localStorage (namespaced by wallet)
      const saved = getSavedSignals(geniusAddress);
      if (saved.length === 0) {
        setSignals([]);
        setLoading(false);
        return;
      }

      // Step 2: Query subgraph for signal status + purchases
      const subgraphSignals = await fetchGeniusSignals(geniusAddress);
      const subgraphMap = new Map<string, SubgraphSignal>();
      for (const sig of subgraphSignals) {
        subgraphMap.set(sig.id, sig);
      }

      // Step 3: For purchases with settled outcomes, try to get odds from contract
      const escrow = getEscrowContract(getReadProvider());

      const results: ProofReadySignal[] = [];

      for (const s of saved) {
        const subSig = subgraphMap.get(s.signalId);

        const purchases: ProofReadyPurchase[] = [];

        if (subSig?.purchases) {
          for (const p of subSig.purchases) {
            if (p.outcome === "Pending") continue;

            let odds = "0";
            // Try to fetch odds from on-chain Purchase struct
            if (p.onChainPurchaseId) {
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
  }, [geniusAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { signals, loading, error, refresh };
}

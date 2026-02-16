"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchLeaderboard,
  isSubgraphConfigured,
  type SubgraphGeniusEntry,
} from "../subgraph";
import type { GeniusLeaderboardEntry } from "../types";

function toLeaderboardEntry(g: SubgraphGeniusEntry): GeniusLeaderboardEntry {
  const totalGain = Number(g.aggregateQualityScore);
  const totalVolume = Number(g.totalVolume) / 1e6; // USDC decimals
  const roi = totalVolume > 0 ? (totalGain / totalVolume) * 100 : 0;

  return {
    address: g.id,
    qualityScore: totalGain,
    totalSignals: Number(g.totalSignals),
    auditCount: Number(g.totalAudits),
    roi,
  };
}

export function useLeaderboard() {
  const [data, setData] = useState<GeniusLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isSubgraphConfigured();

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await fetchLeaderboard(100);
      setData(entries.map(toLeaderboardEntry));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch leaderboard";
      setError(msg);
      console.warn("useLeaderboard error:", msg);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, configured, refresh };
}

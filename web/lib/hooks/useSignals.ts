"use client";

import { useCallback, useEffect, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getActiveSignals, getSignalsByGenius } from "../events";
import type { SignalEvent } from "../events";

export function useActiveSignals(sport?: string, geniusAddress?: string) {
  const provider = useEthersProvider();
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      let result: SignalEvent[];
      if (geniusAddress) {
        result = await getSignalsByGenius(provider, geniusAddress);
      } else {
        result = await getActiveSignals(provider);
      }

      if (sport) {
        result = result.filter((s) => s.sport === sport);
      }

      setSignals(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch signals");
    } finally {
      setLoading(false);
    }
  }, [provider, sport, geniusAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { signals, loading, error, refresh };
}

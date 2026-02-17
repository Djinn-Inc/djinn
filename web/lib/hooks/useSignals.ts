"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getReadProvider } from "../hooks";
import { getActiveSignals, getSignalsByGenius } from "../events";
import type { SignalEvent } from "../events";

export function useActiveSignals(sport?: string, geniusAddress?: string, includeAll: boolean = false) {
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
      let result: SignalEvent[];
      if (geniusAddress) {
        result = await getSignalsByGenius(provider, geniusAddress, 0, includeAll);
      } else {
        result = await getActiveSignals(provider);
      }

      if (sport) {
        result = result.filter((s) => s.sport === sport);
      }

      if (!cancelledRef.current) {
        setSignals(result);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch signals");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [sport, geniusAddress, includeAll]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { signals, loading, error, refresh };
}

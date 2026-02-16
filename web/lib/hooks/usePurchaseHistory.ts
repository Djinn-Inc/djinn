"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getPurchasesByBuyer } from "../events";
import type { PurchaseEvent } from "../events";

export function usePurchaseHistory(buyerAddress?: string) {
  const provider = useEthersProvider();
  const [purchases, setPurchases] = useState<PurchaseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!provider || !buyerAddress) {
      setPurchases([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getPurchasesByBuyer(provider, buyerAddress);
      if (!cancelledRef.current) {
        setPurchases(result);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch purchases");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [provider, buyerAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { purchases, loading, error, refresh };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getPurchasesByBuyer } from "../events";
import type { PurchaseEvent } from "../events";

export function usePurchaseHistory(buyerAddress?: string) {
  const provider = useEthersProvider();
  const [purchases, setPurchases] = useState<PurchaseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !buyerAddress) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPurchasesByBuyer(provider, buyerAddress);
      setPurchases(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch purchases");
    } finally {
      setLoading(false);
    }
  }, [provider, buyerAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { purchases, loading, error, refresh };
}

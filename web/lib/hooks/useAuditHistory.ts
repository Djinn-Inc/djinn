"use client";

import { useCallback, useEffect, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getAuditsByGenius, getAuditsByIdiot } from "../events";
import type { AuditEvent } from "../events";

export function useAuditHistory(geniusAddress?: string) {
  const provider = useEthersProvider();
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !geniusAddress) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditsByGenius(provider, geniusAddress);
      setAudits(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch audit history");
    } finally {
      setLoading(false);
    }
  }, [provider, geniusAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Compute aggregate quality score from audit history
  const aggregateQualityScore = audits.reduce(
    (sum, a) => sum + a.qualityScore,
    0n,
  );

  return { audits, loading, error, refresh, aggregateQualityScore };
}

export function useIdiotAuditHistory(idiotAddress?: string) {
  const provider = useEthersProvider();
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !idiotAddress) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditsByIdiot(provider, idiotAddress);
      setAudits(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch audit history");
    } finally {
      setLoading(false);
    }
  }, [provider, idiotAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { audits, loading, error, refresh };
}

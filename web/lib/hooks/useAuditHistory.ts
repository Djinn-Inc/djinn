"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEthersProvider } from "../hooks";
import { getAuditsByGenius, getAuditsByIdiot } from "../events";
import type { AuditEvent } from "../events";

export function useAuditHistory(geniusAddress?: string) {
  const provider = useEthersProvider();
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!provider || !geniusAddress) {
      setAudits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditsByGenius(provider, geniusAddress);
      if (!cancelledRef.current) {
        setAudits(result);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch audit history");
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
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!provider || !idiotAddress) {
      setAudits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditsByIdiot(provider, idiotAddress);
      if (!cancelledRef.current) {
        setAudits(result);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch audit history");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [provider, idiotAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { audits, loading, error, refresh };
}

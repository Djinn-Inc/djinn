"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getReadProvider } from "../hooks";
import { getAuditsByGenius, getAuditsByIdiot } from "../events";
import type { AuditEvent } from "../events";

export function useAuditHistory(geniusAddress?: string) {
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!geniusAddress) {
      setAudits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
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
  }, [geniusAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  const aggregateQualityScore = audits.reduce(
    (sum, a) => sum + a.qualityScore,
    0n,
  );

  return { audits, loading, error, refresh, aggregateQualityScore };
}

export function useIdiotAuditHistory(idiotAddress?: string) {
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!idiotAddress) {
      setAudits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
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
  }, [idiotAddress]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { audits, loading, error, refresh };
}

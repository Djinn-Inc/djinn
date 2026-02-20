"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useSignal, useVoidSignal, useSignalPurchases, useSignalNotionalFilled, humanizeError } from "@/lib/hooks";
import { getSavedSignals } from "@/lib/hooks/useSettledSignals";
import { SignalStatus, formatUsdc, formatBps, truncateAddress } from "@/lib/types";

export default function GeniusSignalDetail() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const signalId = params.id as string;

  const { signal, loading, error } = useSignal(
    signalId ? BigInt(signalId) : undefined
  );
  const { voidSignal, loading: voidLoading, error: voidError } = useVoidSignal();
  const { purchases, totalNotional, loading: purchasesLoading } = useSignalPurchases(signalId);
  const { filled: notionalFilled } = useSignalNotionalFilled(signalId);

  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Find local private data for this signal (real pick, decoys, etc.)
  const savedData = useMemo(() => {
    if (!address) return null;
    const saved = getSavedSignals(address);
    return saved.find((s) => s.signalId === signalId) ?? null;
  }, [address, signalId]);

  const isOwner = signal && address
    ? signal.genius.toLowerCase() === address.toLowerCase()
    : false;

  const isActive = signal?.status === SignalStatus.Active;
  const isExpired = signal
    ? Number(signal.expiresAt) * 1000 < Date.now()
    : false;
  const isPurchased = signal?.status === SignalStatus.Purchased;
  const canCancel = isOwner && isActive && !isExpired && !isPurchased;
  const hasPurchases = purchases.length > 0;

  const handleCancel = async () => {
    setActionError(null);
    try {
      await voidSignal(BigInt(signalId));
      setCancelSuccess(true);
      setShowConfirmCancel(false);
    } catch (err) {
      setActionError(humanizeError(err, "Failed to cancel signal"));
    }
  };

  const handleCancelAndEdit = async () => {
    setActionError(null);
    try {
      await voidSignal(BigInt(signalId));
      // Redirect to create new signal page
      router.push("/genius/signal/new");
    } catch (err) {
      setActionError(humanizeError(err, "Failed to cancel signal"));
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-center text-slate-500">Loading signal...</p>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-center text-red-500">
          {error || "Signal not found"}
        </p>
        <div className="text-center mt-4">
          <Link href="/genius" className="text-sm text-genius-500 hover:text-genius-600">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel =
    cancelSuccess ? "Cancelled" :
    signal.status === SignalStatus.Voided ? "Cancelled" :
    signal.status === SignalStatus.Settled ? "Settled" :
    signal.status === SignalStatus.Purchased ? "Purchased" :
    isExpired ? "Expired" : "Active";

  const statusColor =
    statusLabel === "Active" ? "bg-green-100 text-green-600 border-green-200" :
    statusLabel === "Expired" ? "bg-slate-100 text-slate-500 border-slate-200" :
    statusLabel === "Cancelled" ? "bg-red-100 text-red-500 border-red-200" :
    statusLabel === "Purchased" ? "bg-blue-100 text-blue-600 border-blue-200" :
    "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/genius"
        className="text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6 inline-block"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {signal.sport} Signal
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">
            #{truncateAddress(signalId)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium border shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Action Errors */}
      {(actionError || voidError) && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
          <p className="text-sm text-red-600">{actionError || voidError}</p>
        </div>
      )}

      {/* Cancel Success */}
      {cancelSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4" role="status">
          <p className="text-sm text-green-700">
            Signal cancelled successfully. Your collateral has been released.
          </p>
        </div>
      )}

      {/* Signal Details */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Fee</p>
            <p className="text-slate-900 font-medium mt-1">{formatBps(signal.maxPriceBps)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">SLA</p>
            <p className="text-slate-900 font-medium mt-1">{formatBps(signal.slaMultiplierBps)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Max Notional</p>
            <p className="text-slate-900 font-medium mt-1">${formatUsdc(signal.maxNotional)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Created</p>
            <p className="text-slate-900 font-medium mt-1">
              {new Date(Number(signal.createdAt) * 1000).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Expires</p>
            <p className={`font-medium mt-1 ${isExpired ? "text-red-500" : "text-slate-900"}`}>
              {new Date(Number(signal.expiresAt) * 1000).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Sportsbooks</p>
            <p className="text-slate-900 font-medium mt-1">
              {signal.availableSportsbooks.length > 0
                ? signal.availableSportsbooks.join(", ")
                : "Any"}
            </p>
          </div>
        </div>
      </div>

      {/* Purchases / Notional Taken */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Purchases
          {!purchasesLoading && hasPurchases && (
            <span className="text-sm font-normal text-slate-400 ml-2">
              {purchases.length} purchase{purchases.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        {purchasesLoading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : !hasPurchases ? (
          <div>
            <p className="text-slate-500 text-sm">
              No purchases yet. The full notional (${formatUsdc(signal.maxNotional)}) is still available.
            </p>
            {signal.minNotional > 0n && (
              <p className="text-xs text-slate-400 mt-1">Min purchase: ${formatUsdc(signal.minNotional)}</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500">Notional filled</span>
                <span className="font-medium text-slate-900">
                  ${formatUsdc(notionalFilled)} / ${formatUsdc(signal.maxNotional)}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-genius-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, signal.maxNotional > 0n
                      ? Number((notionalFilled * 100n) / signal.maxNotional)
                      : 0)}%`,
                  }}
                />
              </div>
              {signal.minNotional > 0n && (
                <p className="text-xs text-slate-400 mt-1">Min purchase: ${formatUsdc(signal.minNotional)}</p>
              )}
              {notionalFilled >= signal.maxNotional && signal.maxNotional > 0n && (
                <p className="text-xs text-green-600 mt-1 font-medium">Fully filled</p>
              )}
            </div>
            <div className="space-y-2">
              {purchases.map((p) => (
                <div key={p.purchaseId.toString()} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500">
                    {truncateAddress(p.buyer)}
                  </span>
                  <span className="font-medium text-slate-900">
                    ${formatUsdc(p.notional)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lines (decoys + real pick if local data available) */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Lines
          {savedData && (
            <span className="text-sm font-normal text-genius-500 ml-2">
              Your real pick is highlighted
            </span>
          )}
        </h2>
        {signal.decoyLines.length === 0 ? (
          <p className="text-slate-500 text-sm">No line data available.</p>
        ) : (
          <div className="space-y-2">
            {signal.decoyLines.map((line, i) => {
              const isReal = savedData?.realIndex === i;
              return (
                <div
                  key={i}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    isReal
                      ? "bg-genius-50 border-2 border-genius-300 font-medium text-genius-800"
                      : "bg-slate-50 border border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isReal && (
                      <span className="text-xs font-bold text-genius-500 uppercase">
                        Real
                      </span>
                    )}
                    <span className={isReal ? "" : "text-slate-500"}>
                      Line {i + 1}:
                    </span>
                    <span>{line}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!savedData && (
          <p className="text-xs text-slate-400 mt-3">
            Local signal data not found for this signal. The real pick cannot be highlighted.
            This may happen if the signal was created in a different browser session.
          </p>
        )}
      </div>

      {/* Actions */}
      {isOwner && !cancelSuccess && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Actions</h2>
          {!isActive || signal.status === SignalStatus.Voided ? (
            <p className="text-slate-500 text-sm">
              This signal is {statusLabel.toLowerCase()} and no actions are available.
            </p>
          ) : hasPurchases ? (
            <p className="text-slate-500 text-sm">
              This signal has been purchased and cannot be cancelled.
              It will settle through the normal audit cycle.
            </p>
          ) : isExpired ? (
            <p className="text-slate-500 text-sm">
              This signal has expired. No further actions are available.
            </p>
          ) : showConfirmCancel ? (
            <div>
              <p className="text-sm text-slate-700 mb-4">
                Are you sure you want to cancel this signal? This action is
                irreversible. Your collateral backing this signal will be
                released.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={voidLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {voidLoading ? "Cancelling..." : "Confirm Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelAndEdit}
                  disabled={voidLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-genius-600 text-white hover:bg-genius-700 disabled:opacity-50 transition-colors"
                >
                  {voidLoading ? "Cancelling..." : "Cancel & Create New"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmCancel(false)}
                  disabled={voidLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Keep Signal
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmCancel(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Cancel Signal
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmCancel(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-genius-200 text-genius-600 hover:bg-genius-50 transition-colors"
              >
                Cancel & Edit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

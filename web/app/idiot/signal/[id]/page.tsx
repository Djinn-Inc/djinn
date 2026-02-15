"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useSignal, usePurchaseSignal } from "@/lib/hooks";
import QualityScore from "@/components/QualityScore";
import {
  SignalStatus,
  signalStatusLabel,
  formatBps,
  formatUsdc,
  truncateAddress,
} from "@/lib/types";

export default function PurchaseSignal() {
  const params = useParams();
  const router = useRouter();
  const { authenticated } = usePrivy();
  const signalId = params.id ? BigInt(params.id as string) : undefined;
  const { signal, loading: signalLoading, error: signalError } =
    useSignal(signalId);
  const { purchase, loading: purchaseLoading, error: purchaseError } =
    usePurchaseSignal();

  const [notional, setNotional] = useState("");
  const [odds, setOdds] = useState("");
  const [purchased, setPurchased] = useState(false);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Purchase Signal</h1>
        <p className="text-slate-500">
          Connect your wallet to purchase this signal.
        </p>
      </div>
    );
  }

  if (signalLoading) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Loading signal data...</p>
      </div>
    );
  }

  if (signalError) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Signal Not Found</h1>
        <p className="text-slate-500 mb-8">{signalError}</p>
        <button onClick={() => router.push("/idiot")} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Signal not found</p>
      </div>
    );
  }

  const expiresDate = new Date(Number(signal.expiresAt) * 1000);
  const isExpired = expiresDate < new Date();
  const isActive = signal.status === SignalStatus.Active && !isExpired;

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signalId) return;

    const notionalBig = BigInt(Math.floor(Number(notional) * 1_000_000));
    const oddsBig = BigInt(Math.floor(Number(odds) * 100));

    try {
      await purchase(signalId, notionalBig, oddsBig);
      setPurchased(true);
    } catch {
      // Error captured in hook
    }
  };

  if (purchased) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Signal Purchased
        </h1>
        <p className="text-slate-500 mb-6">
          You now have access to this signal. The decryption key will be
          delivered to your wallet.
        </p>
        <div className="card text-left mb-8">
          <h3 className="text-sm font-medium text-slate-500 mb-3">
            Decoy Lines (one of these is real)
          </h3>
          <div className="space-y-1">
            {signal.decoyLines.map((line, i) => (
              <p
                key={i}
                className="text-sm text-slate-600 font-mono bg-slate-50 rounded px-3 py-2"
              >
                {i + 1}. {line}
              </p>
            ))}
          </div>
        </div>
        <button
          onClick={() => router.push("/idiot")}
          className="btn-primary"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => router.back()}
        className="text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        &larr; Back
      </button>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Signal Info */}
        <div className="md:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Signal #{params.id}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  by {truncateAddress(signal.genius)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isActive
                    ? "bg-green-100 text-green-600 border border-green-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {isActive ? "Active" : signalStatusLabel(signal.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Sport
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {signal.sport}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Max Price
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {formatBps(signal.maxPriceBps)} of notional
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  SLA Multiplier
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {formatBps(signal.slaMultiplierBps)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Expires
                </p>
                <p
                  className={`text-sm font-medium mt-1 ${
                    isExpired ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {expiresDate.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Decoy Lines */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                Decoy Lines (9 decoys + 1 real -- you cannot tell which is which)
              </p>
              <div className="space-y-1">
                {signal.decoyLines.map((line, i) => (
                  <p
                    key={i}
                    className="text-xs text-slate-500 font-mono bg-slate-50 rounded px-2 py-1.5"
                  >
                    {i + 1}. {line}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {signal.availableSportsbooks.length > 0 && (
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
                Available Sportsbooks
              </p>
              <div className="flex flex-wrap gap-2">
                {signal.availableSportsbooks.map((book) => (
                  <span
                    key={book}
                    className="rounded-lg bg-slate-200 px-3 py-1 text-sm text-slate-600"
                  >
                    {book}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Purchase Panel */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Purchase Signal
            </h2>

            {!isActive ? (
              <p className="text-sm text-slate-500">
                This signal is no longer available for purchase.
              </p>
            ) : (
              <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                  <label className="label">Notional (USDC)</label>
                  <input
                    type="number"
                    value={notional}
                    onChange={(e) => setNotional(e.target.value)}
                    placeholder="100.00"
                    min="0.01"
                    step="0.01"
                    className="input"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Reference amount for fee calculation
                  </p>
                </div>

                <div>
                  <label className="label">Odds (decimal)</label>
                  <input
                    type="number"
                    value={odds}
                    onChange={(e) => setOdds(e.target.value)}
                    placeholder="1.91"
                    min="1.01"
                    step="0.01"
                    className="input"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    e.g. 1.91 = -110 American
                  </p>
                </div>

                {notional && (
                  <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Fee</span>
                      <span className="text-slate-900">
                        $
                        {(
                          (Number(notional) * Number(signal.maxPriceBps)) /
                          10_000
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Collateral locked</span>
                      <span className="text-slate-900">
                        $
                        {(
                          (Number(notional) * Number(signal.slaMultiplierBps)) /
                          10_000
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {purchaseError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-xs text-red-600">{purchaseError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={purchaseLoading}
                  className="btn-primary w-full py-3"
                >
                  {purchaseLoading ? "Processing..." : "Purchase Signal"}
                </button>
              </form>
            )}
          </div>

          {/* Genius info sidebar */}
          <div className="card">
            <h3 className="text-sm font-medium text-slate-500 mb-3">
              Genius Stats
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500">Quality Score</p>
                <div className="mt-1">
                  <QualityScore score={0} size="sm" />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Signals</p>
                <p className="text-sm text-slate-900 font-medium">--</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Audit Count</p>
                <p className="text-sm text-slate-900 font-medium">--</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

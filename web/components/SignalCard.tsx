"use client";

import Link from "next/link";
import {
  type Signal,
  SignalStatus,
  signalStatusLabel,
  formatBps,
  truncateAddress,
} from "@/lib/types";

interface SignalCardProps {
  signalId: string;
  signal: Signal;
  showPurchaseLink?: boolean;
}

function statusColor(status: SignalStatus): string {
  switch (status) {
    case SignalStatus.Active:
      return "bg-green-100 text-green-600 border-green-200";
    case SignalStatus.Purchased:
      return "bg-blue-100 text-blue-600 border-blue-200";
    case SignalStatus.Settled:
      return "bg-slate-100 text-slate-500 border-slate-200";
    case SignalStatus.Voided:
      return "bg-red-100 text-red-600 border-red-200";
  }
}

export default function SignalCard({
  signalId,
  signal,
  showPurchaseLink = false,
}: SignalCardProps) {
  const expiresDate = new Date(Number(signal.expiresAt) * 1000);
  const isExpired = expiresDate < new Date();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            Signal #{signalId}
          </h3>
          <p className="text-sm text-slate-500">
            by {truncateAddress(signal.genius)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor(signal.status)}`}
        >
          {signalStatusLabel(signal.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Sport</p>
          <p className="text-sm text-slate-900 font-medium mt-1">{signal.sport}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Max Price
          </p>
          <p className="text-sm text-slate-900 font-medium mt-1">
            {formatBps(signal.maxPriceBps)}
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
            className={`text-sm font-medium mt-1 ${isExpired ? "text-red-600" : "text-slate-900"}`}
          >
            {expiresDate.toLocaleDateString()}
          </p>
        </div>
      </div>

      {signal.decoyLines.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
            Decoy Lines ({signal.decoyLines.length})
          </p>
          <div className="space-y-1">
            {signal.decoyLines.map((line, i) => (
              <p
                key={i}
                className="text-xs text-slate-500 font-mono bg-slate-50 rounded px-2 py-1"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {signal.availableSportsbooks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {signal.availableSportsbooks.map((book) => (
            <span
              key={book}
              className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
            >
              {book}
            </span>
          ))}
        </div>
      )}

      {showPurchaseLink && signal.status === SignalStatus.Active && !isExpired && (
        <Link
          href={`/idiot/signal/${signalId}`}
          className="block w-full rounded-lg bg-slate-900 py-2 text-center text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Purchase Signal
        </Link>
      )}
    </div>
  );
}

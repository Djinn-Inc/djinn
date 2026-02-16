"use client";

import { useState } from "react";
import QualityScore from "@/components/QualityScore";
import { useLeaderboard } from "@/lib/hooks/useLeaderboard";
import { truncateAddress } from "@/lib/types";

type SortField = "qualityScore" | "totalSignals" | "auditCount" | "roi";

export default function Leaderboard() {
  const { data, loading, error, configured } = useLeaderboard();
  const [sortBy, setSortBy] = useState<SortField>("qualityScore");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = [...data].sort((a, b) => {
    const multiplier = sortDesc ? -1 : 1;
    return (a[sortBy] - b[sortBy]) * multiplier;
  });

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(true);
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return "";
    return sortDesc ? " \u2193" : " \u2191";
  };

  const ariaSort = (field: SortField): "ascending" | "descending" | "none" => {
    if (sortBy !== field) return "none";
    return sortDesc ? "descending" : "ascending";
  };

  const sortKeyHandler = (field: SortField) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSort(field);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Genius Leaderboard</h1>
        <p className="text-slate-500 mt-1">
          Geniuses ranked by cryptographically verified track records
        </p>
      </div>

      {!configured && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-6 text-sm text-amber-700">
          Subgraph not configured. Leaderboard data will appear once the
          subgraph is deployed and NEXT_PUBLIC_SUBGRAPH_URL is set.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-6 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-medium w-12">#</th>
              <th className="pb-3 font-medium">Genius</th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("qualityScore")}
                onKeyDown={sortKeyHandler("qualityScore")}
                aria-sort={ariaSort("qualityScore")}
                tabIndex={0}
                role="columnheader"
              >
                Quality Score{sortIndicator("qualityScore")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("totalSignals")}
                onKeyDown={sortKeyHandler("totalSignals")}
                aria-sort={ariaSort("totalSignals")}
                tabIndex={0}
                role="columnheader"
              >
                Signals{sortIndicator("totalSignals")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("auditCount")}
                onKeyDown={sortKeyHandler("auditCount")}
                aria-sort={ariaSort("auditCount")}
                tabIndex={0}
                role="columnheader"
              >
                Audits{sortIndicator("auditCount")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("roi")}
                onKeyDown={sortKeyHandler("roi")}
                aria-sort={ariaSort("roi")}
                tabIndex={0}
                role="columnheader"
              >
                ROI{sortIndicator("roi")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-12">
                  Loading leaderboard...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-12">
                  No leaderboard data available. Genius rankings will appear
                  after signals are committed and audited on-chain.
                </td>
              </tr>
            ) : (
              sorted.map((entry, i) => (
                <tr
                  key={entry.address}
                  className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-4 text-slate-500 font-mono">{i + 1}</td>
                  <td className="py-4">
                    <span className="font-mono text-slate-900">
                      {truncateAddress(entry.address)}
                    </span>
                  </td>
                  <td className="py-4">
                    <QualityScore score={entry.qualityScore} size="sm" />
                  </td>
                  <td className="py-4 text-slate-900">{entry.totalSignals}</td>
                  <td className="py-4 text-slate-900">{entry.auditCount}</td>
                  <td className="py-4">
                    <span
                      className={
                        entry.roi >= 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {entry.roi >= 0 ? "+" : ""}
                      {entry.roi.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Explanation */}
      <div className="mt-8 card">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          How Quality Score Works
        </h2>
        <div className="text-sm text-slate-500 space-y-2">
          <p>
            Quality Score (QS) is the on-chain measure of a Genius&apos;s prediction
            accuracy, computed across each 10-signal audit cycle:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <span className="text-green-600">Favorable:</span> +Notional &times; (odds &minus; 1)
            </li>
            <li>
              <span className="text-red-600">Unfavorable:</span> &minus;Notional &times; SLA%
            </li>
            <li>
              <span className="text-slate-500">Void:</span> does not count
            </li>
          </ul>
          <p>
            After every 10 signals between a Genius-Idiot pair, a ZK audit
            verifies the Quality Score on-chain. If the score is negative, the
            Genius&apos;s collateral is slashed: the Idiot receives a USDC refund
            (up to fees paid) plus Djinn Credits for excess damages.
          </p>
        </div>
      </div>
    </div>
  );
}

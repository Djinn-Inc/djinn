"use client";

import { useState } from "react";
import QualityScore from "@/components/QualityScore";
import { truncateAddress, type GeniusLeaderboardEntry } from "@/lib/types";

type SortField = "qualityScore" | "totalSignals" | "auditCount" | "roi";

export default function Leaderboard() {
  const [sortBy, setSortBy] = useState<SortField>("qualityScore");
  const [sortDesc, setSortDesc] = useState(true);

  // Will be populated from subgraph once signals are live
  const data: GeniusLeaderboardEntry[] = [];

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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Leaderboard</h1>
        <p className="text-slate-500 mt-1">
          Geniuses ranked by cryptographically verified track records
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-medium w-12">#</th>
              <th className="pb-3 font-medium">Genius</th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("qualityScore")}
              >
                Quality Score{sortIndicator("qualityScore")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("totalSignals")}
              >
                Total Signals{sortIndicator("totalSignals")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("auditCount")}
              >
                Audits{sortIndicator("auditCount")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => handleSort("roi")}
              >
                ROI{sortIndicator("roi")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
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
            accuracy. It is updated after each signal outcome:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <span className="text-green-600">+1</span> for each Favorable
              outcome
            </li>
            <li>
              <span className="text-red-600">-1</span> for each Unfavorable
              outcome
            </li>
            <li>
              <span className="text-slate-500">0</span> for Void outcomes
            </li>
          </ul>
          <p>
            After every 10 signals between a Genius-Idiot pair, a ZK audit
            verifies the track record. Geniuses with negative QS have their
            collateral slashed and Idiots receive Djinn Credits as compensation.
          </p>
        </div>
      </div>
    </div>
  );
}

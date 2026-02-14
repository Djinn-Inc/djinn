"use client";

import { useState } from "react";
import QualityScore from "@/components/QualityScore";
import { truncateAddress, type GeniusLeaderboardEntry } from "@/lib/types";

// Placeholder data for UI development
const MOCK_LEADERBOARD: GeniusLeaderboardEntry[] = [
  {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    qualityScore: 12,
    totalSignals: 47,
    auditCount: 4,
    roi: 8.3,
  },
  {
    address: "0xabcdef1234567890abcdef1234567890abcdef12",
    qualityScore: 8,
    totalSignals: 32,
    auditCount: 3,
    roi: 5.1,
  },
  {
    address: "0x9876543210fedcba9876543210fedcba98765432",
    qualityScore: 5,
    totalSignals: 21,
    auditCount: 2,
    roi: 3.7,
  },
  {
    address: "0xfedcba9876543210fedcba9876543210fedcba98",
    qualityScore: 2,
    totalSignals: 15,
    auditCount: 1,
    roi: 1.2,
  },
  {
    address: "0x1111222233334444555566667777888899990000",
    qualityScore: -1,
    totalSignals: 10,
    auditCount: 1,
    roi: -0.8,
  },
  {
    address: "0xaaaa bbbbccccddddeeeeffffaaaa bbbbccccdddd",
    qualityScore: -4,
    totalSignals: 18,
    auditCount: 1,
    roi: -3.2,
  },
];

type SortField = "qualityScore" | "totalSignals" | "auditCount" | "roi";

export default function Leaderboard() {
  const [sortBy, setSortBy] = useState<SortField>("qualityScore");
  const [sortDesc, setSortDesc] = useState(true);
  const [showMock, setShowMock] = useState(true);

  const data = showMock ? MOCK_LEADERBOARD : [];

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
          <p className="text-gray-400 mt-1">
            Geniuses ranked by cryptographically verified track records
          </p>
        </div>
        <button
          onClick={() => setShowMock(!showMock)}
          className="btn-secondary text-xs"
        >
          {showMock ? "Hide" : "Show"} Mock Data
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-700">
              <th className="pb-3 font-medium w-12">#</th>
              <th className="pb-3 font-medium">Genius</th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort("qualityScore")}
              >
                Quality Score{sortIndicator("qualityScore")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort("totalSignals")}
              >
                Total Signals{sortIndicator("totalSignals")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort("auditCount")}
              >
                Audits{sortIndicator("auditCount")}
              </th>
              <th
                className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort("roi")}
              >
                ROI{sortIndicator("roi")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-12">
                  No leaderboard data available. Genius rankings will appear
                  after signals are committed and audited on-chain.
                </td>
              </tr>
            ) : (
              sorted.map((entry, i) => (
                <tr
                  key={entry.address}
                  className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="py-4 text-gray-500 font-mono">{i + 1}</td>
                  <td className="py-4">
                    <span className="font-mono text-white">
                      {truncateAddress(entry.address)}
                    </span>
                  </td>
                  <td className="py-4">
                    <QualityScore score={entry.qualityScore} size="sm" />
                  </td>
                  <td className="py-4 text-white">{entry.totalSignals}</td>
                  <td className="py-4 text-white">{entry.auditCount}</td>
                  <td className="py-4">
                    <span
                      className={
                        entry.roi >= 0 ? "text-green-400" : "text-red-400"
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
        <h2 className="text-lg font-semibold text-white mb-3">
          How Quality Score Works
        </h2>
        <div className="text-sm text-gray-400 space-y-2">
          <p>
            Quality Score (QS) is the on-chain measure of a Genius&apos;s prediction
            accuracy. It is updated after each signal outcome:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <span className="text-green-400">+1</span> for each Favorable
              outcome
            </li>
            <li>
              <span className="text-red-400">-1</span> for each Unfavorable
              outcome
            </li>
            <li>
              <span className="text-gray-500">0</span> for Void outcomes
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

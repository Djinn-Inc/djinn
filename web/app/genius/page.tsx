"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import QualityScore from "@/components/QualityScore";
import { useCollateral } from "@/lib/hooks";
import { formatUsdc } from "@/lib/types";

export default function GeniusDashboard() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { deposit, locked, available, loading } = useCollateral(address);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-white mb-4">Genius Dashboard</h1>
        <p className="text-gray-400 mb-8">
          Connect your wallet to access the Genius dashboard.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Genius Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Manage your signals, collateral, and track record
          </p>
        </div>
        <Link href="/genius/signal/new" className="btn-primary">
          Create Signal
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Quality Score
          </p>
          <div className="mt-3">
            <QualityScore score={0} size="md" />
          </div>
        </div>

        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Total Collateral
          </p>
          <p className="text-2xl font-bold text-white mt-2">
            {loading ? "..." : `$${formatUsdc(deposit)}`}
          </p>
          <p className="text-xs text-gray-500 mt-1">USDC deposited</p>
        </div>

        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Locked Collateral
          </p>
          <p className="text-2xl font-bold text-orange-400 mt-2">
            {loading ? "..." : `$${formatUsdc(locked)}`}
          </p>
          <p className="text-xs text-gray-500 mt-1">Backing active signals</p>
        </div>

        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Available
          </p>
          <p className="text-2xl font-bold text-green-400 mt-2">
            {loading ? "..." : `$${formatUsdc(available)}`}
          </p>
          <p className="text-xs text-gray-500 mt-1">Free to withdraw</p>
        </div>
      </div>

      {/* Active Signals */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Active Signals
        </h2>
        <div className="card">
          <p className="text-center text-gray-500 py-8">
            No active signals. Create your first signal to start building your
            track record.
          </p>
        </div>
      </section>

      {/* Audit History */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Audit History
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="pb-3 font-medium">Cycle</th>
                <th className="pb-3 font-medium">Idiot</th>
                <th className="pb-3 font-medium">Signals</th>
                <th className="pb-3 font-medium">QS Delta</th>
                <th className="pb-3 font-medium">Outcome</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={6}
                  className="text-center text-gray-500 py-8"
                >
                  No audit history yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Collateral Management */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">
          Collateral Management
        </h2>
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Deposit USDC Collateral</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount (USDC)"
                  className="input flex-1"
                />
                <button className="btn-primary whitespace-nowrap">
                  Deposit
                </button>
              </div>
            </div>
            <div>
              <label className="label">Withdraw Available Collateral</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount (USDC)"
                  className="input flex-1"
                />
                <button className="btn-secondary whitespace-nowrap">
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

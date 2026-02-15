"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import QualityScore from "@/components/QualityScore";
import { useCollateral, useDepositCollateral, useWithdrawCollateral } from "@/lib/hooks";
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { formatUsdc, parseUsdc, formatBps, truncateAddress } from "@/lib/types";
import { SignalStatus } from "@/lib/types";

export default function GeniusDashboard() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { deposit, locked, available, loading, refresh: refreshCollateral } = useCollateral(address);
  const { deposit: depositCollateral, loading: depositLoading } = useDepositCollateral();
  const { withdraw: withdrawCollateral, loading: withdrawLoading } = useWithdrawCollateral();
  const { signals: mySignals, loading: signalsLoading } = useActiveSignals(undefined, address);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const handleDeposit = async () => {
    if (!depositAmount) return;
    setTxError(null);
    try {
      await depositCollateral(parseUsdc(depositAmount));
      setDepositAmount("");
      refreshCollateral();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Deposit failed");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setTxError(null);
    try {
      await withdrawCollateral(parseUsdc(withdrawAmount));
      setWithdrawAmount("");
      refreshCollateral();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Genius Dashboard</h1>
        <p className="text-slate-500 mb-8">
          Connect your wallet to access the Genius dashboard.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Genius Dashboard</h1>
          <p className="text-slate-500 mt-1">
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
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Quality Score
          </p>
          <div className="mt-3">
            <QualityScore score={0} size="md" />
          </div>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Total Collateral
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {loading ? "..." : `$${formatUsdc(deposit)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">USDC deposited</p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Locked Collateral
          </p>
          <p className="text-2xl font-bold text-genius-500 mt-2">
            {loading ? "..." : `$${formatUsdc(locked)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">Backing active signals</p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Available
          </p>
          <p className="text-2xl font-bold text-green-600 mt-2">
            {loading ? "..." : `$${formatUsdc(available)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">Free to withdraw</p>
        </div>
      </div>

      {/* Active Signals */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Active Signals
        </h2>
        {signalsLoading ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">Loading signals...</p>
          </div>
        ) : mySignals.length === 0 ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">
              No active signals. Create your first signal to start building your
              track record.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mySignals.map((s) => (
              <div key={s.signalId} className="card flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {s.sport} &middot; Signal #{truncateAddress(s.signalId)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Max Price: {formatBps(s.maxPriceBps)} &middot; Expires: {new Date(Number(s.expiresAt) * 1000).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-600 border border-green-200">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Audit History */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Audit History
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
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
                  className="text-center text-slate-500 py-8"
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
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Collateral Management
        </h2>
        <div className="card">
          {txError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-xs text-red-600">{txError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Deposit USDC Collateral</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount (USDC)"
                  className="input flex-1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
                <button
                  className="btn-primary whitespace-nowrap"
                  disabled={depositLoading || !depositAmount}
                  onClick={handleDeposit}
                >
                  {depositLoading ? "Depositing..." : "Deposit"}
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
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <button
                  className="btn-secondary whitespace-nowrap"
                  disabled={withdrawLoading || !withdrawAmount}
                  onClick={handleWithdraw}
                >
                  {withdrawLoading ? "Withdrawing..." : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

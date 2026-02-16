"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import QualityScore from "@/components/QualityScore";
import { useCollateral, useDepositCollateral, useWithdrawCollateral } from "@/lib/hooks";
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { useAuditHistory } from "@/lib/hooks/useAuditHistory";
import { useTrackRecordProofs } from "@/lib/hooks/useTrackRecordProofs";
import { formatUsdc, parseUsdc, formatBps, truncateAddress } from "@/lib/types";

export default function GeniusDashboard() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { deposit, locked, available, loading, refresh: refreshCollateral } = useCollateral(address);
  const { deposit: depositCollateral, loading: depositLoading } = useDepositCollateral();
  const { withdraw: withdrawCollateral, loading: withdrawLoading } = useWithdrawCollateral();
  const { signals: mySignals, loading: signalsLoading } = useActiveSignals(undefined, address);
  const { audits, loading: auditsLoading, aggregateQualityScore } = useAuditHistory(address);
  const { proofs, loading: proofsLoading, error: proofsError } = useTrackRecordProofs(address);

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
        <div className="flex gap-3">
          <Link href="/genius/track-record" className="btn-secondary">
            Track Record Proof
          </Link>
          <Link href="/genius/signal/new" className="btn-primary">
            Create Signal
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Quality Score
          </p>
          <div className="mt-3">
            <QualityScore score={Number(aggregateQualityScore)} size="md" />
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Active Signals
          </h2>
          {!signalsLoading && mySignals.length > 0 && (
            <span className="text-xs text-slate-500">
              {mySignals.length} / 20 (proof limit)
            </span>
          )}
        </div>
        {!signalsLoading && mySignals.length >= 18 && (
          <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${
            mySignals.length >= 20
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            {mySignals.length >= 20
              ? "You have reached the 20-signal proof limit. To generate a new track record proof, you will need to batch your signals into multiple proofs."
              : `Approaching the 20-signal proof limit (${mySignals.length}/20). Track record proofs cover up to 20 signals each.`}
          </div>
        )}
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
                <th className="pb-3 font-medium">QS Delta</th>
                <th className="pb-3 font-medium">Outcome</th>
                <th className="pb-3 font-medium">Earned</th>
                <th className="pb-3 font-medium">Fee</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {auditsLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              ) : audits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    No audit history yet
                  </td>
                </tr>
              ) : (
                audits.map((a, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-3">{a.cycle.toString()}</td>
                    <td className="py-3">{truncateAddress(a.idiot)}</td>
                    <td className="py-3">
                      <span className={Number(a.qualityScore) >= 0 ? "text-green-600" : "text-red-500"}>
                        {Number(a.qualityScore) >= 0 ? "+" : ""}{a.qualityScore.toString()}
                      </span>
                    </td>
                    <td className="py-3">
                      {a.isEarlyExit ? (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700">Early Exit</span>
                      ) : Number(a.qualityScore) >= 0 ? (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700">Favorable</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700">Unfavorable</span>
                      )}
                    </td>
                    <td className="py-3">
                      {a.trancheA > 0n ? (
                        <span className="text-green-600">${formatUsdc(a.trancheA)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      {a.protocolFee > 0n ? (
                        <span className="text-slate-500">${formatUsdc(a.protocolFee)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-500">Block {a.blockNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Track Record Proofs */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Verified Track Records
          </h2>
          <Link href="/genius/track-record" className="text-sm text-genius-500 hover:text-genius-600 transition-colors">
            Generate New Proof
          </Link>
        </div>
        {proofsLoading ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">Loading proofs...</p>
          </div>
        ) : proofsError ? (
          <div className="card">
            <p className="text-center text-red-500 py-8">{proofsError}</p>
          </div>
        ) : proofs.length === 0 ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">
              No verified track record proofs yet. Generate and submit a proof to build your on-chain reputation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {proofs.map((p) => (
              <div key={p.recordId.toString()} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Proof #{p.recordId.toString()} &middot; {p.signalCount.toString()} signals
                    </p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      <span className="text-green-600">{p.favCount.toString()} fav</span>
                      <span className="text-red-500">{p.unfavCount.toString()} unfav</span>
                      <span>{p.voidCount.toString()} void</span>
                      <span className="text-green-600">+${formatUsdc(p.totalGain)}</span>
                      <span className="text-red-500">-${formatUsdc(p.totalLoss)}</span>
                    </div>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-medium bg-genius-100 text-genius-600 border border-genius-200">
                    Verified
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collateral Management */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Collateral Management
        </h2>
        <div className="card">
          {txError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
              <p className="text-xs text-red-600">{txError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="depositCollateral" className="label">Deposit USDC Collateral</label>
              <div className="flex gap-2">
                <input
                  id="depositCollateral"
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
              <label htmlFor="withdrawCollateral" className="label">Withdraw Available Collateral</label>
              <div className="flex gap-2">
                <input
                  id="withdrawCollateral"
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

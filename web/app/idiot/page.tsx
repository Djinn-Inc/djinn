"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useEscrowBalance, useCreditBalance, useDepositEscrow, useWithdrawEscrow } from "@/lib/hooks";
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { usePurchaseHistory } from "@/lib/hooks/usePurchaseHistory";
import { useIdiotAuditHistory } from "@/lib/hooks/useAuditHistory";
import { formatUsdc, parseUsdc, formatBps, truncateAddress } from "@/lib/types";

export default function IdiotDashboard() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { balance: escrowBalance, loading: escrowLoading, refresh: refreshEscrow } =
    useEscrowBalance(address);
  const { balance: creditBalance, loading: creditLoading } =
    useCreditBalance(address);
  const { deposit: depositEscrow, loading: depositLoading } = useDepositEscrow();
  const { withdraw: withdrawEscrow, loading: withdrawLoading } = useWithdrawEscrow();

  const { purchases, loading: purchasesLoading } = usePurchaseHistory(address);
  const { audits, loading: auditsLoading } = useIdiotAuditHistory(address);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState("");
  const { signals, loading: signalsLoading } = useActiveSignals(sportFilter || undefined);

  const handleDeposit = async () => {
    if (!depositAmount) return;
    setTxError(null);
    try {
      await depositEscrow(parseUsdc(depositAmount));
      setDepositAmount("");
      refreshEscrow();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Deposit failed");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setTxError(null);
    try {
      await withdrawEscrow(parseUsdc(withdrawAmount));
      setWithdrawAmount("");
      refreshEscrow();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-idiot-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-idiot-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Buyer Dashboard</h1>
        <p className="text-slate-500 mb-6">
          Connect your wallet to browse signals, make purchases, and track settlements.
        </p>
        <p className="text-xs text-slate-400">
          Use the Connect button in the top right corner.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Buyer Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Browse signals, manage your balance, and track purchases
          </p>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            USDC Balance
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {escrowLoading ? "..." : `$${formatUsdc(escrowBalance)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">USDC available for purchases</p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Djinn Credits
          </p>
          <p className="text-2xl font-bold text-idiot-500 mt-2">
            {creditLoading ? "..." : formatUsdc(creditBalance)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Credits offset purchase fees
          </p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Signals Purchased
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {purchasesLoading ? "..." : purchases.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Total signals bought</p>
        </div>
      </div>

      {/* Escrow Management */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Balance Management
        </h2>
        <div className="card">
          {txError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
              <p className="text-xs text-red-600">{txError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="depositEscrow" className="label">Deposit USDC</label>
              <div className="flex gap-2">
                <input
                  id="depositEscrow"
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
              <p className="text-xs text-slate-500 mt-1">
                Deposits require USDC approval first
              </p>
            </div>
            <div>
              <label htmlFor="withdrawEscrow" className="label">Withdraw USDC</label>
              <div className="flex gap-2">
                <input
                  id="withdrawEscrow"
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
              <p className="text-xs text-slate-500 mt-1">
                Withdraw available balance
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Browse Signals */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Available Signals
          </h2>
          <div className="flex gap-2">
            <select
              className="input w-auto"
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              aria-label="Filter by sport"
            >
              <option value="">All Sports</option>
              <option value="NFL">NFL</option>
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
              <option value="NHL">NHL</option>
              <option value="Soccer">Soccer</option>
            </select>
          </div>
        </div>
        {signalsLoading ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">Loading signals...</p>
          </div>
        ) : signals.length === 0 ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">
              No signals available right now. Check back soon &mdash; new signals
              are committed as Geniuses publish their analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((s) => {
              const feePerHundred = ((100 * Number(s.maxPriceBps)) / 10_000).toFixed(2);
              const slaPercent = formatBps(s.slaMultiplierBps);
              const expires = new Date(Number(s.expiresAt) * 1000);
              const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3_600_000));
              return (
                <Link
                  key={s.signalId}
                  href={`/idiot/signal/${s.signalId}`}
                  className="card block hover:border-idiot-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {s.sport}
                        </span>
                        <span className="text-xs text-slate-400">
                          by {truncateAddress(s.genius)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          ${feePerHundred} per $100
                        </span>
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className="text-xs text-slate-500">
                          {slaPercent} SLA
                        </span>
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className={`text-xs ${hoursLeft < 2 ? "text-red-500" : "text-slate-500"}`}>
                          {hoursLeft}h left
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-idiot-500 font-medium shrink-0 ml-4">
                      View &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Purchase History */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Purchase History
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">ID</th>
                <th className="pb-3 font-medium">Signal</th>
                <th className="pb-3 font-medium">Notional</th>
                <th className="pb-3 font-medium">USDC Paid</th>
                <th className="pb-3 font-medium">Credits Used</th>
                <th className="pb-3 font-medium">Total Fee</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchasesLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    No purchases yet
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.purchaseId} className="border-b border-slate-100">
                    <td className="py-3">#{p.purchaseId}</td>
                    <td className="py-3">{truncateAddress(p.signalId)}</td>
                    <td className="py-3">${formatUsdc(BigInt(p.notional))}</td>
                    <td className="py-3">${formatUsdc(BigInt(p.usdcPaid))}</td>
                    <td className="py-3">
                      {BigInt(p.creditUsed) > 0n ? (
                        <span className="text-idiot-500">{formatUsdc(BigInt(p.creditUsed))}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3">${formatUsdc(BigInt(p.feePaid))}</td>
                    <td className="py-3 text-slate-500">Block {p.blockNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit History */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Settlement History
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">Cycle</th>
                <th className="pb-3 font-medium">Genius</th>
                <th className="pb-3 font-medium">Result</th>
                <th className="pb-3 font-medium">Payout</th>
                <th className="pb-3 font-medium">Credits</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {auditsLoading ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              ) : audits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    No settlements yet
                  </td>
                </tr>
              ) : (
                audits.map((a, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-3">{a.cycle.toString()}</td>
                    <td className="py-3">{truncateAddress(a.genius)}</td>
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
                      {a.trancheB > 0n ? (
                        <span className="text-idiot-500">{formatUsdc(a.trancheB)}</span>
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
    </div>
  );
}

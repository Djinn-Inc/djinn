"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEscrowBalance, useCreditBalance, useDepositEscrow, useWithdrawEscrow, useWalletUsdcBalance } from "@/lib/hooks";
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { usePurchaseHistory } from "@/lib/hooks/usePurchaseHistory";
import { useIdiotAuditHistory } from "@/lib/hooks/useAuditHistory";
import { useLeaderboard } from "@/lib/hooks/useLeaderboard";
import { formatUsdc, parseUsdc, formatBps, truncateAddress } from "@/lib/types";
import SignalPlot from "@/components/SignalPlot";

export default function IdiotDashboard() {
  const { isConnected, address } = useAccount();
  const { balance: escrowBalance, loading: escrowLoading, refresh: refreshEscrow } =
    useEscrowBalance(address);
  const { balance: walletUsdc, loading: walletUsdcLoading, refresh: refreshWalletUsdc } = useWalletUsdcBalance(address);
  const { balance: creditBalance, loading: creditLoading } =
    useCreditBalance(address);
  const { deposit: depositEscrow, loading: depositLoading } = useDepositEscrow();
  const { withdraw: withdrawEscrow, loading: withdrawLoading } = useWithdrawEscrow();

  const { purchases, loading: purchasesLoading } = usePurchaseHistory(address);
  const { audits, loading: auditsLoading } = useIdiotAuditHistory(address);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState("");
  const [viewMode, setViewMode] = useState<"plot" | "list">("list");
  const [notionalMin, setNotionalMin] = useState(0);
  const [notionalMax, setNotionalMax] = useState(10000);
  const [feeMax, setFeeMax] = useState(500);
  const [slaMin, setSlaMin] = useState(0);
  const [expiryFilter, setExpiryFilter] = useState("");
  const [geniusSearch, setGeniusSearch] = useState("");
  const [sortBy, setSortBy] = useState<"expiry" | "fee-asc" | "fee-desc" | "sla" | "score">("expiry");
  const [showFilters, setShowFilters] = useState(false);
  const { signals, loading: signalsLoading } = useActiveSignals(sportFilter || undefined);
  const { data: leaderboard } = useLeaderboard();
  const router = useRouter();

  const geniusScoreMap = useMemo(() => {
    const map = new Map<string, { qualityScore: number; totalSignals: number; roi: number; proofCount: number }>();
    for (const entry of leaderboard) {
      map.set(entry.address.toLowerCase(), {
        qualityScore: entry.qualityScore,
        totalSignals: entry.totalSignals,
        roi: entry.roi,
        proofCount: entry.proofCount,
      });
    }
    return map;
  }, [leaderboard]);

  const filteredSignals = useMemo(() => {
    const now = Date.now();
    const minBig = BigInt(notionalMin) * 1_000_000n;
    const maxBig = BigInt(notionalMax) * 1_000_000n;
    return signals.filter((s) => {
      if (s.maxNotional > 0n && s.maxNotional < minBig) return false;
      if (notionalMax < 10000 && s.maxNotional > maxBig) return false;
      if (Number(s.maxPriceBps) > feeMax) return false;
      if (slaMin > 0 && Number(s.slaMultiplierBps) < slaMin) return false;
      if (expiryFilter) {
        const hoursLeft = (Number(s.expiresAt) * 1000 - now) / 3_600_000;
        if (hoursLeft > parseInt(expiryFilter)) return false;
      }
      if (geniusSearch) {
        const q = geniusSearch.toLowerCase();
        if (!s.genius.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [signals, notionalMin, notionalMax, feeMax, slaMin, expiryFilter, geniusSearch]);

  const sortedSignals = useMemo(() => {
    const sorted = [...filteredSignals];
    switch (sortBy) {
      case "expiry":
        sorted.sort((a, b) => Number(a.expiresAt) - Number(b.expiresAt));
        break;
      case "fee-asc":
        sorted.sort((a, b) => Number(a.maxPriceBps) - Number(b.maxPriceBps));
        break;
      case "fee-desc":
        sorted.sort((a, b) => Number(b.maxPriceBps) - Number(a.maxPriceBps));
        break;
      case "sla":
        sorted.sort((a, b) => Number(b.slaMultiplierBps) - Number(a.slaMultiplierBps));
        break;
      case "score":
        sorted.sort((a, b) => {
          const sa = geniusScoreMap.get(a.genius.toLowerCase())?.qualityScore ?? 0;
          const sb = geniusScoreMap.get(b.genius.toLowerCase())?.qualityScore ?? 0;
          return sb - sa;
        });
        break;
    }
    return sorted;
  }, [filteredSignals, sortBy, geniusScoreMap]);

  const handleDeposit = async () => {
    if (!depositAmount) return;
    setTxError(null);
    setTxSuccess(null);
    try {
      await depositEscrow(parseUsdc(depositAmount));
      setTxSuccess(`Deposited ${depositAmount} USDC to escrow`);
      setDepositAmount("");
      refreshEscrow();
      refreshWalletUsdc();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Deposit failed");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setTxError(null);
    setTxSuccess(null);
    try {
      await withdrawEscrow(parseUsdc(withdrawAmount));
      setTxSuccess(`Withdrew ${withdrawAmount} USDC from escrow`);
      setWithdrawAmount("");
      refreshEscrow();
      refreshWalletUsdc();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-idiot-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-idiot-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Idiot Dashboard</h1>
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
          <h1 className="text-3xl font-bold text-slate-900">Idiot Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Browse signals, manage your balance, and track purchases
          </p>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Wallet USDC
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {walletUsdcLoading ? "..." : `$${formatUsdc(walletUsdc)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">Available to deposit</p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Escrow Balance
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {escrowLoading ? "..." : `$${formatUsdc(escrowBalance)}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">Ready for purchases</p>
        </div>

        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Djinn Credits
          </p>
          <p className="text-2xl font-bold text-idiot-500 mt-2">
            {creditLoading ? "..." : formatUsdc(creditBalance)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Offset purchase fees
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
          {txSuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4" role="status">
              <p className="text-xs text-green-700">{txSuccess}</p>
            </div>
          )}
          {txError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
              <p className="text-xs text-red-600">{txError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form onSubmit={(e) => { e.preventDefault(); handleDeposit(); }}>
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
                  type="submit"
                  className="btn-primary whitespace-nowrap"
                  disabled={depositLoading || !depositAmount}
                >
                  {depositLoading ? "Depositing..." : "Deposit"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Deposits require USDC approval first
              </p>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); handleWithdraw(); }}>
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
                  type="submit"
                  className="btn-secondary whitespace-nowrap"
                  disabled={withdrawLoading || !withdrawAmount}
                >
                  {withdrawLoading ? "Withdrawing..." : "Withdraw"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Withdraw available balance
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Browse Signals */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Available Signals
            {!signalsLoading && (
              <span className="text-sm font-normal text-slate-400 ml-2">
                {sortedSignals.length}{sortedSignals.length !== signals.length && ` of ${signals.length}`}
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
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
            <select
              className="input w-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort signals"
            >
              <option value="expiry">Expiring soon</option>
              <option value="fee-asc">Fee: low to high</option>
              <option value="fee-desc">Fee: high to low</option>
              <option value="sla">Highest SLA</option>
              <option value="score">Genius score</option>
            </select>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                showFilters
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Filters{(feeMax < 500 || slaMin > 0 || expiryFilter || geniusSearch || notionalMax < 10000) && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-idiot-500 text-white text-[10px]">
                  {[feeMax < 500, slaMin > 0, expiryFilter, geniusSearch, notionalMax < 10000].filter(Boolean).length}
                </span>
              )}
            </button>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="List view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plot")}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "plot"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="Dot plot view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                  <circle cx="16" cy="12" r="2" fill="currentColor" />
                  <circle cx="12" cy="16" r="2" fill="currentColor" />
                  <circle cx="18" cy="6" r="2" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="card mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="feeMaxFilter" className="text-xs text-slate-500 uppercase tracking-wide">
                  Max Fee
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    id="feeMaxFilter"
                    type="range"
                    min={0}
                    max={500}
                    step={10}
                    value={feeMax}
                    onChange={(e) => setFeeMax(Number(e.target.value))}
                    className="flex-1 accent-idiot-500"
                  />
                  <span className="text-xs text-slate-700 tabular-nums w-10 text-right">
                    {feeMax < 500 ? `${(feeMax / 100).toFixed(1)}%` : "Any"}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="slaMinFilter" className="text-xs text-slate-500 uppercase tracking-wide">
                  Min SLA (Skin in Game)
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    id="slaMinFilter"
                    type="range"
                    min={0}
                    max={30000}
                    step={1000}
                    value={slaMin}
                    onChange={(e) => setSlaMin(Number(e.target.value))}
                    className="flex-1 accent-idiot-500"
                  />
                  <span className="text-xs text-slate-700 tabular-nums w-12 text-right">
                    {slaMin > 0 ? `${(slaMin / 100).toFixed(0)}%` : "Any"}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="notionalFilter" className="text-xs text-slate-500 uppercase tracking-wide">
                  Max Notional
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    id="notionalFilter"
                    type="range"
                    min={0}
                    max={10000}
                    step={100}
                    value={notionalMax}
                    onChange={(e) => setNotionalMax(Number(e.target.value))}
                    className="flex-1 accent-idiot-500"
                  />
                  <span className="text-xs text-slate-700 tabular-nums w-12 text-right">
                    {notionalMax < 10000 ? `$${notionalMax.toLocaleString()}` : "Any"}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="expiryFilterSelect" className="text-xs text-slate-500 uppercase tracking-wide">
                  Expiring Within
                </label>
                <select
                  id="expiryFilterSelect"
                  className="input mt-1"
                  value={expiryFilter}
                  onChange={(e) => setExpiryFilter(e.target.value)}
                >
                  <option value="">Any time</option>
                  <option value="1">1 hour</option>
                  <option value="6">6 hours</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                </select>
              </div>
              <div>
                <label htmlFor="geniusSearchInput" className="text-xs text-slate-500 uppercase tracking-wide">
                  Genius Address
                </label>
                <input
                  id="geniusSearchInput"
                  type="text"
                  placeholder="0x..."
                  className="input mt-1"
                  value={geniusSearch}
                  onChange={(e) => setGeniusSearch(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setFeeMax(500);
                    setSlaMin(0);
                    setNotionalMax(10000);
                    setExpiryFilter("");
                    setGeniusSearch("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Reset filters
                </button>
              </div>
            </div>
          </div>
        )}

        {signalsLoading ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">Loading signals...</p>
          </div>
        ) : sortedSignals.length === 0 ? (
          <div className="card">
            <p className="text-center text-slate-500 py-8">
              {signals.length === 0
                ? "No signals available right now. Check back soon \u2014 new signals are committed as Geniuses publish their analysis."
                : "No signals match your filters. Try adjusting or resetting them."}
            </p>
          </div>
        ) : viewMode === "plot" ? (
          <div className="card">
            <SignalPlot
              signals={sortedSignals}
              onSelect={(id) => router.push(`/idiot/signal/${id}`)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {sortedSignals.map((s) => {
              const feePerHundred = ((100 * Number(s.maxPriceBps)) / 10_000).toFixed(2);
              const slaPercent = formatBps(s.slaMultiplierBps);
              const expires = new Date(Number(s.expiresAt) * 1000);
              const hoursLeft = Math.max(0, (expires.getTime() - Date.now()) / 3_600_000);
              const timeLabel = hoursLeft < 1
                ? `${Math.round(hoursLeft * 60)}m left`
                : hoursLeft < 24
                  ? `${Math.round(hoursLeft)}h left`
                  : `${Math.floor(hoursLeft / 24)}d left`;
              const geniusStats = geniusScoreMap.get(s.genius.toLowerCase());
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
                        {geniusStats && (
                          <>
                            <span className={`text-xs font-medium ${geniusStats.qualityScore >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {geniusStats.qualityScore >= 0 ? "+" : ""}{geniusStats.qualityScore.toFixed(2)} QS
                            </span>
                            {geniusStats.roi !== 0 && (
                              <span className={`text-xs ${geniusStats.roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {geniusStats.roi >= 0 ? "+" : ""}{geniusStats.roi.toFixed(1)}%
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          ${feePerHundred} per $100
                        </span>
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className="text-xs text-slate-500">
                          {slaPercent} SLA
                        </span>
                        {s.maxNotional > 0n && (
                          <>
                            <span className="text-xs text-slate-400">&middot;</span>
                            <span className="text-xs text-slate-500">
                              max ${formatUsdc(s.maxNotional)}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className={`text-xs ${hoursLeft < 2 ? "text-red-500" : "text-slate-500"}`}>
                          {timeLabel}
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
                <th className="pb-3 font-medium">Signal</th>
                <th className="pb-3 font-medium">Notional</th>
                <th className="pb-3 font-medium">Fee Paid</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchasesLoading ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 py-8">
                    No purchases yet. Browse available signals above to get started.
                  </td>
                </tr>
              ) : (
                [...purchases].reverse().map((p) => (
                  <tr key={p.purchaseId} className="border-b border-slate-100">
                    <td className="py-3">{truncateAddress(p.signalId)}</td>
                    <td className="py-3">${formatUsdc(BigInt(p.notional))}</td>
                    <td className="py-3">${formatUsdc(BigInt(p.feePaid))}</td>
                    <td className="py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-700">
                        Pending
                      </span>
                    </td>
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
                    No settlements yet. Settlements happen after every 10 signals
                    in a Genius-Idiot pair are resolved.
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

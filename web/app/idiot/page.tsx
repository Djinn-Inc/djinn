"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEscrowBalance, useCreditBalance } from "@/lib/hooks";
import { formatUsdc } from "@/lib/types";

export default function IdiotDashboard() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { balance: escrowBalance, loading: escrowLoading } =
    useEscrowBalance(address);
  const { balance: creditBalance, loading: creditLoading } =
    useCreditBalance(address);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Idiot Dashboard</h1>
        <p className="text-slate-500 mb-8">
          Connect your wallet to access the buyer dashboard.
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
            Total Purchased
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2">0</p>
          <p className="text-xs text-slate-500 mt-1">Signals bought</p>
        </div>
      </div>

      {/* Escrow Management */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Balance Management
        </h2>
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Deposit USDC</label>
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
              <p className="text-xs text-slate-500 mt-1">
                Deposits require USDC approval first
              </p>
            </div>
            <div>
              <label className="label">Withdraw USDC</label>
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
            <select className="input w-auto">
              <option value="">All Sports</option>
              <option value="NFL">NFL</option>
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
              <option value="NHL">NHL</option>
              <option value="Soccer">Soccer</option>
            </select>
          </div>
        </div>
        <div className="card">
          <p className="text-center text-slate-500 py-8">
            No signals available at the moment. Check back soon or watch for new
            SignalCommitted events on-chain.
          </p>
        </div>
      </section>

      {/* Purchase History */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Purchase History
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">ID</th>
                <th className="pb-3 font-medium">Signal</th>
                <th className="pb-3 font-medium">Genius</th>
                <th className="pb-3 font-medium">Notional</th>
                <th className="pb-3 font-medium">Fee Paid</th>
                <th className="pb-3 font-medium">Outcome</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  No purchases yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

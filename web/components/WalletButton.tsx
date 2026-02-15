"use client";

import { usePrivy } from "@privy-io/react-auth";
import { truncateAddress } from "@/lib/types";

export default function WalletButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return (
      <button
        disabled
        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (authenticated && user?.wallet?.address) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono text-slate-600">
          {truncateAddress(user.wallet.address)}
        </span>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
    >
      Connect Wallet
    </button>
  );
}

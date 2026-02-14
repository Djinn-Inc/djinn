"use client";

import { usePrivy } from "@privy-io/react-auth";
import { truncateAddress } from "@/lib/types";

export default function WalletButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return (
      <button
        disabled
        className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (authenticated && user?.wallet?.address) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-djinn-950 px-3 py-2 text-sm font-mono text-djinn-300">
          {truncateAddress(user.wallet.address)}
        </span>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="rounded-lg bg-djinn-600 px-4 py-2 text-sm font-medium text-white hover:bg-djinn-500 transition-colors"
    >
      Connect Wallet
    </button>
  );
}

"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { truncateAddress } from "@/lib/types";

export default function WalletButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!user?.wallet?.address) return;
    try {
      await navigator.clipboard.writeText(user.wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = user.wallet.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          title={copied ? "Copied!" : `Copy ${user.wallet.address}`}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          {truncateAddress(user.wallet.address)}
          {copied ? (
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          )}
        </button>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
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

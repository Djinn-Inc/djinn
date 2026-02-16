"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  getSignalCommitmentContract,
  getEscrowContract,
  getCollateralContract,
  getCreditLedgerContract,
  getUsdcContract,
  ADDRESSES,
} from "./contracts";
import type { Signal, CommitParams } from "./types";

// ---------------------------------------------------------------------------
// Error humanization — turn raw contract errors into readable messages
// ---------------------------------------------------------------------------

const REVERT_PATTERNS: [RegExp, string][] = [
  [/Insufficient collateral/i, "You don't have enough collateral deposited"],
  [/Insufficient balance/i, "Insufficient USDC balance"],
  [/Insufficient escrow/i, "Not enough funds in your escrow account"],
  [/Signal expired/i, "This signal has expired"],
  [/Signal does not exist/i, "Signal not found on-chain"],
  [/Already purchased/i, "You've already purchased this signal"],
  [/Already committed/i, "This signal was already committed"],
  [/Not genius/i, "Only the signal creator can perform this action"],
  [/Transfer amount exceeds allowance/i, "USDC approval needed — please approve the transfer first"],
  [/Transfer amount exceeds balance/i, "Insufficient USDC balance in your wallet"],
  [/user rejected/i, "Transaction cancelled by user"],
  [/user denied/i, "Transaction cancelled by user"],
  [/ACTION_REJECTED/i, "Transaction cancelled by user"],
  [/nonce.*already.*used/i, "Transaction nonce conflict — please wait and try again"],
  [/replacement.*underpriced/i, "Gas price too low — try increasing gas"],
  [/insufficient funds for gas/i, "Not enough ETH to cover gas fees"],
];

/** Convert a raw transaction error to a user-friendly message. */
export function humanizeError(err: unknown, fallback = "Transaction failed"): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;

  for (const [pattern, readable] of REVERT_PATTERNS) {
    if (pattern.test(msg)) return readable;
  }

  // Extract revert reason if present
  const revertMatch = msg.match(/reason="([^"]+)"/);
  if (revertMatch) return revertMatch[1];

  // Extract error string from reverted call
  const execMatch = msg.match(/execution reverted:\s*"?([^"]+)"?/);
  if (execMatch) return execMatch[1];

  // For generic contract errors, clean up the message
  if (msg.length > 200) return fallback;

  return msg;
}

// ---------------------------------------------------------------------------
// Provider hook — returns an ethers BrowserProvider from the user's wallet
// ---------------------------------------------------------------------------

export function useEthersProvider(): ethers.BrowserProvider | null {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  useEffect(() => {
    const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
    const ethereum = w?.ethereum as ethers.Eip1193Provider | undefined;
    if (ethereum) {
      setProvider(new ethers.BrowserProvider(ethereum));
    }
  }, []);

  return provider;
}

export function useEthersSigner(): ethers.Signer | null {
  const provider = useEthersProvider();
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (provider) {
      provider.getSigner().then((s) => {
        if (!cancelled) setSigner(s);
      }).catch((err: unknown) => {
        // Expected when wallet not connected; log unexpected errors
        if (err instanceof Error && !err.message.includes("unknown account")) {
          console.debug("getSigner failed:", err.message);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return signer;
}

// ---------------------------------------------------------------------------
// Escrow balance hook
// ---------------------------------------------------------------------------

export function useEscrowBalance(address: string | undefined) {
  const provider = useEthersProvider();
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !address) return;
    setLoading(true);
    setError(null);
    try {
      const contract = getEscrowContract(provider);
      const bal = await contract.getBalance(address);
      setBalance(BigInt(bal));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch escrow balance";
      setError(msg);
      console.warn("useEscrowBalance error:", msg);
    } finally {
      setLoading(false);
    }
  }, [provider, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Credit balance hook
// ---------------------------------------------------------------------------

export function useCreditBalance(address: string | undefined) {
  const provider = useEthersProvider();
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !address) return;
    setLoading(true);
    setError(null);
    try {
      const contract = getCreditLedgerContract(provider);
      const bal = await contract.balanceOf(address);
      setBalance(BigInt(bal));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch credit balance";
      setError(msg);
      console.warn("useCreditBalance error:", msg);
    } finally {
      setLoading(false);
    }
  }, [provider, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Collateral hooks
// ---------------------------------------------------------------------------

export function useCollateral(address: string | undefined) {
  const provider = useEthersProvider();
  const [deposit, setDeposit] = useState<bigint>(0n);
  const [locked, setLocked] = useState<bigint>(0n);
  const [available, setAvailable] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provider || !address) return;
    setLoading(true);
    setError(null);
    try {
      const contract = getCollateralContract(provider);
      const [d, l, a] = await Promise.all([
        contract.getDeposit(address),
        contract.getLocked(address),
        contract.getAvailable(address),
      ]);
      setDeposit(BigInt(d));
      setLocked(BigInt(l));
      setAvailable(BigInt(a));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch collateral";
      setError(msg);
      console.warn("useCollateral error:", msg);
    } finally {
      setLoading(false);
    }
  }, [provider, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { deposit, locked, available, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Signal query hook
// ---------------------------------------------------------------------------

export function useSignal(signalId: bigint | undefined) {
  const provider = useEthersProvider();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!provider || signalId === undefined) return;

    setLoading(true);
    setError(null);

    const contract = getSignalCommitmentContract(provider);
    const toBigInt = (v: unknown): bigint => {
      if (typeof v === "bigint") return v;
      if (typeof v === "number" || typeof v === "string") return BigInt(v);
      return 0n;
    };
    contract
      .getSignal(signalId)
      .then((raw: Record<string, unknown>) => {
        if (cancelled) return;
        setSignal({
          genius: String(raw.genius ?? ""),
          encryptedBlob: String(raw.encryptedBlob ?? ""),
          commitHash: String(raw.commitHash ?? ""),
          sport: String(raw.sport ?? ""),
          maxPriceBps: toBigInt(raw.maxPriceBps),
          slaMultiplierBps: toBigInt(raw.slaMultiplierBps),
          expiresAt: toBigInt(raw.expiresAt),
          decoyLines: Array.isArray(raw.decoyLines) ? raw.decoyLines.map(String) : [],
          availableSportsbooks: Array.isArray(raw.availableSportsbooks) ? raw.availableSportsbooks.map(String) : [],
          walletRecoveryBlob: String(raw.walletRecoveryBlob ?? ""),
          status: Number(raw.status ?? 0),
          createdAt: toBigInt(raw.createdAt),
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, signalId]);

  return { signal, loading, error };
}

// ---------------------------------------------------------------------------
// Transaction hooks
// ---------------------------------------------------------------------------

export function useCommitSignal() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(
    async (params: CommitParams) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const contract = getSignalCommitmentContract(signer);
        const tx = await contract.commit(params);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { commit, loading, error };
}

export function usePurchaseSignal() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchase = useCallback(
    async (signalId: bigint, notional: bigint, odds: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const contract = getEscrowContract(signer);
        const tx = await contract.purchase(signalId, notional, odds);
        const receipt = await tx.wait();
        return receipt;
      } catch (err) {
        setError(humanizeError(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { purchase, loading, error };
}

export function useDepositEscrow() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const usdc = getUsdcContract(signer);
        const approveTx = await usdc.approve(ADDRESSES.escrow, amount);
        await approveTx.wait();

        const escrow = getEscrowContract(signer);
        const tx = await escrow.deposit(amount);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err, "Deposit failed"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { deposit, loading, error };
}

export function useDepositCollateral() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const usdc = getUsdcContract(signer);
        const approveTx = await usdc.approve(ADDRESSES.collateral, amount);
        await approveTx.wait();

        const collateral = getCollateralContract(signer);
        const tx = await collateral.deposit(amount);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err, "Deposit failed"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { deposit, loading, error };
}

// ---------------------------------------------------------------------------
// Withdraw hooks
// ---------------------------------------------------------------------------

export function useWithdrawEscrow() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (amount: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const escrow = getEscrowContract(signer);
        const tx = await escrow.withdraw(amount);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err, "Withdraw failed"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { withdraw, loading, error };
}

export function useWithdrawCollateral() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (amount: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const collateral = getCollateralContract(signer);
        const tx = await collateral.withdraw(amount);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err, "Withdraw failed"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { withdraw, loading, error };
}

// ---------------------------------------------------------------------------
// USDC approval hook (reusable for any spender)
// ---------------------------------------------------------------------------

export function useApproveUsdc() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useCallback(
    async (spender: string, amount: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const usdc = getUsdcContract(signer);
        const tx = await usdc.approve(spender, amount);
        await tx.wait();
        return tx.hash as string;
      } catch (err) {
        setError(humanizeError(err, "Approval failed"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { approve, loading, error };
}

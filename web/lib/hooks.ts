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
      }).catch(() => {
        // Wallet not connected yet
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
    contract
      .getSignal(signalId)
      .then((raw: Record<string, unknown>) => {
        if (cancelled) return;
        setSignal({
          genius: raw.genius as string,
          encryptedBlob: raw.encryptedBlob as string,
          commitHash: raw.commitHash as string,
          sport: raw.sport as string,
          maxPriceBps: BigInt(raw.maxPriceBps as string),
          slaMultiplierBps: BigInt(raw.slaMultiplierBps as string),
          expiresAt: BigInt(raw.expiresAt as string),
          decoyLines: raw.decoyLines as string[],
          availableSportsbooks: raw.availableSportsbooks as string[],
          walletRecoveryBlob: raw.walletRecoveryBlob as string,
          status: Number(raw.status),
          createdAt: BigInt(raw.createdAt as string),
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
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Deposit failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Deposit failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Withdraw failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Withdraw failed";
        setError(msg);
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
        const msg = err instanceof Error ? err.message : "Approval failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signer]
  );

  return { approve, loading, error };
}

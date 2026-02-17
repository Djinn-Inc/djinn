"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { useWallets } from "@privy-io/react-auth";
import {
  getSignalCommitmentContract,
  getEscrowContract,
  getCollateralContract,
  getCreditLedgerContract,
  getTrackRecordContract,
  getUsdcContract,
  ADDRESSES,
} from "./contracts";
import type { Signal, CommitParams } from "./types";

// ---------------------------------------------------------------------------
// Error humanization — turn raw contract errors into readable messages
// ---------------------------------------------------------------------------

const REVERT_PATTERNS: [RegExp, string][] = [
  [/missing revert data/i, "Contract not deployed. The protocol contracts need to be deployed before you can transact."],
  [/could not detect network/i, "Cannot connect to the blockchain. Check your network connection."],
  [/CALL_EXCEPTION.*data=null/i, "Contract not deployed. The protocol contracts need to be deployed before you can transact."],
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
// Chain ID — expected chain for all transactions (Base Sepolia: 84532, Base: 8453)
// ---------------------------------------------------------------------------

const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");

// ---------------------------------------------------------------------------
// Read-only provider — uses public RPC for reliable reads (not Privy's RPC)
// ---------------------------------------------------------------------------

const READ_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://sepolia.base.org";
let _readProvider: ethers.JsonRpcProvider | null = null;

export function getReadProvider(): ethers.JsonRpcProvider {
  if (!_readProvider) {
    _readProvider = new ethers.JsonRpcProvider(READ_RPC_URL, EXPECTED_CHAIN_ID, { staticNetwork: true });
  }
  return _readProvider;
}

// ---------------------------------------------------------------------------
// Provider & signer hooks — uses Privy's wallet provider for signing
// ---------------------------------------------------------------------------

export function useEthersProvider(): ethers.BrowserProvider | null {
  const { wallets } = useWallets();
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  // Use the first connected Ethereum wallet from Privy
  const activeWallet = useMemo(
    () => wallets.find((w) => w.walletClientType !== "solana"),
    [wallets],
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeWallet) {
      setProvider(null);
      return;
    }
    activeWallet.getEthereumProvider().then((ethProvider) => {
      if (cancelled) return;
      setProvider(new ethers.BrowserProvider(ethProvider as ethers.Eip1193Provider));
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.debug("Failed to get Privy ethereum provider:", err);
        setProvider(null);
      }
    });
    return () => { cancelled = true; };
  }, [activeWallet]);

  return provider;
}

export function useEthersSigner(): ethers.Signer | null {
  const provider = useEthersProvider();
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (provider) {
      provider.getSigner().then(async (s) => {
        if (cancelled) return;
        // Verify the wallet is connected to the expected chain
        const network = await s.provider.getNetwork();
        if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
          console.warn(
            `[Djinn] Wrong network: connected to chain ${network.chainId}, expected ${EXPECTED_CHAIN_ID}. Transactions will be blocked.`
          );
          setSigner(null);
          return;
        }
        setSigner(s);
      }).catch((err: unknown) => {
        // Expected when wallet not connected; log unexpected errors
        if (err instanceof Error && !err.message.includes("unknown account")) {
          console.debug("getSigner failed:", err.message);
        }
      });
    } else {
      setSigner(null);
    }
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return signer;
}

/** Check if the wallet is on the expected chain. */
export function useChainId(): { chainId: number | null; isCorrectChain: boolean } {
  const provider = useEthersProvider();
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (provider) {
      provider.getNetwork().then((network) => {
        if (!cancelled) setChainId(Number(network.chainId));
      }).catch(() => {
        // Wallet not connected
      });
    }
    return () => { cancelled = true; };
  }, [provider]);

  return { chainId, isCorrectChain: chainId === EXPECTED_CHAIN_ID };
}

// ---------------------------------------------------------------------------
// Wallet USDC balance hook — raw USDC in the user's wallet (not deposited)
// ---------------------------------------------------------------------------

export function useWalletUsdcBalance(address: string | undefined) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0n);
      return;
    }
    setLoading(true);
    try {
      const usdc = getUsdcContract(getReadProvider());
      const bal = await usdc.balanceOf(address);
      if (!cancelledRef.current) setBalance(BigInt(bal));
    } catch {
      // Silently fail — wallet balance is informational
      if (!cancelledRef.current) setBalance(0n);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => { cancelledRef.current = true; };
  }, [refresh]);

  return { balance, loading, refresh };
}

// ---------------------------------------------------------------------------
// Escrow balance hook
// ---------------------------------------------------------------------------

export function useEscrowBalance(address: string | undefined) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0n);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contract = getEscrowContract(getReadProvider());
      const bal = await contract.getBalance(address);
      if (!cancelledRef.current) setBalance(BigInt(bal));
    } catch (err) {
      if (!cancelledRef.current) {
        const msg = err instanceof Error ? err.message : "Failed to fetch escrow balance";
        setError(msg);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => { cancelledRef.current = true; };
  }, [refresh]);

  return { balance, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Credit balance hook
// ---------------------------------------------------------------------------

export function useCreditBalance(address: string | undefined) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0n);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contract = getCreditLedgerContract(getReadProvider());
      const bal = await contract.balanceOf(address);
      if (!cancelledRef.current) setBalance(BigInt(bal));
    } catch (err) {
      if (!cancelledRef.current) {
        const msg = err instanceof Error ? err.message : "Failed to fetch credit balance";
        setError(msg);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => { cancelledRef.current = true; };
  }, [refresh]);

  return { balance, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Collateral hooks
// ---------------------------------------------------------------------------

export function useCollateral(address: string | undefined) {
  const [deposit, setDeposit] = useState<bigint>(0n);
  const [locked, setLocked] = useState<bigint>(0n);
  const [available, setAvailable] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setDeposit(0n);
      setLocked(0n);
      setAvailable(0n);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contract = getCollateralContract(getReadProvider());
      const [d, l, a] = await Promise.all([
        contract.getDeposit(address),
        contract.getLocked(address),
        contract.getAvailable(address),
      ]);
      if (!cancelledRef.current) {
        setDeposit(BigInt(d));
        setLocked(BigInt(l));
        setAvailable(BigInt(a));
      }
    } catch (err) {
      if (!cancelledRef.current) {
        const msg = err instanceof Error ? err.message : "Failed to fetch collateral";
        setError(msg);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => { cancelledRef.current = true; };
  }, [refresh]);

  return { deposit, locked, available, loading, refresh, error };
}

// ---------------------------------------------------------------------------
// Signal query hook
// ---------------------------------------------------------------------------

export function useSignal(signalId: bigint | undefined) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (signalId === undefined) {
      setSignal(null);
      return;
    }

    setLoading(true);
    setError(null);

    const contract = getSignalCommitmentContract(getReadProvider());
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
          maxNotional: toBigInt(raw.maxNotional),
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
  }, [signalId]);

  return { signal, loading, error };
}

// ---------------------------------------------------------------------------
// Gas estimation utility
// ---------------------------------------------------------------------------

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  totalCostWei: bigint;
  totalCostEth: string; // Human-readable ETH cost
}

/** Estimate gas for a contract method call. Returns null if estimation fails. */
export async function estimateGas(
  contract: ethers.Contract,
  method: string,
  args: unknown[],
): Promise<GasEstimate | null> {
  try {
    const provider = contract.runner as ethers.Signer;
    const gasLimit = await contract[method].estimateGas(...args);
    const feeData = await (provider as unknown as { provider: ethers.Provider }).provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    const totalCostWei = gasLimit * gasPrice;
    const totalCostEth = ethers.formatEther(totalCostWei);

    return {
      gasLimit,
      gasPrice,
      totalCostWei,
      totalCostEth,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transaction hooks
// ---------------------------------------------------------------------------

export function useCommitSignal() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const commit = useCallback(
    async (params: CommitParams) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setTxHash(null);
      try {
        const contract = getSignalCommitmentContract(signer);
        const gas = await estimateGas(contract, "commit", [params]);
        const tx = await contract.commit(params, gas ? { gasLimit: gas.gasLimit * 12n / 10n } : {});
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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

  return { commit, loading, error, txHash };
}

export function usePurchaseSignal() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const purchase = useCallback(
    async (signalId: bigint, notional: bigint, odds: bigint) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setTxHash(null);
      try {
        const contract = getEscrowContract(signer);
        const gas = await estimateGas(contract, "purchase", [signalId, notional, odds]);
        const tx = await contract.purchase(signalId, notional, odds, gas ? { gasLimit: gas.gasLimit * 12n / 10n } : {});
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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

  return { purchase, loading, error, txHash };
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
        // Use read provider for pre-checks (Privy RPC is unreliable for reads)
        const usdcRead = getUsdcContract(getReadProvider());
        const addr = await signer.getAddress();
        const balance = await usdcRead.balanceOf(addr);
        if (balance < amount) {
          throw new Error(`Insufficient USDC balance: have ${balance}, need ${amount}`);
        }

        // Approve and deposit (signer needed for write txs)
        const usdc = getUsdcContract(signer);
        const approveTx = await usdc.approve(ADDRESSES.escrow, amount);
        await approveTx.wait();

        const escrow = getEscrowContract(signer);
        const tx = await escrow.deposit(amount);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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
        // Approve and deposit (no allowance pre-check — avoids Privy RPC read failures)
        const usdc = getUsdcContract(signer);
        const approveTx = await usdc.approve(ADDRESSES.collateral, amount);
        await approveTx.wait();

        const collateral = getCollateralContract(signer);
        const tx = await collateral.deposit(amount);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
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

// ---------------------------------------------------------------------------
// Track record proof submission hook
// ---------------------------------------------------------------------------

export function useSubmitTrackRecord() {
  const signer = useEthersSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "committing" | "waiting" | "submitting">("idle");

  const submit = useCallback(
    async (
      pA: [bigint, bigint],
      pB: [[bigint, bigint], [bigint, bigint]],
      pC: [bigint, bigint],
      pubSignals: bigint[],
    ) => {
      if (!signer) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setTxHash(null);
      try {
        const contract = getTrackRecordContract(signer);

        // Step 1: Compute proof hash matching contract's keccak256(abi.encodePacked(_pA, _pB, _pC, _pubSignals))
        setStep("committing");
        const { ethers } = await import("ethers");
        const allValues = [...pA, ...pB[0], ...pB[1], ...pC, ...pubSignals];
        const types = allValues.map(() => "uint256");
        const proofHash = ethers.solidityPackedKeccak256(types, allValues);
        const commitTx = await contract.commitProof(proofHash);
        const commitReceipt = await commitTx.wait();
        if (commitReceipt && commitReceipt.status === 0) throw new Error("Commit transaction reverted on-chain");

        // Step 2: Wait for next block (commit-reveal requires submission in a later block)
        setStep("waiting");
        await new Promise<void>((resolve) => {
          const provider = signer.provider!;
          const handler = () => { provider.off("block", handler); resolve(); };
          provider.on("block", handler);
        });

        // Step 3: Submit the proof
        setStep("submitting");
        const gas = await estimateGas(contract, "submit", [pA, pB, pC, pubSignals]);
        const tx = await contract.submit(pA, pB, pC, pubSignals, gas ? { gasLimit: gas.gasLimit * 12n / 10n } : {});
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain");
        return receipt;
      } catch (err) {
        setError(humanizeError(err, "Track record submission failed"));
        throw err;
      } finally {
        setLoading(false);
        setStep("idle");
      }
    },
    [signer]
  );

  return { submit, loading, error, txHash, step };
}

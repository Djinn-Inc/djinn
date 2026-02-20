"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import {
  generateTrackRecordProof,
  proofToSolidityCalldata,
  type SignalData,
} from "@/lib/zkproof";
import type { TrackRecordProofResult } from "@/lib/zkproof";
import { useSubmitTrackRecord } from "@/lib/hooks";
import { formatUsdc } from "@/lib/types";
import SecretModal from "@/components/SecretModal";
import {
  useSettledSignals,
  getSavedSignals,
  saveSavedSignals,
  recoverSignalsFromChain,
  type ProofReadySignal,
} from "@/lib/hooks/useSettledSignals";
import { fetchGeniusSignals } from "@/lib/subgraph";

type ProofState = "idle" | "generating" | "complete" | "error";

const OUTCOME_MAP: Record<string, bigint> = {
  Favorable: 1n,
  Unfavorable: 2n,
  Void: 3n,
};

export default function TrackRecordPage() {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();
  const [state, setState] = useState<ProofState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<TrackRecordProofResult | null>(null);
  const [proofJson, setProofJson] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { submit: submitOnChain, loading: submitLoading } = useSubmitTrackRecord();
  const [sportFilter, setSportFilter] = useState("");

  // Fetch settled signals (merges localStorage + subgraph + on-chain data)
  const {
    signals: settledSignals,
    loading: signalsLoading,
    error: signalsError,
    refresh,
  } = useSettledSignals(address);

  // Filter to signals that have at least one settled purchase, optionally by sport
  const proofableSignals = useMemo(
    () => settledSignals.filter((s) => {
      if (s.purchases.length === 0) return false;
      if (sportFilter && s.sport !== sportFilter) return false;
      return true;
    }),
    [settledSignals, sportFilter],
  );

  // Auto-select all proofable signals (capped at circuit max of 20)
  const includedSignals = useMemo(
    () => proofableSignals.slice(0, 20),
    [proofableSignals],
  );

  // Unique sports for the filter dropdown
  const availableSports = useMemo(() => {
    const sports = new Set(settledSignals.filter((s) => s.purchases.length > 0).map((s) => s.sport));
    return Array.from(sports).sort();
  }, [settledSignals]);

  const savedCount = getSavedSignals(address).length;

  // Auto-recovery: if no local data, derive keys from wallet and decrypt on-chain blobs
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "checking" | "loading" | "recovered" | "none"
  >("idle");

  useEffect(() => {
    if (!address || !walletClient || signalsLoading || savedCount > 0 || recoveryState !== "idle") return;
    setRecoveryState("checking");

    // Check subgraph for this Genius's signals
    fetchGeniusSignals(address)
      .then(async (subSignals) => {
        if (subSignals.length === 0) {
          setRecoveryState("none");
          return;
        }
        // Signals exist on-chain but not locally — recover via wallet signature
        setRecoveryState("loading");
        const ids = subSignals.map((s) => s.id);
        const recovered = await recoverSignalsFromChain(
          address,
          (params) => walletClient.signTypedData(params),
          ids,
        );
        if (recovered.length > 0) {
          saveSavedSignals(address, recovered);
          setRecoveryState("recovered");
          refresh();
        } else {
          setRecoveryState("none");
        }
      })
      .catch(() => setRecoveryState("none"));
  }, [address, walletClient, signalsLoading, savedCount, recoveryState, refresh]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Track Record Proof
        </h1>
        <p className="text-slate-500">
          Connect your wallet to generate track record proofs.
        </p>
      </div>
    );
  }

  const handleGenerate = async () => {
    setErrorMsg(null);
    setState("generating");

    try {
      const signals: SignalData[] = [];

      for (const sig of includedSignals) {
        const purchase = sig.purchases[0];
        if (!purchase) continue;

        const outcomeNum = OUTCOME_MAP[purchase.outcome];
        if (!outcomeNum) continue;

        signals.push({
          preimage: BigInt(sig.preimage),
          index: BigInt(sig.realIndex),
          outcome: outcomeNum,
          notional: BigInt(purchase.notional),
          odds: BigInt(purchase.odds || "1910000"),
          slaBps: BigInt(purchase.slaBps || "10000"),
        });
      }

      if (signals.length === 0) {
        throw new Error("No settled signals available for proof generation");
      }

      await generateAndSetResult(signals);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Proof generation failed");
      setState("error");
    }
  };


  const generateAndSetResult = async (signals: SignalData[]) => {
    const proofResult = await generateTrackRecordProof(signals);
    setResult(proofResult);
    setProofJson(
      JSON.stringify(
        {
          proof: proofResult.proof,
          publicSignals: proofResult.publicSignals,
          stats: {
            favCount: proofResult.favCount.toString(),
            unfavCount: proofResult.unfavCount.toString(),
            voidCount: proofResult.voidCount.toString(),
            totalGain: proofResult.totalGain.toString(),
            totalLoss: proofResult.totalLoss.toString(),
          },
        },
        null,
        2,
      ),
    );
    setState("complete");
  };

  const handleSubmitOnChain = async () => {
    if (!result) return;
    setSubmitError(null);
    setSubmitState("submitting");
    try {
      const calldataStr = await proofToSolidityCalldata(result.proof, result.publicSignals);
      const calldata = JSON.parse(`[${calldataStr}]`);
      const [pA, pB, pC, pubSignals] = calldata;
      await submitOnChain(pA, pB, pC, pubSignals);
      setSubmitState("submitted");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "On-chain submission failed");
      setSubmitState("idle");
    }
  };

  const handleDownloadProof = () => {
    if (!proofJson) return;
    const blob = new Blob([proofJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "track-record-proof.json";
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => router.push("/genius")}
        className="text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        &larr; Back to Dashboard
      </button>

      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Track Record Proof
      </h1>
      <p className="text-slate-500 mb-8">
        Generate a zero-knowledge proof of your trading track record. The proof
        demonstrates your aggregate statistics (wins, losses, gains) without
        revealing individual signal details.
      </p>

      {state === "complete" && result ? (
        /* ─── Proof Result View ─── */
        <div className="space-y-6">
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="text-green-700 font-medium">
              Proof generated successfully
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Favorable</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{result.favCount.toString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Unfavorable</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{result.unfavCount.toString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Void</p>
              <p className="text-2xl font-bold text-slate-400 mt-1">{result.voidCount.toString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Gain</p>
              <p className="text-2xl font-bold text-green-600 mt-1">${formatUsdc(result.totalGain)}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Loss</p>
              <p className="text-2xl font-bold text-red-500 mt-1">${formatUsdc(result.totalLoss)}</p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-900">Proof Data</h3>
              <button onClick={handleDownloadProof} className="btn-primary text-xs py-1 px-3">
                Download JSON
              </button>
            </div>
            <pre className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 overflow-x-auto max-h-64">
              {proofJson}
            </pre>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-slate-900 mb-3">Submit On-Chain</h3>
            <p className="text-sm text-slate-500 mb-4">
              Submit this proof to the TrackRecord contract for permanent,
              verifiable storage on Base chain.
            </p>
            {submitState === "submitted" ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-sm text-green-700 font-medium">
                  Proof submitted on-chain successfully
                </p>
              </div>
            ) : (
              <>
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-3" role="alert">
                    <p className="text-xs text-red-600">{submitError}</p>
                  </div>
                )}
                <button
                  onClick={handleSubmitOnChain}
                  disabled={submitLoading}
                  className="btn-primary w-full py-2"
                >
                  {submitLoading ? "Submitting..." : "Submit Proof On-Chain"}
                </button>
              </>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => {
                setState("idle");
                setResult(null);
                setProofJson(null);
                setSubmitState("idle");
                setSubmitError(null);
              }}
              className="btn-secondary"
            >
              Generate Another
            </button>
            <button onClick={() => router.push("/genius")} className="btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        /* ─── Input View ─── */
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Your Signals
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              All settled signals are automatically included in your track record proof.
              Signal data is saved locally when you create signals and merged
              with on-chain purchase outcomes.
            </p>

            {signalsLoading && (
              <div className="text-center py-8">
                <div className="inline-block w-6 h-6 border-2 border-genius-500 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading signal data...</p>
              </div>
            )}

            {signalsError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
                <p className="text-xs text-red-600">{signalsError}</p>
              </div>
            )}

            {!signalsLoading && savedCount === 0 && (recoveryState === "checking" || recoveryState === "loading") && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-center">
                <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-sm text-blue-700">
                  {recoveryState === "checking"
                    ? "Checking for signals on-chain..."
                    : "Recovering signal data... Sign the message in your wallet."}
                </p>
              </div>
            )}

            {!signalsLoading && savedCount === 0 && recoveryState === "recovered" && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
                <p className="text-sm text-green-700">
                  Signal data recovered successfully.
                </p>
              </div>
            )}

            {!signalsLoading && savedCount === 0 && (recoveryState === "none" || recoveryState === "idle" || recoveryState === "checking") && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                <p className="text-sm text-amber-700 mb-2">
                  No saved signal data found.
                </p>
                <p className="text-xs text-amber-600">
                  Signal data is saved automatically when you create new signals.
                </p>
              </div>
            )}

            {!signalsLoading && proofableSignals.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-400">
                    {includedSignals.length} signal{includedSignals.length !== 1 ? "s" : ""} included
                    {proofableSignals.length > 20 && (
                      <span className="text-amber-500 ml-1">(max 20 per proof, {proofableSignals.length - 20} excluded)</span>
                    )}
                  </p>
                  {availableSports.length > 1 && (
                    <select
                      className="input w-auto text-xs py-1"
                      value={sportFilter}
                      onChange={(e) => setSportFilter(e.target.value)}
                      aria-label="Filter by sport"
                    >
                      <option value="">All Sports</option>
                      {availableSports.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                  {includedSignals.map((sig) => (
                    <SignalRow
                      key={sig.signalId}
                      signal={sig}
                    />
                  ))}
                </div>
              </>
            )}

            {!signalsLoading && savedCount > 0 && proofableSignals.length === 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                <p className="text-sm text-slate-600">
                  You have {savedCount} signal{savedCount !== 1 ? "s" : ""} but none have resolved outcomes yet.
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
                <p className="text-xs text-red-600">{errorMsg}</p>
              </div>
            )}

            <SecretModal
              open={state === "generating"}
              title="Generating Zero-Knowledge Proof"
              message="Your signal preimages and outcomes are being used to generate a Groth16 proof. Only aggregate statistics are revealed — individual picks stay secret."
            >
              <p className="text-xs text-slate-400">This may take 10–30 seconds</p>
            </SecretModal>

            <button
              onClick={handleGenerate}
              disabled={state === "generating" || includedSignals.length === 0}
              className="btn-primary w-full py-3"
            >
              {state === "generating"
                ? "Generating Proof..."
                : `Generate Proof (${includedSignals.length} signal${includedSignals.length !== 1 ? "s" : ""})`}
            </button>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-slate-900 mb-3">
              How It Works
            </h3>
            <ol className="text-sm text-slate-500 space-y-2 list-decimal list-inside">
              <li>
                Your signal preimages and outcomes are used as private inputs to
                a ZK circuit.
              </li>
              <li>
                The circuit computes aggregate statistics (gain, loss, counts)
                and verifies each signal&apos;s commit hash.
              </li>
              <li>
                A Groth16 proof is generated in your browser. No private data
                leaves your device.
              </li>
              <li>
                The proof can be shared publicly or submitted on-chain for
                verifiable track record claims.
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal selection row
// ---------------------------------------------------------------------------

function SignalRow({
  signal,
}: {
  signal: ProofReadySignal;
}) {
  const purchase = signal.purchases[0];
  const outcomeColor =
    purchase?.outcome === "Favorable"
      ? "text-green-600"
      : purchase?.outcome === "Unfavorable"
        ? "text-red-500"
        : "text-slate-400";

  const date = new Date(signal.createdAt * 1000);

  return (
    <div className="flex items-center gap-3 rounded-lg px-4 py-3 bg-genius-50 border border-genius-200">
      <div className="w-2 h-2 rounded-full bg-genius-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate">
            {signal.pick || `Signal ${signal.signalId.slice(0, 8)}...`}
          </span>
          <span className="text-[10px] bg-slate-200 text-slate-500 rounded px-1.5 py-0.5">
            {signal.sport}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
          <span>
            {date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {purchase && (
            <>
              <span className={`font-medium ${outcomeColor}`}>
                {purchase.outcome}
              </span>
              <span>${formatUsdc(BigInt(purchase.notional))} notional</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  generateTrackRecordProof,
  proofToSolidityCalldata,
  type SignalData,
} from "@/lib/zkproof";
import type { TrackRecordProofResult } from "@/lib/zkproof";
import { useSubmitTrackRecord } from "@/lib/hooks";
import { formatUsdc } from "@/lib/types";
import {
  useSettledSignals,
  getSavedSignals,
  type ProofReadySignal,
} from "@/lib/hooks/useSettledSignals";

type ProofState = "idle" | "generating" | "complete" | "error";
type InputMode = "auto" | "manual";

const OUTCOME_MAP: Record<string, bigint> = {
  Favorable: 1n,
  Unfavorable: 2n,
  Void: 3n,
};

const EXAMPLE_SIGNAL = JSON.stringify(
  [
    {
      preimage: "12345678901234567890",
      index: "1",
      outcome: "1",
      notional: "1000000",
      odds: "1910000",
      slaBps: "15000",
    },
  ],
  null,
  2,
);

export default function TrackRecordPage() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [signalJson, setSignalJson] = useState("");
  const [state, setState] = useState<ProofState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<TrackRecordProofResult | null>(null);
  const [proofJson, setProofJson] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { submit: submitOnChain, loading: submitLoading } = useSubmitTrackRecord();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch settled signals (merges localStorage + subgraph + on-chain data)
  const {
    signals: settledSignals,
    loading: signalsLoading,
    error: signalsError,
  } = useSettledSignals(address);

  // Filter to signals that have at least one settled purchase
  const proofableSignals = useMemo(
    () => settledSignals.filter((s) => s.purchases.length > 0),
    [settledSignals],
  );

  const savedCount = getSavedSignals().length;

  // Auto-select all proofable signals on first load (up to 20)
  useEffect(() => {
    if (proofableSignals.length > 0 && selectedIds.size === 0) {
      const ids = proofableSignals.slice(0, 20).map((s) => s.signalId);
      setSelectedIds(new Set(ids));
    }
  }, [proofableSignals]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSignal = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 20) next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = proofableSignals.slice(0, 20).map((s) => s.signalId);
    setSelectedIds(new Set(ids));
  };

  if (!authenticated) {
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

  const handleGenerateFromSelected = async () => {
    setErrorMsg(null);
    setState("generating");

    try {
      const signals: SignalData[] = [];

      for (const sig of proofableSignals) {
        if (!selectedIds.has(sig.signalId)) continue;

        // Use the first settled purchase for each signal
        const purchase = sig.purchases[0];
        if (!purchase) continue;

        const outcomeNum = OUTCOME_MAP[purchase.outcome];
        if (!outcomeNum) continue;

        signals.push({
          preimage: BigInt(sig.preimage),
          index: BigInt(sig.realIndex),
          outcome: outcomeNum,
          notional: BigInt(purchase.notional),
          odds: BigInt(purchase.odds || "1910000"), // fallback to common odds
          slaBps: BigInt(purchase.slaBps || "10000"),
        });
      }

      if (signals.length === 0) {
        throw new Error("No valid signals selected for proof generation");
      }

      await generateAndSetResult(signals);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Proof generation failed");
      setState("error");
    }
  };

  const handleGenerateFromJson = async () => {
    setErrorMsg(null);
    setState("generating");

    try {
      const parsed = JSON.parse(signalJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Input must be a JSON array of signal objects");
      }

      const signals: SignalData[] = parsed.map(
        (s: Record<string, string>, i: number) => {
          if (!s.preimage || !s.index || !s.outcome || !s.notional || !s.odds) {
            throw new Error(
              `Signal at index ${i} missing required fields (preimage, index, outcome, notional, odds)`,
            );
          }
          return {
            preimage: BigInt(s.preimage),
            index: BigInt(s.index),
            outcome: BigInt(s.outcome),
            notional: BigInt(s.notional),
            odds: BigInt(s.odds),
            slaBps: BigInt(s.slaBps || "0"),
          };
        },
      );

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        setSignalJson(text);
      }
    };
    reader.readAsText(file);
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
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputMode("auto")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                inputMode === "auto"
                  ? "bg-genius-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              My Signals ({savedCount})
            </button>
            <button
              type="button"
              onClick={() => setInputMode("manual")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                inputMode === "manual"
                  ? "bg-genius-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Manual Input
            </button>
          </div>

          {inputMode === "auto" ? (
            /* ─── Auto-populated signals ─── */
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                Your Signals
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Select settled signals to include in your track record proof.
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

              {!signalsLoading && savedCount === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                  <p className="text-sm text-amber-700 mb-2">
                    No saved signal data found.
                  </p>
                  <p className="text-xs text-amber-600">
                    Signal data is saved automatically when you create new signals.
                    For signals created before this feature, use the Manual Input tab.
                  </p>
                </div>
              )}

              {!signalsLoading && proofableSignals.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-400">
                      {proofableSignals.length} signal{proofableSignals.length !== 1 ? "s" : ""} with settled purchases
                    </p>
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs text-genius-600 hover:text-genius-800"
                    >
                      Select all (max 20)
                    </button>
                  </div>

                  <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                    {proofableSignals.map((sig) => (
                      <SignalRow
                        key={sig.signalId}
                        signal={sig}
                        selected={selectedIds.has(sig.signalId)}
                        onToggle={() => toggleSignal(sig.signalId)}
                      />
                    ))}
                  </div>
                </>
              )}

              {!signalsLoading && savedCount > 0 && proofableSignals.length === 0 && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-sm text-slate-600">
                    You have {savedCount} saved signal{savedCount !== 1 ? "s" : ""}, but none have settled purchases yet.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Purchases need to be settled through the audit cycle before they can be included in a proof.
                  </p>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
                  <p className="text-xs text-red-600">{errorMsg}</p>
                </div>
              )}

              {state === "generating" && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4" aria-live="polite">
                  <p className="text-xs text-blue-600">
                    Generating Groth16 proof... This may take a few seconds.
                  </p>
                </div>
              )}

              <button
                onClick={handleGenerateFromSelected}
                disabled={state === "generating" || selectedIds.size === 0}
                className="btn-primary w-full py-3"
              >
                {state === "generating"
                  ? "Generating Proof..."
                  : `Generate Proof (${selectedIds.size} signal${selectedIds.size !== 1 ? "s" : ""})`}
              </button>
            </div>
          ) : (
            /* ─── Manual JSON input ─── */
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Manual Signal Data
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Paste your signal data as a JSON array, or upload a JSON file.
                Each signal needs: preimage, index, outcome (1=Favorable,
                2=Unfavorable, 3=Void), notional, odds, and slaBps. Up to 20
                signals per proof.
              </p>

              <div className="mb-4">
                <label htmlFor="signalFile" className="label">Upload JSON File</label>
                <input
                  id="signalFile"
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="input"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="signalJson" className="label">Or Paste JSON</label>
                <textarea
                  id="signalJson"
                  value={signalJson}
                  onChange={(e) => setSignalJson(e.target.value)}
                  placeholder={EXAMPLE_SIGNAL}
                  rows={12}
                  className="input font-mono text-xs"
                />
              </div>

              {errorMsg && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4" role="alert">
                  <p className="text-xs text-red-600">{errorMsg}</p>
                </div>
              )}

              {state === "generating" && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4" aria-live="polite">
                  <p className="text-xs text-blue-600">
                    Generating Groth16 proof... This may take a few seconds.
                  </p>
                </div>
              )}

              <button
                onClick={handleGenerateFromJson}
                disabled={state === "generating" || !signalJson.trim()}
                className="btn-primary w-full py-3"
              >
                {state === "generating"
                  ? "Generating Proof..."
                  : "Generate Track Record Proof"}
              </button>
            </div>
          )}

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
  selected,
  onToggle,
}: {
  signal: ProofReadySignal;
  selected: boolean;
  onToggle: () => void;
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
    <label
      className={`flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors ${
        selected
          ? "bg-genius-50 border-2 border-genius-300"
          : "bg-slate-50 border border-slate-200 hover:border-slate-300"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-4 h-4 rounded text-genius-500 border-slate-300"
      />
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
    </label>
  );
}

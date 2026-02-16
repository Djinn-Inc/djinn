"use client";

import { useState } from "react";
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

type ProofState = "idle" | "generating" | "complete" | "error";

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
  const { authenticated } = usePrivy();
  const router = useRouter();
  const [signalJson, setSignalJson] = useState("");
  const [state, setState] = useState<ProofState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<TrackRecordProofResult | null>(null);
  const [proofJson, setProofJson] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { submit: submitOnChain, loading: submitLoading } = useSubmitTrackRecord();

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

  const handleGenerate = async () => {
    setErrorMsg(null);
    setState("generating");

    try {
      const parsed = JSON.parse(signalJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Input must be a JSON array of signal objects");
      }

      const signals: SignalData[] = parsed.map(
        (
          s: Record<string, string>,
          i: number,
        ) => {
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Proof generation failed");
      setState("error");
    }
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
        <div className="space-y-6">
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="text-green-700 font-medium">
              Proof generated successfully
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Favorable
              </p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {result.favCount.toString()}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Unfavorable
              </p>
              <p className="text-2xl font-bold text-red-500 mt-1">
                {result.unfavCount.toString()}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Void
              </p>
              <p className="text-2xl font-bold text-slate-400 mt-1">
                {result.voidCount.toString()}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Total Gain
              </p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                ${formatUsdc(result.totalGain)}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Total Loss
              </p>
              <p className="text-2xl font-bold text-red-500 mt-1">
                ${formatUsdc(result.totalLoss)}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-900">
                Proof Data
              </h3>
              <button
                onClick={handleDownloadProof}
                className="btn-primary text-xs py-1 px-3"
              >
                Download JSON
              </button>
            </div>
            <pre className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 overflow-x-auto max-h-64">
              {proofJson}
            </pre>
          </div>

          {/* On-chain submission */}
          <div className="card">
            <h3 className="text-sm font-medium text-slate-900 mb-3">
              Submit On-Chain
            </h3>
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
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-3">
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
            <button
              onClick={() => router.push("/genius")}
              className="btn-primary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Signal Data
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Paste your signal data as a JSON array, or upload a JSON file.
              Each signal needs: preimage, index, outcome (1=Favorable,
              2=Unfavorable, 3=Void), notional, odds, and slaBps. Up to 20
              signals per proof.
            </p>

            <div className="mb-4">
              <label className="label">Upload JSON File</label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="input"
              />
            </div>

            <div className="mb-4">
              <label className="label">Or Paste JSON</label>
              <textarea
                value={signalJson}
                onChange={(e) => setSignalJson(e.target.value)}
                placeholder={EXAMPLE_SIGNAL}
                rows={12}
                className="input font-mono text-xs"
              />
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-xs text-red-600">{errorMsg}</p>
              </div>
            )}

            {state === "generating" && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4">
                <p className="text-xs text-blue-600">
                  Generating Groth16 proof... This may take a few seconds.
                </p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={state === "generating" || !signalJson.trim()}
              className="btn-primary w-full py-3"
            >
              {state === "generating"
                ? "Generating Proof..."
                : "Generate Track Record Proof"}
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

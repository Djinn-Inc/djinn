"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useSignal, usePurchaseSignal } from "@/lib/hooks";
import { getValidatorClient, getMinerClient } from "@/lib/api";
import { decrypt, fromHex, bigIntToKey } from "@/lib/crypto";
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { useAuditHistory } from "@/lib/hooks/useAuditHistory";
import QualityScore from "@/components/QualityScore";
import {
  SignalStatus,
  signalStatusLabel,
  formatBps,
  truncateAddress,
} from "@/lib/types";
import type { CandidateLine } from "@/lib/api";
import { decoyLineToCandidateLine, parseLine, formatLine } from "@/lib/odds";

type PurchaseStep =
  | "idle"
  | "checking_lines"
  | "purchasing_validator"
  | "purchasing_chain"
  | "decrypting"
  | "complete"
  | "error";

export default function PurchaseSignal() {
  const params = useParams();
  const router = useRouter();
  const { authenticated, user } = usePrivy();
  let signalId: bigint | undefined;
  try {
    signalId = params.id ? BigInt(params.id as string) : undefined;
  } catch {
    // Invalid signal ID in URL — will show "not found" via useSignal
  }
  const { signal, loading: signalLoading, error: signalError } =
    useSignal(signalId);
  const { purchase, loading: purchaseLoading, error: purchaseError } =
    usePurchaseSignal();

  // Fetch genius stats for sidebar
  const geniusAddress = signal?.genius;
  const { signals: geniusSignals } = useActiveSignals(
    undefined,
    geniusAddress,
  );
  const { audits: geniusAudits, aggregateQualityScore } =
    useAuditHistory(geniusAddress);

  const [notional, setNotional] = useState("");
  const [odds, setOdds] = useState("");
  const [selectedSportsbook, setSelectedSportsbook] = useState("");
  const [step, setStep] = useState<PurchaseStep>("idle");
  const [stepError, setStepError] = useState<string | null>(null);
  const [decryptedPick, setDecryptedPick] = useState<{
    realIndex: number;
    pick: string;
  } | null>(null);
  const [availableIndices, setAvailableIndices] = useState<number[]>([]);
  const purchaseInFlight = useRef(false);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Purchase Signal
        </h1>
        <p className="text-slate-500">
          Connect your wallet to purchase this signal.
        </p>
      </div>
    );
  }

  if (signalLoading) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Loading signal data...</p>
      </div>
    );
  }

  if (signalError) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Signal Not Found
        </h1>
        <p className="text-slate-500 mb-8">{signalError}</p>
        <button onClick={() => router.push("/idiot")} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Signal not found</p>
      </div>
    );
  }

  const expiresDate = new Date(Number(signal.expiresAt) * 1000);
  const isExpired = expiresDate < new Date();
  const isActive = signal.status === SignalStatus.Active && !isExpired;

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signalId || !selectedSportsbook) return;
    if (purchaseInFlight.current) return;
    purchaseInFlight.current = true;

    const buyerAddress = user?.wallet?.address;
    if (!buyerAddress) {
      setStepError("Wallet address not available");
      setStep("error");
      purchaseInFlight.current = false;
      return;
    }

    setStepError(null);

    try {
      // Step 1: Check line availability with miner
      setStep("checking_lines");

      const miner = getMinerClient();
      const candidateLines: CandidateLine[] = signal.decoyLines.map(
        (raw, i) =>
          decoyLineToCandidateLine(
            raw,
            i + 1,
            signal.sport,
            params.id as string,
          ),
      );

      const checkResult = await miner.checkLines({ lines: candidateLines });
      setAvailableIndices(checkResult.available_indices);

      if (checkResult.available_indices.length === 0) {
        setStepError(
          "No lines are currently available at this sportsbook. Try another sportsbook or check back later.",
        );
        setStep("error");
        return;
      }

      // Step 2: Request purchase from validator (MPC check)
      setStep("purchasing_validator");

      const validator = getValidatorClient();
      const purchaseResult = await validator.purchaseSignal(
        signalId.toString(),
        {
          buyer_address: buyerAddress,
          sportsbook: selectedSportsbook,
          available_indices: checkResult.available_indices,
        },
      );

      if (!purchaseResult.available || !purchaseResult.encrypted_key_share) {
        setStepError(
          purchaseResult.message ||
            "Signal not available at this sportsbook (MPC check failed)",
        );
        setStep("error");
        return;
      }

      // Step 3: Execute on-chain purchase
      setStep("purchasing_chain");

      const notionalNum = parseFloat(notional);
      const oddsNum = parseFloat(odds);
      if (isNaN(notionalNum) || !Number.isFinite(notionalNum) || notionalNum <= 0) {
        setStepError("Invalid notional amount");
        setStep("error");
        return;
      }
      if (isNaN(oddsNum) || !Number.isFinite(oddsNum) || oddsNum < 1.01 || oddsNum > 10000) {
        setStepError("Invalid odds (must be between 1.01 and 10,000)");
        setStep("error");
        return;
      }

      const notionalBig = BigInt(Math.floor(notionalNum * 1_000_000));
      // Contract uses 6-decimal precision (ODDS_PRECISION = 1e6)
      const oddsBig = BigInt(Math.floor(oddsNum * 1_000_000));

      await purchase(signalId, notionalBig, oddsBig);

      // Step 4: Decrypt the signal
      setStep("decrypting");

      if (purchaseResult.encrypted_key_share) {
        try {
          // In local single-validator mode, the validator returns the full key
          // In production, we'd collect k shares and reconstruct via Shamir
          const keyBytes = fromHex(purchaseResult.encrypted_key_share);

          // The encrypted blob is stored on-chain as hex-encoded bytes
          // Parse it: format is "iv:ciphertext"
          const blobBytes = signal.encryptedBlob.startsWith("0x")
            ? signal.encryptedBlob.slice(2)
            : signal.encryptedBlob;
          const blobStr = new TextDecoder().decode(fromHex(blobBytes));
          const colonIdx = blobStr.indexOf(":");

          if (colonIdx === -1) {
            throw new Error("Invalid encrypted blob format (missing iv:ciphertext separator)");
          }

          const iv = blobStr.slice(0, colonIdx);
          const ciphertext = blobStr.slice(colonIdx + 1);

          if (!iv || !ciphertext) {
            throw new Error("Invalid encrypted blob format (empty iv or ciphertext)");
          }

          const plaintext = await decrypt(ciphertext, iv, keyBytes);
          let parsed: { realIndex: number; pick: string };
          try {
            parsed = JSON.parse(plaintext);
          } catch {
            throw new Error("Decrypted data is not valid JSON — key may be incorrect");
          }
          if (typeof parsed.realIndex !== "number" || typeof parsed.pick !== "string") {
            throw new Error("Decrypted data missing required fields (realIndex, pick)");
          }
          if (parsed.realIndex < 1 || parsed.realIndex > signal.decoyLines.length) {
            throw new Error(`Invalid realIndex ${parsed.realIndex} (expected 1-${signal.decoyLines.length})`);
          }
          setDecryptedPick(parsed);
        } catch (decryptErr) {
          setStepError(
            `Signal purchased but decryption failed: ${decryptErr instanceof Error ? decryptErr.message : "unknown error"}. The key share may need Shamir reconstruction.`,
          );
        }
      }

      setStep("complete");
    } catch (err) {
      setStepError(err instanceof Error ? err.message : "Purchase failed");
      setStep("error");
    } finally {
      purchaseInFlight.current = false;
    }
  };

  if (step === "complete") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Signal Purchased & Decrypted
        </h1>

        {decryptedPick ? (
          <div className="card text-left mb-8">
            <h3 className="text-sm font-medium text-slate-500 mb-3">
              Decrypted Signal
            </h3>
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-4">
              <p className="text-xs text-green-600 uppercase tracking-wide mb-1">
                Real Pick (Line #{decryptedPick.realIndex})
              </p>
              <p className="text-lg font-bold text-green-800">
                {decryptedPick.pick}
              </p>
            </div>
            <h3 className="text-sm font-medium text-slate-500 mb-2">
              All Lines
            </h3>
            <div className="space-y-1">
              {signal.decoyLines.map((raw, i) => {
                const structured = parseLine(raw);
                const display = structured ? formatLine(structured) : raw;
                return (
                  <p
                    key={i}
                    className={`text-sm font-mono rounded px-3 py-2 ${
                      i + 1 === decryptedPick.realIndex
                        ? "bg-green-100 text-green-800 font-bold"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {i + 1}. {display}
                    {i + 1 === decryptedPick.realIndex && " \u2190 REAL"}
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card text-left mb-8">
            <h3 className="text-sm font-medium text-slate-500 mb-3">
              Lines (decryption key pending)
            </h3>
            <div className="space-y-1">
              {signal.decoyLines.map((raw, i) => {
                const structured = parseLine(raw);
                const display = structured ? formatLine(structured) : raw;
                return (
                  <p
                    key={i}
                    className="text-sm text-slate-600 font-mono bg-slate-50 rounded px-3 py-2"
                  >
                    {i + 1}. {display}
                  </p>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => router.push("/idiot")}
          className="btn-primary"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isProcessing =
    step === "checking_lines" ||
    step === "purchasing_validator" ||
    step === "purchasing_chain" ||
    step === "decrypting";

  const stepLabel: Record<string, string> = {
    checking_lines: "Checking line availability with miner...",
    purchasing_validator: "Verifying signal availability with validator (MPC)...",
    purchasing_chain: "Executing on-chain purchase...",
    decrypting: "Decrypting signal...",
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => router.back()}
        className="text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        &larr; Back
      </button>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Signal Info */}
        <div className="md:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Signal #{truncateAddress(String(params.id))}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  by {truncateAddress(signal.genius)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isActive
                    ? "bg-green-100 text-green-600 border border-green-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {isActive ? "Active" : signalStatusLabel(signal.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Sport
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {signal.sport}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Max Price
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {formatBps(signal.maxPriceBps)} of notional
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  SLA Multiplier
                </p>
                <p className="text-sm text-slate-900 font-medium mt-1">
                  {formatBps(signal.slaMultiplierBps)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Expires
                </p>
                <p
                  className={`text-sm font-medium mt-1 ${
                    isExpired ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {expiresDate.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Lines */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                Lines (9 decoys + 1 real &mdash; you cannot tell which is which)
              </p>
              <div className="space-y-1">
                {signal.decoyLines.map((raw, i) => {
                  const structured = parseLine(raw);
                  const display = structured ? formatLine(structured) : raw;
                  return (
                    <p
                      key={i}
                      className={`text-xs font-mono rounded px-2 py-1.5 ${
                        availableIndices.includes(i + 1)
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-50 text-slate-500"
                      }`}
                    >
                      {i + 1}. {display}
                      {availableIndices.includes(i + 1) && " (available)"}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>

          {signal.availableSportsbooks.length > 0 && (
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
                Select Sportsbook
              </p>
              <div className="flex flex-wrap gap-2">
                {signal.availableSportsbooks.map((book) => (
                  <button
                    key={book}
                    type="button"
                    onClick={() => setSelectedSportsbook(book)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      selectedSportsbook === book
                        ? "bg-idiot-500 text-white"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    {book}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Purchase Panel */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Purchase Signal
            </h2>

            {!isActive ? (
              <p className="text-sm text-slate-500">
                This signal is no longer available for purchase.
              </p>
            ) : (
              <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                  <label htmlFor="notional" className="label">Notional (USDC)</label>
                  <input
                    id="notional"
                    type="number"
                    value={notional}
                    onChange={(e) => setNotional(e.target.value)}
                    placeholder="100.00"
                    min="0.01"
                    step="0.01"
                    className="input"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Reference amount for fee calculation
                  </p>
                </div>

                <div>
                  <label htmlFor="odds" className="label">Odds (decimal)</label>
                  <input
                    id="odds"
                    type="number"
                    value={odds}
                    onChange={(e) => setOdds(e.target.value)}
                    placeholder="1.91"
                    min="1.01"
                    step="0.01"
                    className="input"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    e.g. 1.91 = -110 American
                  </p>
                </div>

                {notional && (
                  <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Fee</span>
                      <span className="text-slate-900">
                        $
                        {(
                          (Number(notional) * Number(signal.maxPriceBps)) /
                          10_000
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        Genius collateral locked
                      </span>
                      <span className="text-slate-900">
                        $
                        {(
                          (Number(notional) *
                            Number(signal.slaMultiplierBps)) /
                          10_000
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {(purchaseError || stepError) && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
                    <p className="text-xs text-red-600">
                      {purchaseError || stepError}
                    </p>
                  </div>
                )}

                {isProcessing && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3" aria-live="polite">
                    <p className="text-xs text-blue-600">
                      {stepLabel[step] ?? "Processing..."}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isProcessing || purchaseLoading || !selectedSportsbook
                  }
                  className="btn-primary w-full py-3"
                >
                  {isProcessing
                    ? "Processing..."
                    : !selectedSportsbook
                      ? "Select a Sportsbook"
                      : "Purchase Signal"}
                </button>
              </form>
            )}
          </div>

          {/* Genius info sidebar */}
          <div className="card">
            <h3 className="text-sm font-medium text-slate-500 mb-3">
              Genius Stats
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500">Quality Score</p>
                <div className="mt-1">
                  <QualityScore score={Number(aggregateQualityScore)} size="sm" />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Signals</p>
                <p className="text-sm text-slate-900 font-medium">
                  {geniusSignals.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Audit Count</p>
                <p className="text-sm text-slate-900 font-medium">
                  {geniusAudits.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

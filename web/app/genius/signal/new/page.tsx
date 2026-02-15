"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCommitSignal } from "@/lib/hooks";
import {
  generateAesKey,
  encrypt,
  splitSecret,
  keyToBigInt,
  toHex,
} from "@/lib/crypto";
import { getValidatorClients } from "@/lib/api";

const SPORTS = [
  "NFL",
  "NBA",
  "MLB",
  "NHL",
  "NCAAF",
  "NCAAB",
  "Soccer",
  "Tennis",
  "MMA",
  "Other",
] as const;

const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Barstool",
  "WynnBET",
] as const;

type Step = "form" | "committing" | "distributing" | "success" | "error";

export default function CreateSignal() {
  const router = useRouter();
  const { authenticated, user } = usePrivy();
  const { commit, loading: commitLoading, error: commitError } =
    useCommitSignal();

  // Form state
  const [sport, setSport] = useState<string>(SPORTS[0]);
  const [maxPriceBps, setMaxPriceBps] = useState("10");
  const [slaMultiplier, setSlaMultiplier] = useState("100");
  const [expiresIn, setExpiresIn] = useState("24");
  const [decoyLines, setDecoyLines] = useState<string[]>(Array(10).fill(""));
  const [realIndex, setRealIndex] = useState(0); // 0-indexed, will be stored as 1-indexed
  const [selectedSportsbooks, setSelectedSportsbooks] = useState<string[]>([]);

  // Progress state
  const [step, setStep] = useState<Step>("form");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Create Signal
        </h1>
        <p className="text-slate-500">
          Connect your wallet to create a signal.
        </p>
      </div>
    );
  }

  const handleDecoyChange = (index: number, value: string) => {
    const updated = [...decoyLines];
    updated[index] = value;
    setDecoyLines(updated);
  };

  const toggleSportsbook = (book: string) => {
    setSelectedSportsbooks((prev) =>
      prev.includes(book) ? prev.filter((b) => b !== book) : [...prev, book],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);

    const geniusAddress = user?.wallet?.address;
    if (!geniusAddress) {
      setStepError("Wallet address not available");
      return;
    }

    try {
      // Step 1: Generate AES key and encrypt the real pick
      setStep("committing");

      const aesKey = generateAesKey();
      const pickPayload = JSON.stringify({
        realIndex: realIndex + 1, // 1-indexed
        pick: decoyLines[realIndex],
      });
      const { ciphertext, iv } = await encrypt(pickPayload, aesKey);
      const encryptedBlob = `${iv}:${ciphertext}`;

      // Step 2: Compute commit hash
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(encryptedBlob),
      );
      const commitHash =
        "0x" +
        Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      // Step 3: Generate signal ID
      const signalId = BigInt(
        "0x" +
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
      );

      const expiresAt = BigInt(
        Math.floor(Date.now() / 1000) + Number(expiresIn) * 3600,
      );

      // Step 4: Commit on-chain
      const hash = await commit({
        signalId,
        encryptedBlob: "0x" + toHex(encoder.encode(encryptedBlob)),
        commitHash,
        sport,
        maxPriceBps: BigInt(Math.round(Number(maxPriceBps) * 100)),
        slaMultiplierBps: BigInt(Math.round(Number(slaMultiplier) * 100)),
        expiresAt,
        decoyLines,
        availableSportsbooks: selectedSportsbooks,
      });
      setTxHash(hash);

      // Step 5: Split AES key into Shamir shares
      setStep("distributing");

      const keyBigInt = keyToBigInt(aesKey);
      const shares = splitSecret(keyBigInt, 10, 7);

      // Step 6: Distribute shares to validators
      const validators = getValidatorClients();
      const signalIdStr = signalId.toString();

      // In local mode (1 validator), send all 10 shares to it
      // In production (N validators), distribute round-robin
      const storePromises = shares.map((share, i) => {
        const validator = validators[i % validators.length];
        return validator.storeShare({
          signal_id: signalIdStr,
          genius_address: geniusAddress,
          share_x: share.x,
          share_y: share.y.toString(16),
          encrypted_key_share: toHex(aesKey), // Each share is backed by the full encrypted key
        });
      });

      await Promise.all(storePromises);

      setStep("success");
    } catch (err) {
      setStepError(
        err instanceof Error ? err.message : "Signal creation failed",
      );
      setStep("error");
    }
  };

  if (step === "success") {
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
          Signal Committed & Shares Distributed
        </h1>
        <p className="text-slate-500 mb-2">
          Your signal has been committed on-chain and encryption key shares
          have been distributed to validators.
        </p>
        <p className="text-sm text-slate-500 font-mono break-all mb-8">
          tx: {txHash}
        </p>
        <button
          onClick={() => router.push("/genius")}
          className="btn-primary"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Signal Creation Failed
        </h1>
        <p className="text-sm text-red-600 mb-8">{stepError}</p>
        <button onClick={() => setStep("form")} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const isProcessing = step === "committing" || step === "distributing";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Create Signal</h1>
      <p className="text-slate-500 mb-8">
        Enter your real prediction and 9 decoy lines. The client will encrypt
        your pick, commit it on-chain, and distribute key shares to validators.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sport */}
        <div>
          <label className="label">Sport</label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="input"
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Decoy Lines + Real Pick Selection */}
        <div>
          <label className="label">
            Lines (10 total &mdash; select which is your real pick)
          </label>
          <div className="space-y-2">
            {decoyLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRealIndex(i)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors flex-shrink-0 ${
                    i === realIndex
                      ? "border-genius-500 bg-genius-500 text-white"
                      : "border-slate-300 text-slate-400 hover:border-slate-400"
                  }`}
                  title={
                    i === realIndex ? "This is your real pick" : "Click to mark as real pick"
                  }
                >
                  {i + 1}
                </button>
                <input
                  type="text"
                  value={line}
                  onChange={(e) => handleDecoyChange(i, e.target.value)}
                  placeholder={`Line ${i + 1}: e.g. "Lakers -3.5 (-110)"`}
                  className={`input flex-1 ${i === realIndex ? "ring-2 ring-genius-200" : ""}`}
                  required
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Click a number to mark it as your real pick. The highlighted line
            will be encrypted. The other 9 are decoys.
          </p>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Max Price (%)</label>
            <input
              type="number"
              value={maxPriceBps}
              onChange={(e) => setMaxPriceBps(e.target.value)}
              placeholder="5"
              min="0.01"
              max="50"
              step="0.01"
              className="input"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Fee as % of notional (max 50%)
            </p>
          </div>
          <div>
            <label className="label">SLA Multiplier (%)</label>
            <input
              type="number"
              value={slaMultiplier}
              onChange={(e) => setSlaMultiplier(e.target.value)}
              placeholder="100"
              min="100"
              step="1"
              className="input"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Damages rate if signal is unfavorable (min 100%)
            </p>
          </div>
        </div>

        {/* Expiration */}
        <div>
          <label className="label">Expires In (hours)</label>
          <input
            type="number"
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            placeholder="24"
            min="1"
            max="168"
            className="input"
            required
          />
        </div>

        {/* Sportsbooks */}
        <div>
          <label className="label">Available Sportsbooks</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {SPORTSBOOKS.map((book) => (
              <button
                key={book}
                type="button"
                onClick={() => toggleSportsbook(book)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  selectedSportsbooks.includes(book)
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {book}
              </button>
            ))}
          </div>
        </div>

        {(commitError || stepError) && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-600">{commitError || stepError}</p>
          </div>
        )}

        {isProcessing && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-600">
              {step === "committing"
                ? "Encrypting and committing signal on-chain..."
                : "Distributing key shares to validators..."}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || commitLoading}
          className="btn-primary w-full py-3 text-base"
        >
          {isProcessing ? "Processing..." : "Create Signal"}
        </button>
      </form>
    </div>
  );
}

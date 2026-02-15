"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCommitSignal } from "@/lib/hooks";
import { parseUsdc } from "@/lib/types";

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

export default function CreateSignal() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { commit, loading, error } = useCommitSignal();

  const [sport, setSport] = useState<string>(SPORTS[0]);
  const [maxPriceBps, setMaxPriceBps] = useState("10");
  const [slaMultiplier, setSlaMultiplier] = useState("100");
  const [expiresIn, setExpiresIn] = useState("24");
  const [decoyLines, setDecoyLines] = useState<string[]>(
    Array(10).fill("")
  );
  const [encryptedBlob, setEncryptedBlob] = useState("");
  const [selectedSportsbooks, setSelectedSportsbooks] = useState<string[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Create Signal</h1>
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
      prev.includes(book) ? prev.filter((b) => b !== book) : [...prev, book]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const expiresAt = BigInt(
      Math.floor(Date.now() / 1000) + Number(expiresIn) * 3600
    );

    // Generate a random signal ID
    const signalId = BigInt(
      "0x" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
    );

    // Generate commit hash from encrypted blob
    const encoder = new TextEncoder();
    const data = encoder.encode(encryptedBlob);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const commitHash =
      "0x" +
      Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    try {
      const hash = await commit({
        signalId,
        encryptedBlob: "0x" + Buffer.from(encryptedBlob).toString("hex"),
        commitHash,
        sport,
        maxPriceBps: BigInt(Number(maxPriceBps) * 100),
        slaMultiplierBps: BigInt(Number(slaMultiplier) * 100),
        expiresAt,
        decoyLines,
        availableSportsbooks: selectedSportsbooks,
      });
      setTxHash(hash);
    } catch {
      // Error is already captured in the hook
    }
  };

  if (txHash) {
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
          Signal Committed
        </h1>
        <p className="text-slate-500 mb-6">
          Your signal has been committed on-chain.
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

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Create Signal</h1>
      <p className="text-slate-500 mb-8">
        Commit an encrypted prediction on-chain with 10 decoy lines.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Encrypted Signal */}
        <div>
          <label className="label">Encrypted Signal Blob</label>
          <textarea
            value={encryptedBlob}
            onChange={(e) => setEncryptedBlob(e.target.value)}
            placeholder="Paste your AES-256-GCM encrypted signal here..."
            rows={4}
            className="input font-mono text-xs"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Encrypt your signal client-side before pasting. The real prediction
            is hidden inside this blob.
          </p>
        </div>

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

        {/* Decoy Lines */}
        <div>
          <label className="label">
            Decoy Lines (10 required -- 9 decoys + 1 real)
          </label>
          <div className="space-y-2">
            {decoyLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono w-6">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={line}
                  onChange={(e) => handleDecoyChange(i, e.target.value)}
                  placeholder={`Line ${i + 1}: e.g. "Lakers -3.5 (-110)"`}
                  className="input flex-1"
                  required
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            One of these lines should match your real signal. The other 9 are
            decoys to obscure which one is real.
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

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 text-base"
        >
          {loading ? "Committing..." : "Commit Signal On-Chain"}
        </button>
      </form>
    </div>
  );
}

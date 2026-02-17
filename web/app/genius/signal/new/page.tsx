"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useActiveSignals } from "@/lib/hooks/useSignals";
import { fetchProtocolStats } from "@/lib/subgraph";
import { formatUsdc } from "@/lib/types";
import {
  SPORT_GROUPS,
  SPORTS,
  generateDecoys,
  extractBets,
  betToLine,
  formatLine,
  formatOdds,
  usesDecimalOdds,
  serializeLine,
  type OddsEvent,
  type AvailableBet,
  type StructuredLine,
  type SportOption,
} from "@/lib/odds";

const SHAMIR_TOTAL_SHARES = 10;
const SHAMIR_THRESHOLD = 7;

type WizardStep = "browse" | "review" | "configure" | "committing" | "distributing" | "success" | "error";

export default function CreateSignal() {
  const router = useRouter();
  const { authenticated, user } = usePrivy();
  const { commit, loading: commitLoading, error: commitError } =
    useCommitSignal();
  const address = user?.wallet?.address;
  const { signals: existingSignals } = useActiveSignals(undefined, address);
  const signalCount = existingSignals.length;
  const MAX_PROOF_SIGNALS = 20;

  // Wizard step
  const [step, setStep] = useState<WizardStep>("browse");

  // Step 1: Browse
  const [selectedSport, setSelectedSport] = useState<SportOption>(SPORTS[0]);
  const [events, setEvents] = useState<OddsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedBet, setSelectedBet] = useState<AvailableBet | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Step 2: Review lines
  const [realPick, setRealPick] = useState<StructuredLine | null>(null);
  const [decoyLines, setDecoyLines] = useState<StructuredLine[]>([]);
  const [realIndex, setRealIndex] = useState(0);

  // Odds: market reference and genius's signal odds (American format string)
  const [marketOdds, setMarketOdds] = useState<number | null>(null);
  const [editOdds, setEditOdds] = useState("");
  // Per-book prices for depth visualization
  const [bookPrices, setBookPrices] = useState<{ book: string; price: number }[]>([]);
  // Which line is expanded for editing (0-9 index, null = none)
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  // Step 3: Configure
  const [maxPriceBps, setMaxPriceBps] = useState("10");
  const [slaMultiplier, setSlaMultiplier] = useState("100");
  const [maxNotional, setMaxNotional] = useState("10000");
  const [expiresIn, setExpiresIn] = useState("24");
  const [selectedSportsbooks, setSelectedSportsbooks] = useState<string[]>([]);

  // Platform liquidity (from subgraph)
  const [totalVolume, setTotalVolume] = useState<string | null>(null);

  // Progress
  const [txHash, setTxHash] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // Sort events by commence time and filter by search
  const filteredEvents = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime(),
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(
      (ev) =>
        ev.home_team.toLowerCase().includes(q) ||
        ev.away_team.toLowerCase().includes(q),
    );
  }, [events, searchQuery]);

  const fetchEvents = useCallback(async (sport: SportOption) => {
    setEventsLoading(true);
    setEventsError(null);
    setEvents([]);
    setSelectedBet(null);
    setSearchQuery("");
    try {
      const resp = await fetch(`/api/odds?sport=${sport.key}`);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(data.error || `Failed to load games (${resp.status})`);
      }
      const data: OddsEvent[] = await resp.json();
      setEvents(data);
    } catch (err) {
      setEventsError(
        err instanceof Error ? err.message : "Failed to load games",
      );
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchEvents(selectedSport);
    }
  }, [selectedSport, authenticated, fetchEvents]);

  // Fetch platform-wide liquidity once
  useEffect(() => {
    fetchProtocolStats().then((stats) => {
      if (stats?.totalVolume) setTotalVolume(stats.totalVolume);
    }).catch(() => {});
  }, []);

  const handleSelectBet = (bet: AvailableBet) => {
    setSelectedBet(bet);
    const pick = betToLine(bet);
    setRealPick(pick);
    setMarketOdds(bet.avgPrice);
    setEditOdds(decimalToAmerican(bet.avgPrice));
    setSelectedSportsbooks(bet.books);
    // Extract per-book prices for depth visualization
    const prices: { book: string; price: number }[] = [];
    for (const bk of bet.event.bookmakers) {
      for (const mkt of bk.markets) {
        if (mkt.key !== bet.market) continue;
        for (const outcome of mkt.outcomes) {
          if (outcome.name === bet.side && (outcome.point ?? null) === bet.line) {
            prices.push({ book: bk.title, price: outcome.price });
          }
        }
      }
    }
    setBookPrices(prices.sort((a, b) => b.price - a.price));
    const decoys = generateDecoys(pick, events, 9);
    setDecoyLines(decoys);
    const pos = cryptoRandomInt(10);
    setRealIndex(pos);
    setStep("review");
  };

  const handleRegenerateDecoys = () => {
    if (!realPick) return;
    const decoys = generateDecoys(realPick, events, 9);
    setDecoyLines(decoys);
    setRealIndex(cryptoRandomInt(10));
  };

  const getAllLines = (): StructuredLine[] => {
    if (!realPick) return [];
    const lines: StructuredLine[] = [];
    let decoyIdx = 0;
    for (let i = 0; i < 10; i++) {
      if (i === realIndex) {
        lines.push(realPick);
      } else {
        lines.push(decoyLines[decoyIdx++]);
      }
    }
    return lines;
  };

  /** Update any line (real pick or decoy) by its global 0-9 index. */
  const updateLine = (globalIdx: number, updates: Partial<StructuredLine>) => {
    if (globalIdx === realIndex) {
      setRealPick((prev) => prev ? { ...prev, ...updates } : prev);
      // Sync editOdds if price changed on the real pick
      if (updates.price != null) {
        setEditOdds(decimalToAmerican(updates.price));
      }
    } else {
      const decoyIdx = globalIdx < realIndex ? globalIdx : globalIdx - 1;
      setDecoyLines((prev) =>
        prev.map((d, i) => (i === decoyIdx ? { ...d, ...updates } : d)),
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);

    if (!realPick) {
      setStepError("No signal selected");
      return;
    }

    const geniusAddress = user?.wallet?.address;
    if (!geniusAddress) {
      setStepError("Wallet address not available");
      return;
    }

    const allLines = getAllLines();
    if (allLines.length !== 10) {
      setStepError("Expected 10 lines");
      return;
    }

    try {
      setStep("committing");

      const aesKey = generateAesKey();
      const minOddsDecimal = editOdds ? americanToDecimal(editOdds) : null;
      const pickPayload = JSON.stringify({
        realIndex: realIndex + 1,
        pick: formatLine(realPick),
        minOdds: minOddsDecimal,
        minOddsAmerican: editOdds || null,
      });
      const { ciphertext, iv } = await encrypt(pickPayload, aesKey);
      const encryptedBlob = `${iv}:${ciphertext}`;

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

      const signalId = BigInt(
        "0x" +
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
      );

      const expiresInNum = parseFloat(expiresIn);
      const maxPriceNum = parseFloat(maxPriceBps);
      const slaNum = parseFloat(slaMultiplier);
      if (isNaN(expiresInNum) || !Number.isFinite(expiresInNum) || expiresInNum <= 0) {
        setStepError("Invalid expiration time");
        setStep("configure");
        return;
      }
      if (isNaN(maxPriceNum) || !Number.isFinite(maxPriceNum) || maxPriceNum <= 0 || maxPriceNum > 100) {
        setStepError("Invalid max price (must be 0-100%)");
        setStep("configure");
        return;
      }
      if (isNaN(slaNum) || !Number.isFinite(slaNum) || slaNum < 100 || slaNum > 1000) {
        setStepError("Invalid SLA multiplier (must be 100-1000%)");
        setStep("configure");
        return;
      }
      const maxNotionalNum = parseFloat(maxNotional);
      if (isNaN(maxNotionalNum) || !Number.isFinite(maxNotionalNum) || maxNotionalNum < 1) {
        setStepError("Invalid max notional (must be at least $1)");
        setStep("configure");
        return;
      }

      const expiresAt = BigInt(
        Math.floor(Date.now() / 1000) + expiresInNum * 3600,
      );

      const serializedLines = allLines.map(serializeLine);

      const hash = await commit({
        signalId,
        encryptedBlob: "0x" + toHex(encoder.encode(encryptedBlob)),
        commitHash,
        sport: selectedSport.label,
        maxPriceBps: BigInt(Math.round(maxPriceNum * 100)),
        slaMultiplierBps: BigInt(Math.round(slaNum * 100)),
        maxNotional: BigInt(Math.round(maxNotionalNum * 1e6)),
        expiresAt,
        decoyLines: serializedLines,
        availableSportsbooks: selectedSportsbooks,
      });
      setTxHash(hash);

      setStep("distributing");

      const keyBigInt = keyToBigInt(aesKey);
      const shares = splitSecret(keyBigInt, SHAMIR_TOTAL_SHARES, SHAMIR_THRESHOLD);

      const validators = getValidatorClients();
      const signalIdStr = signalId.toString();

      const storePromises = shares.map((share, i) => {
        const validator = validators[i % validators.length];
        // Send only the individual Shamir share — NEVER the full AES key
        const shareHex = share.y.toString(16).padStart(64, "0");
        return validator.storeShare({
          signal_id: signalIdStr,
          genius_address: geniusAddress,
          share_x: share.x,
          share_y: share.y.toString(16),
          encrypted_key_share: shareHex,
        });
      });

      const results = await Promise.allSettled(storePromises);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (succeeded < SHAMIR_THRESHOLD) {
        throw new Error(
          `Only ${succeeded}/${SHAMIR_TOTAL_SHARES} shares stored (need ${SHAMIR_THRESHOLD}). ${failed} failed.`,
        );
      }
      if (failed > 0) {
        console.warn(`${failed}/10 share stores failed (${succeeded} succeeded)`);
      }

      // Persist private signal data for future track record proof generation
      try {
        const stored = JSON.parse(localStorage.getItem("djinn-signal-data") || "[]");
        stored.push({
          signalId: signalId.toString(),
          preimage: keyToBigInt(aesKey).toString(),
          realIndex: realIndex + 1, // 1-indexed as used in ZK circuit
          sport: selectedSport.label,
          pick: formatLine(realPick),
          minOdds: minOddsDecimal,
          minOddsAmerican: editOdds || null,
          slaMultiplierBps: Math.round(slaNum * 100),
          createdAt: Math.floor(Date.now() / 1000),
        });
        localStorage.setItem("djinn-signal-data", JSON.stringify(stored));
      } catch {
        // localStorage may be unavailable; non-fatal
        console.warn("Failed to save signal data to localStorage");
      }

      setStep("success");
    } catch (err) {
      setStepError(
        err instanceof Error ? err.message : "Signal creation failed",
      );
      setStep("error");
    }
  };

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

  // ---------- Success ----------
  if (step === "success") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
        <button onClick={() => router.push("/genius")} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ---------- Error ----------
  if (step === "error") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Signal Creation Failed
        </h1>
        <p className="text-sm text-red-600 mb-8">{stepError}</p>
        <button onClick={() => setStep("browse")} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const isProcessing = step === "committing" || step === "distributing";

  // ---------- Step 1: Browse games & pick a bet ----------
  if (step === "browse") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold text-slate-900">Create Signal</h1>
          {totalVolume && (
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Platform Liquidity</p>
              <p className="text-sm font-semibold text-genius-700">
                ${formatUsdc(BigInt(totalVolume))}
              </p>
            </div>
          )}
        </div>
        <p className="text-slate-500 mb-6">
          Browse live games and select your signal. The system will auto-generate
          plausible decoy lines from real odds data.
        </p>

        {signalCount >= MAX_PROOF_SIGNALS && (
          <div className="rounded-lg px-4 py-3 mb-6 text-sm bg-amber-50 text-amber-700 border border-amber-200">
            You have {signalCount} active signals. Track record proofs support up
            to {MAX_PROOF_SIGNALS} signals each. You can still create signals, but
            will need to generate multiple proofs for your full track record.
          </div>
        )}

        {/* Sport Selector — grouped */}
        <div className="space-y-3 mb-6">
          {SPORT_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.sports.map((sport) => (
                  <button
                    key={sport.key}
                    type="button"
                    onClick={() => setSelectedSport(sport)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedSport.key === sport.key
                        ? "bg-genius-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {sport.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        {events.length > 0 && (
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${selectedSport.label} teams...`}
              className="input w-full"
              autoComplete="off"
              aria-label={`Search ${selectedSport.label} teams`}
            />
          </div>
        )}

        {/* Loading */}
        {eventsLoading && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-genius-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500">Loading {selectedSport.label} games...</p>
          </div>
        )}

        {/* Error */}
        {eventsError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6" role="alert">
            <p className="text-sm text-red-600">{eventsError}</p>
            <button
              onClick={() => fetchEvents(selectedSport)}
              className="text-sm text-red-700 underline mt-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* No events */}
        {!eventsLoading && !eventsError && events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">
              No upcoming {selectedSport.label} games found. Try another sport.
            </p>
          </div>
        )}

        {/* Search no results */}
        {!eventsLoading && events.length > 0 && filteredEvents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">
              No games matching &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}

        {/* Events list */}
        {!eventsLoading && filteredEvents.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {filteredEvents.length} game{filteredEvents.length !== 1 ? "s" : ""} — sorted by start time
            </p>
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelectBet={handleSelectBet}
                oddsFormat={usesDecimalOdds(selectedSport.key) ? "decimal" : "american"}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- Step 2: Review lines ----------
  if (step === "review") {
    const allLines = getAllLines();
    const sameMarketCount = allLines.filter(
      (l) => l.market === realPick?.market,
    ).length;
    const useDecimal = usesDecimalOdds(selectedSport.key);
    const oddsFormat: "american" | "decimal" = useDecimal ? "decimal" : "american";
    const signalDecimal = editOdds ? americanToDecimal(editOdds) : null;
    const ODDS_STEP = 0.05; // decimal increment for nudge buttons
    const LINE_STEP = 0.5; // spread/total increment for nudge buttons

    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setStep("browse")}
          className="text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          &larr; Back to Games
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Review Lines</h1>
        <p className="text-slate-500 mb-4">
          Tap any line to edit it. 9 decoy lines are auto-generated from real odds data.
          Purchasers won&apos;t know which line is yours.
        </p>

        <p className="text-xs text-slate-400 mb-3">
          {sameMarketCount}/10 lines are {realPick?.market === "h2h" ? "moneyline" : realPick?.market} — higher same-market ratio = harder to identify your signal
        </p>

        <div className="space-y-2 mb-6">
          {allLines.map((line, i) => {
            const isReal = i === realIndex;
            const isExpanded = expandedLine === i;
            const sides = line.market === "totals"
              ? ["Over", "Under"]
              : [line.home_team, line.away_team];

            return (
              <div
                key={i}
                className={`rounded-lg overflow-hidden transition-all ${
                  isReal
                    ? "border-2 border-genius-300 bg-genius-50"
                    : "border border-slate-200 bg-slate-50"
                }`}
              >
                {/* Collapsed row — click to expand */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 text-sm cursor-pointer ${
                    isReal ? "font-medium text-genius-800" : "text-slate-600"
                  }`}
                  onClick={() => setExpandedLine(isExpanded ? null : i)}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isReal ? "bg-genius-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{formatLine(line, oddsFormat)}</span>
                  {isReal && (
                    <span className="text-xs bg-genius-200 text-genius-700 rounded px-2 py-0.5 flex-shrink-0">
                      YOUR PICK
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""} ${isReal ? "text-genius-500" : "text-slate-400"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded edit panel */}
                {isExpanded && (
                  <div className={`px-4 pb-4 pt-2 border-t space-y-3 ${isReal ? "border-genius-200" : "border-slate-200"}`}>
                    {/* Side selector */}
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Side</p>
                      <div className="flex gap-2">
                        {sides.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateLine(i, { side: s })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              line.side === s
                                ? isReal ? "bg-genius-500 text-white" : "bg-slate-700 text-white"
                                : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Change game — decoys only */}
                    {!isReal && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Game</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 flex-1 truncate">
                            {line.away_team} @ {line.home_team}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const others = events.filter((ev) => ev.id !== line.event_id);
                              if (others.length === 0) return;
                              const ev = others[cryptoRandomInt(others.length)];
                              updateLine(i, {
                                event_id: ev.id,
                                home_team: ev.home_team,
                                away_team: ev.away_team,
                                sport: ev.sport_key,
                              });
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                          >
                            Change Game
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Line value (spreads/totals only) */}
                    {line.market !== "h2h" && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                          {line.market === "spreads" ? "Spread" : "Total"}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.5"
                            value={line.line ?? ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && Number.isFinite(val)) {
                                updateLine(i, { line: val });
                              }
                            }}
                            className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-genius-400"
                          />
                          <button
                            type="button"
                            onClick={() => updateLine(i, { line: (line.line ?? 0) - LINE_STEP })}
                            className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 font-bold text-sm flex-shrink-0 flex items-center justify-center"
                          >
                            &minus;
                          </button>
                          <input
                            type="range"
                            min={line.market === "totals" ? 100 : -15}
                            max={line.market === "totals" ? 300 : 15}
                            step="0.5"
                            value={line.line ?? 0}
                            onChange={(e) => updateLine(i, { line: parseFloat(e.target.value) })}
                            className="flex-1 accent-genius-500 h-2"
                          />
                          <button
                            type="button"
                            onClick={() => updateLine(i, { line: (line.line ?? 0) + LINE_STEP })}
                            className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 font-bold text-sm flex-shrink-0 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Odds */}
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                        {isReal ? "Signal Odds" : "Odds"}{useDecimal ? " (decimal)" : " (American)"}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={
                            useDecimal
                              ? (isReal ? (signalDecimal?.toFixed(2) ?? line.price?.toFixed(2) ?? "") : (line.price?.toFixed(2) ?? ""))
                              : (isReal ? editOdds : (line.price ? decimalToAmerican(line.price) : ""))
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (useDecimal) {
                              if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
                              const dec = parseFloat(raw);
                              if (!isNaN(dec) && dec >= 1.01) {
                                if (isReal) {
                                  setEditOdds(decimalToAmerican(dec));
                                  setRealPick((prev) => prev ? { ...prev, price: dec } : prev);
                                } else {
                                  updateLine(i, { price: dec });
                                }
                              }
                            } else {
                              if (!/^[+-]?\d*$/.test(raw)) return;
                              if (isReal) {
                                setEditOdds(raw);
                                const dec = americanToDecimal(raw);
                                if (dec != null) setRealPick((prev) => prev ? { ...prev, price: dec } : prev);
                              } else {
                                const dec = americanToDecimal(raw);
                                if (dec != null) updateLine(i, { price: dec });
                              }
                            }
                          }}
                          placeholder={useDecimal ? "1.91" : "-110"}
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-genius-400"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cur = isReal ? (signalDecimal ?? line.price ?? 1.91) : (line.price ?? 1.91);
                            const next = Math.max(1.01, cur - ODDS_STEP);
                            if (isReal) {
                              setEditOdds(decimalToAmerican(next));
                              setRealPick((prev) => prev ? { ...prev, price: next } : prev);
                            } else {
                              updateLine(i, { price: next });
                            }
                          }}
                          className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 font-bold text-sm flex-shrink-0 flex items-center justify-center"
                        >
                          &minus;
                        </button>
                        <input
                          type="range"
                          min="1.1"
                          max="10"
                          step="0.01"
                          value={isReal ? (signalDecimal ?? line.price ?? 1.91) : (line.price ?? 1.91)}
                          onChange={(e) => {
                            const dec = parseFloat(e.target.value);
                            if (isReal) {
                              setEditOdds(decimalToAmerican(dec));
                              setRealPick((prev) => prev ? { ...prev, price: dec } : prev);
                            } else {
                              updateLine(i, { price: dec });
                            }
                          }}
                          className="flex-1 accent-genius-500 h-2"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cur = isReal ? (signalDecimal ?? line.price ?? 1.91) : (line.price ?? 1.91);
                            const next = Math.min(10, cur + ODDS_STEP);
                            if (isReal) {
                              setEditOdds(decimalToAmerican(next));
                              setRealPick((prev) => prev ? { ...prev, price: next } : prev);
                            } else {
                              updateLine(i, { price: next });
                            }
                          }}
                          className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 font-bold text-sm flex-shrink-0 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      {isReal && (
                        <p className="text-[10px] text-genius-500 mt-1">
                          The odds at which you value this signal.
                        </p>
                      )}
                    </div>

                    {/* Market depth — real pick only */}
                    {isReal && bookPrices.length > 0 && (
                      <div className="rounded-lg bg-white border border-genius-200 overflow-hidden">
                        <p className="text-[10px] text-genius-600 uppercase tracking-wide font-medium px-3 pt-2 pb-1">
                          Market Depth
                        </p>
                        <table className="w-full text-xs">
                          <tbody>
                            {bookPrices.map(({ book, price }, bi) => {
                              const displayOdds = formatOdds(price, oddsFormat);
                              const atOrBetter = signalDecimal != null && price >= signalDecimal;
                              return (
                                <tr key={`${book}-${bi}`} className={atOrBetter ? "bg-genius-50" : ""}>
                                  <td className={`pl-3 py-1 font-medium ${atOrBetter ? "text-genius-700" : "text-slate-500"}`}>{book}</td>
                                  <td className={`pr-3 py-1 text-right font-mono font-semibold ${atOrBetter ? "text-genius-700" : "text-slate-400"}`}>{displayOdds}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {signalDecimal != null && (
                          <p className="text-[10px] text-genius-500 px-3 py-1.5 border-t border-genius-100">
                            {bookPrices.filter(p => p.price >= signalDecimal).length}/{bookPrices.length} at or above your signal odds
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleRegenerateDecoys}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Regenerate Decoys
          </button>
          <button
            onClick={() => setStep("configure")}
            className="btn-primary flex-1 py-2"
          >
            Continue to Pricing
          </button>
        </div>
      </div>
    );
  }

  // ---------- Step 3: Configure & Submit ----------
  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => setStep("review")}
        className="text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        &larr; Back to Review
      </button>

      <h1 className="text-3xl font-bold text-slate-900 mb-2">Configure Signal</h1>
      <p className="text-slate-500 mb-6">
        Set your pricing, expiration, and available sportsbooks.
      </p>

      {realPick && (
        <div className="rounded-lg bg-genius-50 border border-genius-200 p-4 mb-6">
          <p className="text-xs text-genius-600 uppercase tracking-wide mb-1">Your Pick</p>
          <p className="text-sm font-bold text-genius-800">{formatLine(realPick)}</p>
          <p className="text-xs text-genius-600 mt-1">
            + 9 decoy lines from {selectedSport.label}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="maxPriceBps" className="label">Signal Fee (%)</label>
          <input
            id="maxPriceBps"
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
            Percentage buyers pay per purchase. Higher fee = more revenue but fewer buyers.
          </p>
          {(() => {
            const pct = parseFloat(maxPriceBps);
            if (!isNaN(pct) && pct > 0 && pct <= 50) {
              return (
                <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
                  <p>At $100 notional, buyer pays <span className="font-semibold text-genius-700">${(100 * pct / 100).toFixed(2)}</span> fee</p>
                  <p>At $500 notional, buyer pays <span className="font-semibold text-genius-700">${(500 * pct / 100).toFixed(2)}</span> fee</p>
                  <p>At $1,000 notional, buyer pays <span className="font-semibold text-genius-700">${(1000 * pct / 100).toFixed(2)}</span> fee</p>
                </div>
              );
            }
            return null;
          })()}
        </div>

        <div>
          <label htmlFor="slaMultiplier" className="label">SLA Multiplier (%)</label>
          <input
            id="slaMultiplier"
            type="number"
            value={slaMultiplier}
            onChange={(e) => setSlaMultiplier(e.target.value)}
            placeholder="100"
            min="100"
            max="1000"
            step="1"
            className="input"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            If your pick is wrong, you owe the buyer this % of their notional from your collateral.
            100% = full notional at risk. Higher = more buyer protection.
          </p>
        </div>

        <div>
          <label htmlFor="expiresIn" className="label">Expires In (hours)</label>
          <input
            id="expiresIn"
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

        <div>
          <label htmlFor="maxNotional" className="label">Max Notional (USDC)</label>
          <input
            id="maxNotional"
            type="number"
            value={maxNotional}
            onChange={(e) => setMaxNotional(e.target.value)}
            placeholder="10000"
            min="1"
            max="1000000000"
            step="1"
            className="input"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Maximum notional a purchaser can specify. Caps your collateral exposure per purchase.
          </p>
          {(() => {
            const mn = parseFloat(maxNotional);
            const sla = parseFloat(slaMultiplier);
            if (!isNaN(mn) && mn > 0 && !isNaN(sla) && sla > 0) {
              const maxLock = mn * sla / 100;
              return (
                <p className="text-xs text-slate-500 mt-1">
                  At max notional, <span className="font-semibold text-genius-700">${maxLock.toLocaleString()}</span> of your collateral would be locked.
                </p>
              );
            }
            return null;
          })()}
        </div>

        {selectedSportsbooks.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Available Sportsbooks (auto-detected)</p>
            <div className="flex flex-wrap gap-2">
              {selectedSportsbooks.map((book) => (
                <span
                  key={book}
                  className="rounded-lg px-3 py-1.5 text-sm bg-slate-100 text-slate-600"
                >
                  {book}
                </span>
              ))}
            </div>
          </div>
        )}

        {(commitError || stepError) && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4" role="alert">
            <p className="text-sm text-red-600">{commitError || stepError}</p>
          </div>
        )}

        {isProcessing && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4" aria-live="polite">
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Format a relative countdown like "Starts in 3h 12m" or "Started 45m ago" */
function timeUntil(dateStr: string): { text: string; isLive: boolean } {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) {
    const ago = Math.abs(diffMs);
    if (ago < 60_000) return { text: "Just started", isLive: true };
    if (ago < 3_600_000) return { text: `Started ${Math.floor(ago / 60_000)}m ago`, isLive: true };
    return { text: `Started ${Math.floor(ago / 3_600_000)}h ago`, isLive: true };
  }

  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { text: `in ${days}d ${hours % 24}h`, isLive: false };
  }
  if (hours > 0) {
    return { text: `in ${hours}h ${minutes}m`, isLive: false };
  }
  return { text: `in ${minutes}m`, isLive: false };
}

function EventCard({
  event,
  onSelectBet,
  oddsFormat = "american",
}: {
  event: OddsEvent;
  onSelectBet: (bet: AvailableBet) => void;
  oddsFormat?: "american" | "decimal";
}) {
  const [expanded, setExpanded] = useState(false);
  const bets = extractBets(event);
  const { text: countdown, isLive } = timeUntil(event.commence_time);
  const commence = new Date(event.commence_time);

  const spreadBets = bets.filter((b) => b.market === "spreads");
  const totalBets = bets.filter((b) => b.market === "totals");
  const mlBets = bets.filter((b) => b.market === "h2h");

  // Build compact spread preview showing both sides
  const spreadPreview = spreadBets.length >= 2
    ? spreadBets.slice(0, 2).map((b) => {
        const last = b.side.split(" ").pop();
        const sign = b.line != null && b.line > 0 ? "+" : "";
        return `${last} ${sign}${b.line}`;
      })
    : null;

  // Build compact ML preview
  const mlPreview = mlBets.length >= 2
    ? mlBets.slice(0, 2).map((b) => {
        const last = b.side.split(" ").pop();
        return `${last} ${formatOdds(b.avgPrice, oddsFormat)}`;
      })
    : null;

  return (
    <div className="card">
      <div
        className="flex items-center justify-between cursor-pointer gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Left: Teams + time */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            {event.away_team} @ {event.home_team}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-medium ${isLive ? "text-red-600" : "text-slate-500"}`}>
              {isLive ? "LIVE" : countdown}
            </span>
            <span className="text-xs text-slate-400">
              {commence.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              {commence.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* Center: Quick odds preview (collapsed only) */}
        {!expanded && (
          <div className="hidden sm:flex items-center gap-4 text-right flex-shrink-0">
            {spreadPreview && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase">Spread</p>
                <div className="text-xs font-mono text-slate-600 space-y-0.5">
                  {spreadPreview.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </div>
            )}
            {mlPreview && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase">ML</p>
                <div className="text-xs font-mono text-slate-600 space-y-0.5">
                  {mlPreview.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <svg
          className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          {spreadBets.length > 0 && (
            <BetSection title="Spread" bets={spreadBets} onSelect={onSelectBet} oddsFormat={oddsFormat} />
          )}
          {totalBets.length > 0 && (
            <BetSection title="Total" bets={totalBets} onSelect={onSelectBet} oddsFormat={oddsFormat} />
          )}
          {mlBets.length > 0 && (
            <BetSection title="Moneyline" bets={mlBets} onSelect={onSelectBet} oddsFormat={oddsFormat} />
          )}
          {bets.length === 0 && (
            <p className="text-xs text-slate-400">No odds available for this game</p>
          )}
        </div>
      )}
    </div>
  );
}

function BetSection({
  title,
  bets,
  onSelect,
  oddsFormat = "american",
}: {
  title: string;
  bets: AvailableBet[];
  onSelect: (bet: AvailableBet) => void;
  oddsFormat?: "american" | "decimal";
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {bets.map((bet, i) => {
          const lineStr =
            bet.market === "h2h"
              ? ""
              : bet.line != null
                ? ` ${bet.line > 0 ? "+" : ""}${bet.line}`
                : "";
          const priceStr = formatOdds(bet.avgPrice, oddsFormat);
          const bookLabel = bet.bookCount === 1
            ? "1 book"
            : `${bet.bookCount} books`;

          return (
            <button
              key={`${bet.side}-${bet.line}-${i}`}
              type="button"
              onClick={() => onSelect(bet)}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-genius-400 hover:bg-genius-50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 group-hover:text-genius-800 truncate">
                  {bet.side}{lineStr}
                </p>
                <p className="text-[10px] text-slate-400 group-hover:text-genius-500">
                  {bookLabel}
                  {bet.bookCount > 1 && bet.minPrice !== bet.maxPrice && (
                    <> &middot; {formatOdds(bet.minPrice, oddsFormat)} to {formatOdds(bet.maxPrice, oddsFormat)}</>
                  )}
                </p>
              </div>
              <span className="text-sm font-mono font-semibold text-slate-600 group-hover:text-genius-600 ml-2 flex-shrink-0">
                {priceStr}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Convert decimal odds to American format for display. */
function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) {
    return `+${Math.round((decimal - 1) * 100)}`;
  }
  if (decimal > 1.0) {
    return `${Math.round(-100 / (decimal - 1))}`;
  }
  return "EVEN";
}

/** Convert American odds string to decimal. Returns null if invalid. */
function americanToDecimal(american: string): number | null {
  const n = parseInt(american, 10);
  if (isNaN(n) || n === 0) return null;
  // Reject invalid American odds in the range (-100, 0) and (0, 100)
  if (n > 0 && n < 100) return null;
  if (n < 0 && n > -100) return null;
  if (n > 0) return 1 + n / 100;      // +150 → 2.50
  return 1 + 100 / Math.abs(n);        // -150 → 1.667
}

/** Cryptographically secure random integer in [0, max). Uses rejection sampling. */
function cryptoRandomInt(max: number): number {
  if (max <= 0) throw new Error("max must be positive");
  const limit = Math.floor(0x100000000 / max) * max;
  const arr = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(arr);
    if (arr[0] < limit) return arr[0] % max;
  }
}

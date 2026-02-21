"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProtocolStats, type SubgraphProtocolStats } from "@/lib/subgraph";
import { formatUsdc } from "@/lib/types";

interface ErrorReport {
  message: string;
  url: string;
  errorMessage: string;
  source: string;
  timestamp: string;
  wallet: string;
  signalId: string;
  ip: string;
}

interface ValidatorNode {
  uid: number;
  ip: string;
  port: number;
}

interface ValidatorHealth {
  uid: number;
  status: string;
  version: string;
  shares_held: number;
  chain_connected: boolean;
  bt_connected: boolean;
  error?: string;
}

interface MinerHealth {
  status: string;
  version: string;
  odds_api_connected: boolean;
  bt_connected: boolean;
  uptime_seconds: number;
  error?: string;
}

const GRAFANA_URL = process.env.NEXT_PUBLIC_GRAFANA_URL || "";

export default function AdminDashboard() {
  const [validators, setValidators] = useState<ValidatorHealth[]>([]);
  const [miner, setMiner] = useState<MinerHealth | null>(null);
  const [stats, setStats] = useState<SubgraphProtocolStats | null>(null);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);

  // Simple client-side password gate
  useEffect(() => {
    const stored = sessionStorage.getItem("djinn_admin_auth");
    if (stored === "1") setAuthed(true);
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "djinn103";
    if (password === expected) {
      setAuthed(true);
      sessionStorage.setItem("djinn_admin_auth", "1");
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);

    const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "djinn103";
    const [validatorResults, minerResult, statsResult, errorsResult] = await Promise.allSettled([
      fetchValidatorHealth(),
      fetchMinerHealth(),
      fetchProtocolStats(),
      fetchErrorReports(adminPass),
    ]);

    if (validatorResults.status === "fulfilled") setValidators(validatorResults.value);
    if (minerResult.status === "fulfilled") setMiner(minerResult.value);
    if (statsResult.status === "fulfilled") setStats(statsResult.value);
    if (errorsResult.status === "fulfilled" && errorsResult.value) {
      setErrorReports(errorsResult.value.errors);
      setErrorTotal(errorsResult.value.total);
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [authed, refresh]);

  if (!authed) {
    return (
      <div className="max-w-md mx-auto py-20">
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm text-center mb-8">Enter the admin password to continue.</p>
        <form onSubmit={handleAuth} className="card">
          <label htmlFor="admin-pass" className="label">Password</label>
          <input
            id="admin-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mb-4"
            autoFocus
            required
          />
          {authError && (
            <p className="text-sm text-red-500 mb-3">Incorrect password.</p>
          )}
          <button type="submit" className="btn-primary w-full">Enter</button>
        </form>
      </div>
    );
  }

  const healthyValidators = validators.filter((v) => v.status === "ok");
  const totalShares = validators.reduce((sum, v) => sum + (v.shares_held || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Djinn Protocol infrastructure monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-xs text-slate-400">
              Last: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {GRAFANA_URL && (
            <a
              href={GRAFANA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium bg-genius-600 text-white rounded-lg hover:bg-genius-500"
            >
              Open Grafana
            </a>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <StatCard
          label="Validators"
          value={`${healthyValidators.length}/${validators.length}`}
          status={healthyValidators.length >= 7 ? "green" : healthyValidators.length >= 4 ? "yellow" : "red"}
        />
        <StatCard
          label="Miner"
          value={miner?.status === "ok" ? "UP" : "DOWN"}
          status={miner?.status === "ok" ? "green" : "red"}
        />
        <StatCard
          label="Key Shares"
          value={totalShares.toString()}
          status="blue"
        />
        <StatCard
          label="Total Signals"
          value={stats?.totalSignals ?? "-"}
          status="blue"
        />
        <StatCard
          label="Purchases"
          value={stats?.totalPurchases ?? "-"}
          status="purple"
        />
        <StatCard
          label="Volume"
          value={stats?.totalVolume ? formatUsdc(BigInt(stats.totalVolume)) : "-"}
          status="purple"
        />
      </div>

      {/* Validator Grid */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Validators</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">UID</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Version</th>
                <th className="px-4 py-3 text-right font-medium">Shares</th>
                <th className="px-4 py-3 text-center font-medium">Chain</th>
                <th className="px-4 py-3 text-center font-medium">Bittensor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {validators.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No validators discovered
                  </td>
                </tr>
              )}
              {validators.map((v) => (
                <tr key={v.uid} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-700">{v.uid}</td>
                  <td className="px-4 py-3">
                    {v.error ? (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <Dot color="red" /> Unreachable
                      </span>
                    ) : v.status === "ok" ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <Dot color="green" /> Healthy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-yellow-600">
                        <Dot color="yellow" /> {v.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {v.version || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {v.error ? "-" : v.shares_held}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {v.error ? "-" : v.chain_connected ? (
                      <span className="text-green-500">connected</span>
                    ) : (
                      <span className="text-red-500">disconnected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {v.error ? "-" : v.bt_connected ? (
                      <span className="text-green-500">connected</span>
                    ) : (
                      <span className="text-red-500">disconnected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Miner Status */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Miner</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {miner?.error ? (
            <div className="text-red-600 flex items-center gap-2">
              <Dot color="red" /> Miner unreachable: {miner.error}
            </div>
          ) : miner ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <span className="text-xs text-slate-400 block mb-1">Status</span>
                <span className={`font-medium ${miner.status === "ok" ? "text-green-600" : "text-yellow-600"}`}>
                  {miner.status === "ok" ? "Healthy" : miner.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Version</span>
                <span className="font-mono text-sm text-slate-700">{miner.version || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Odds API</span>
                <span className={miner.odds_api_connected ? "text-green-600" : "text-red-600"}>
                  {miner.odds_api_connected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Uptime</span>
                <span className="font-mono text-sm text-slate-700">
                  {formatUptime(miner.uptime_seconds)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-slate-400">Loading...</div>
          )}
        </div>
      </div>

      {/* Protocol Stats */}
      {stats && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Protocol Statistics</h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Unique Geniuses</span>
              <span className="text-2xl font-bold text-slate-900">{stats.uniqueGeniuses}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Unique Idiots</span>
              <span className="text-2xl font-bold text-slate-900">{stats.uniqueIdiots}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Total Audits</span>
              <span className="text-2xl font-bold text-slate-900">{stats.totalAudits}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Track Record Proofs</span>
              <span className="text-2xl font-bold text-slate-900">{stats.totalTrackRecordProofs}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Reports */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Error Reports
            {errorTotal > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">({errorTotal} total)</span>
            )}
          </h2>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {errorReports.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              No error reports yet
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {errorReports.slice(0, 20).map((err, i) => (
                <div key={i} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          err.source === "error-boundary"
                            ? "bg-red-100 text-red-700"
                            : err.source === "api-error"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}>
                          {err.source}
                        </span>
                        {err.wallet && (
                          <span className="text-[10px] font-mono text-slate-400">{err.wallet}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-900 truncate">{err.message}</p>
                      {err.errorMessage && err.errorMessage !== err.message && (
                        <p className="text-xs text-red-600 font-mono truncate mt-0.5">{err.errorMessage}</p>
                      )}
                      {err.url && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{err.url}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {new Date(err.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links — only show when Grafana is configured */}
      {GRAFANA_URL && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Monitoring</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ExternalLink
              href={`${GRAFANA_URL}/d/djinn-overview`}
              title="Protocol Overview"
              description="Request rates, purchases, MPC performance"
            />
            <ExternalLink
              href={`${GRAFANA_URL}/d/djinn-validators`}
              title="Validator Metrics"
              description="Per-validator shares, latency, errors"
            />
            <ExternalLink
              href={`${GRAFANA_URL}/d/djinn-miner`}
              title="Miner Metrics"
              description="Line checks, cache hit rate, Odds API"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, status }: { label: string; value: string; status: string }) {
  const colors: Record<string, string> = {
    green: "border-green-200 bg-green-50",
    yellow: "border-yellow-200 bg-yellow-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
    purple: "border-purple-200 bg-purple-50",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[status] || "border-slate-200 bg-white"}`}>
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  const cls: Record<string, string> = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${cls[color] || "bg-slate-300"}`} />;
}

function ExternalLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <span className="font-medium text-slate-900 block">{title}</span>
      <span className="text-xs text-slate-500 mt-1 block">{description}</span>
    </a>
  );
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

async function fetchValidatorHealth(): Promise<ValidatorHealth[]> {
  try {
    const discoverRes = await fetch("/api/validators/discover");
    if (!discoverRes.ok) return [];
    const { validators } = (await discoverRes.json()) as { validators: ValidatorNode[] };

    const results = await Promise.allSettled(
      validators.map(async (v) => {
        const res = await fetch(`/api/validators/${v.uid}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        return { ...data, uid: v.uid } as ValidatorHealth;
      }),
    );

    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { uid: validators[i].uid, status: "error", version: "", shares_held: 0, chain_connected: false, bt_connected: false, error: String((r as PromiseRejectedResult).reason) },
    );
  } catch {
    return [];
  }
}

async function fetchErrorReports(auth: string): Promise<{ errors: ErrorReport[]; total: number } | null> {
  try {
    const res = await fetch(`/api/admin/errors?auth=${encodeURIComponent(auth)}&limit=50`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchMinerHealth(): Promise<MinerHealth | null> {
  try {
    const res = await fetch("/api/miner/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: "error", version: "", odds_api_connected: false, bt_connected: false, uptime_seconds: 0, error: `${res.status}` };
    return await res.json();
  } catch (err) {
    return { status: "error", version: "", odds_api_connected: false, bt_connected: false, uptime_seconds: 0, error: String(err) };
  }
}

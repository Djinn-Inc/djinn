"use client";

import { useCallback, useState } from "react";

interface AttestResult {
  request_id: string;
  url: string;
  success: boolean;
  verified: boolean;
  proof_hex: string | null;
  server_name: string | null;
  timestamp: number;
  error: string | null;
}

type Status = "idle" | "submitting" | "proving" | "done" | "error";

const BURN_ADDRESS = "5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM";

export default function AttestPage() {
  const [url, setUrl] = useState("");
  const [burnTxHash, setBurnTxHash] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AttestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.startsWith("https://")) {
        setErrorMsg("URL must start with https://");
        return;
      }
      if (!burnTxHash.trim()) {
        setErrorMsg("Burn transaction hash is required");
        return;
      }

      setStatus("submitting");
      setResult(null);
      setErrorMsg(null);

      const requestId = `attest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      try {
        setStatus("proving");
        const resp = await fetch("/api/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            request_id: requestId,
            burn_tx_hash: burnTxHash.trim(),
          }),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({ detail: "Request failed" }));
          const msg = data.detail || data.error || `Request failed (${resp.status})`;
          setErrorMsg(
            resp.status === 403
              ? `Burn verification failed: ${msg}`
              : msg,
          );
          setStatus("error");
          return;
        }

        const data: AttestResult = await resp.json();
        setResult(data);
        setStatus("done");

        if (!data.success) {
          setErrorMsg(data.error || "Attestation failed");
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Network error");
        setStatus("error");
      }
    },
    [url, burnTxHash],
  );

  const handleDownload = useCallback(() => {
    if (!result?.proof_hex) return;
    const bytes = new Uint8Array(
      result.proof_hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attestation-${result.timestamp}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result]);

  const proofHash =
    result?.proof_hex
      ? Array.from(
          new Uint8Array(
            // SHA-256 not available synchronously — use first 16 bytes as fingerprint
            result.proof_hex
              .slice(0, 32)
              .match(/.{2}/g)!
              .map((b) => parseInt(b, 16)),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Web Attestation</h1>
        <p className="text-slate-500 mt-1">
          Generate a cryptographic TLSNotary proof that a website served specific content at a
          specific time. Powered by Bittensor Subnet 103.
        </p>
      </div>

      {/* Burn info box */}
      <div className="max-w-2xl mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Alpha burn required</p>
        <p>
          Each attestation costs <strong>0.0001 TAO</strong> of SN103 alpha. Transfer to the burn
          address below from your Bittensor wallet, then paste the extrinsic hash.
        </p>
        <p className="font-mono text-xs mt-2 break-all bg-blue-100 rounded px-2 py-1">
          {BURN_ADDRESS}
        </p>
        <p className="mt-2 text-xs text-blue-600">
          Don&apos;t have alpha?{" "}
          <a
            href="https://docs.bittensor.com/subnets/register-validate-mine"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-800"
          >
            Stake TAO on Subnet 103
          </a>{" "}
          to acquire alpha tokens.
        </p>
      </div>

      {/* URL input form */}
      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit}>
          <label className="label" htmlFor="attest-url">
            URL to attest
          </label>
          <input
            id="attest-url"
            className="input w-full"
            type="url"
            placeholder="https://example.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={status === "submitting" || status === "proving"}
          />
          <p className="text-xs text-slate-400 mt-1">
            Must be an HTTPS URL. The miner will fetch this page and produce a TLSNotary proof of
            the server&apos;s response.
          </p>

          <label className="label mt-4" htmlFor="burn-tx-hash">
            Burn transaction hash
          </label>
          <input
            id="burn-tx-hash"
            className="input w-full font-mono text-sm"
            type="text"
            placeholder="0x..."
            value={burnTxHash}
            onChange={(e) => setBurnTxHash(e.target.value)}
            required
            disabled={status === "submitting" || status === "proving"}
          />
          <p className="text-xs text-slate-400 mt-1">
            The substrate extrinsic hash from your alpha burn transfer.
          </p>

          <button
            type="submit"
            className="btn-primary mt-4 w-full sm:w-auto"
            disabled={status === "submitting" || status === "proving" || !url || !burnTxHash}
          >
            {status === "submitting" || status === "proving" ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {status === "submitting" ? "Submitting..." : "Generating proof..."}
              </span>
            ) : (
              "Attest"
            )}
          </button>
        </form>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="max-w-2xl mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Result card */}
      {result && result.success && (
        <div className="card max-w-2xl mt-6">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                result.verified
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-amber-100 text-amber-700 border border-amber-200"
              }`}
            >
              {result.verified ? "Verified" : "Unverified"}
            </span>
            <h2 className="text-lg font-semibold text-slate-900">Attestation Result</h2>
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">URL</dt>
              <dd className="font-mono text-slate-900 break-all">{result.url}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Server</dt>
              <dd className="font-mono text-slate-900">{result.server_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Timestamp</dt>
              <dd className="text-slate-900">
                {result.timestamp
                  ? new Date(result.timestamp * 1000).toLocaleString()
                  : "—"}
              </dd>
            </div>
            {proofHash && (
              <div>
                <dt className="text-slate-500">Proof fingerprint</dt>
                <dd className="font-mono text-xs text-slate-600">{proofHash}...</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">Proof size</dt>
              <dd className="text-slate-900">
                {result.proof_hex
                  ? `${(result.proof_hex.length / 2).toLocaleString()} bytes`
                  : "—"}
              </dd>
            </div>
          </dl>

          {result.proof_hex && (
            <button onClick={handleDownload} className="btn-secondary mt-4">
              Download proof
            </button>
          )}
        </div>
      )}

      {/* Explanation */}
      <div className="max-w-2xl mt-8 text-sm text-slate-500 space-y-2">
        <h3 className="font-semibold text-slate-700">What is a TLSNotary proof?</h3>
        <p>
          TLSNotary uses multi-party computation during the TLS handshake to produce a
          cryptographic proof that a specific web server sent specific content. Unlike
          screenshots or web archives, this proof is tamper-proof and cryptographically
          verifiable by anyone.
        </p>
        <p>
          Use cases include legal evidence, journalism verification, governance transparency,
          and academic citations with permanent, cryptographic provenance.
        </p>
      </div>
    </div>
  );
}

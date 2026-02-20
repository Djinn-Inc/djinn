import { NextRequest, NextResponse } from "next/server";
import { discoverValidatorUrl } from "@/lib/bt-metagraph";

async function getValidatorUrl(): Promise<string> {
  const envUrl = process.env.VALIDATOR_URL || process.env.NEXT_PUBLIC_VALIDATOR_URL;
  if (envUrl) return envUrl;
  try {
    const discovered = await discoverValidatorUrl();
    if (discovered) return discovered;
  } catch {
    // fall through
  }
  return "http://localhost:8421";
}

/**
 * POST /api/attest — Proxy attestation requests to a validator's /v1/attest endpoint.
 *
 * Body: { url: string, request_id: string, burn_tx_hash: string }
 * Response: AttestResponse from the validator
 */
export async function POST(request: NextRequest) {
  const target = `${await getValidatorUrl()}/v1/attest`;

  let body: { url?: string; request_id?: string; burn_tx_hash?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Server-side validation — don't trust the client
  if (!body.url || typeof body.url !== "string" || !body.url.startsWith("https://")) {
    return NextResponse.json({ error: "URL must start with https://" }, { status: 400 });
  }
  if (!body.request_id || typeof body.request_id !== "string") {
    return NextResponse.json({ error: "request_id is required" }, { status: 400 });
  }
  if (!body.burn_tx_hash || typeof body.burn_tx_hash !== "string") {
    return NextResponse.json({ error: "burn_tx_hash is required" }, { status: 400 });
  }

  // Only forward whitelisted fields
  const sanitizedBody = {
    url: body.url,
    request_id: body.request_id,
    burn_tx_hash: body.burn_tx_hash,
  };

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedBody),
      signal: AbortSignal.timeout(120_000), // 2 minute timeout
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return NextResponse.json({ error: "Attestation timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Validator unavailable" },
      { status: 502 },
    );
  }
}

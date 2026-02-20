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

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Validator unavailable" },
      { status: 502 },
    );
  }
}

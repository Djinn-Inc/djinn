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
 * POST /api/attest/credits — Check remaining attestation credits for a burn tx hash.
 *
 * Body: { burn_tx_hash: string }
 * Response: { burn_tx_hash: string, remaining: number }
 */
export async function POST(request: NextRequest) {
  const { burn_tx_hash } = await request.json();
  if (!burn_tx_hash) {
    return NextResponse.json({ error: "burn_tx_hash required" }, { status: 400 });
  }
  const target = `${await getValidatorUrl()}/v1/attest/credits/${encodeURIComponent(burn_tx_hash)}`;

  try {
    const res = await fetch(target);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Validator unavailable" }, { status: 502 });
  }
}

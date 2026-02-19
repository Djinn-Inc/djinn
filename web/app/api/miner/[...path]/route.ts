import { NextRequest, NextResponse } from "next/server";
import { discoverMinerUrl } from "@/lib/bt-metagraph";

const ALLOWED_PATHS = new Set(["health", "v1/check"]);

async function getMinerUrl(): Promise<string> {
  // 1. Explicit env var takes priority
  const envUrl = process.env.MINER_URL || process.env.NEXT_PUBLIC_MINER_URL;
  if (envUrl) return envUrl;

  // 2. Metagraph discovery
  try {
    const discovered = await discoverMinerUrl();
    if (discovered) return discovered;
  } catch {
    // fall through
  }

  // 3. Localhost fallback
  return "http://localhost:8422";
}

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = params.path.join("/");
  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = `${await getMinerUrl()}/${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Miner unavailable" },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;

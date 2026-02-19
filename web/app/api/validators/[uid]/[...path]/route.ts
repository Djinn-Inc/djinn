import { NextRequest, NextResponse } from "next/server";
import { discoverMetagraph } from "@/lib/bt-metagraph";

const ALLOWED_PATHS = new Set(["health", "v1/signal"]);
const PURCHASE_RE = /^v1\/signal\/[a-zA-Z0-9_-]+\/purchase$/;
const REGISTER_RE = /^v1\/signal\/[a-zA-Z0-9_-]+\/register$/;

function isAllowed(path: string): boolean {
  return ALLOWED_PATHS.has(path) || PURCHASE_RE.test(path) || REGISTER_RE.test(path);
}

async function resolveValidatorUrl(uid: number): Promise<string | null> {
  const { nodes } = await discoverMetagraph();
  const node = nodes.find((n) => n.uid === uid && n.port > 0 && n.ip !== "0.0.0.0");
  if (!node) return null;
  return `http://${node.ip}:${node.port}`;
}

async function proxy(
  request: NextRequest,
  { params }: { params: { uid: string; path: string[] } },
) {
  const uid = parseInt(params.uid, 10);
  if (isNaN(uid) || uid < 0) {
    return NextResponse.json({ error: "Invalid UID" }, { status: 400 });
  }

  const path = params.path.join("/");
  if (!isAllowed(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const baseUrl = await resolveValidatorUrl(uid);
  if (!baseUrl) {
    return NextResponse.json(
      { error: `Validator UID ${uid} not found in metagraph` },
      { status: 404 },
    );
  }

  const target = `${baseUrl}/${path}`;
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
      { error: "Validator unavailable" },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;

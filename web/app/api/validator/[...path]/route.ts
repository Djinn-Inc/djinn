import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = new Set(["health", "v1/signal"]);
const PURCHASE_RE = /^v1\/signal\/[a-zA-Z0-9_-]+\/purchase$/;

function getValidatorUrl(): string {
  return (
    process.env.VALIDATOR_URL ||
    process.env.NEXT_PUBLIC_VALIDATOR_URL ||
    "http://localhost:8421"
  );
}

function isAllowed(path: string): boolean {
  return ALLOWED_PATHS.has(path) || PURCHASE_RE.test(path);
}

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = params.path.join("/");
  if (!isAllowed(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = `${getValidatorUrl()}/${path}`;
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

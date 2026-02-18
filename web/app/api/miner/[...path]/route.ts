import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = new Set(["health", "v1/check"]);

function getMinerUrl(): string {
  return (
    process.env.MINER_URL ||
    process.env.NEXT_PUBLIC_MINER_URL ||
    "http://localhost:8422"
  );
}

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = params.path.join("/");
  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = `${getMinerUrl()}/${path}`;
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

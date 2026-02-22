import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/beta/verify
 *
 * Verify beta access password server-side.
 * Sets an httpOnly cookie on success so the password never reaches the client bundle.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.BETA_PASSWORD;

  // If no beta password is configured, beta gate is disabled
  if (!expected) {
    return NextResponse.json({ ok: true });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.password || body.password !== expected) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("djinn_beta_access", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}

/**
 * GET /api/beta/verify
 *
 * Check if the user has beta access (via cookie).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.BETA_PASSWORD;

  // If no beta password is configured, everyone has access
  if (!expected) {
    return NextResponse.json({ authorized: true });
  }

  const cookie = request.cookies.get("djinn_beta_access")?.value;
  return NextResponse.json({ authorized: cookie === "true" });
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>, ip = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost:3000/api/report-error", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/report-error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid error report", async () => {
    const resp = await POST(
      makeRequest({
        message: "Something broke",
        url: "/genius",
        source: "report-button",
      }, "10.0.0.1"),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
  });

  it("rejects missing message", async () => {
    const resp = await POST(
      makeRequest({ url: "/genius" }, "10.0.0.2"),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects oversized message", async () => {
    const resp = await POST(
      makeRequest({ message: "x".repeat(2001) }, "10.0.0.3"),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/report-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.4",
      },
      body: "not json",
    });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("rate limits after 5 requests from same IP", async () => {
    const ip = "192.168.99.88";
    for (let i = 0; i < 5; i++) {
      const resp = await POST(
        makeRequest({ message: `report ${i}` }, ip),
      );
      expect(resp.status).toBe(200);
    }
    const resp = await POST(
      makeRequest({ message: "too many" }, ip),
    );
    expect(resp.status).toBe(429);
  });

  it("writes to local JSONL file", async () => {
    const { appendFile } = await import("fs/promises");
    await POST(
      makeRequest({ message: "logged error", source: "error-boundary" }, "10.0.0.5"),
    );
    expect(appendFile).toHaveBeenCalledTimes(1);
    const [path, content] = (appendFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("errors.jsonl");
    const parsed = JSON.parse(content.trim());
    expect(parsed.message).toBe("logged error");
    expect(parsed.source).toBe("error-boundary");
  });
});

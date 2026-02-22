import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BetaGate from "../BetaGate";

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("BetaGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when server says authorized", async () => {
    // Mock fetch to return authorized: true (beta gate disabled or user has cookie)
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ authorized: true }),
    });

    render(
      <BetaGate>
        <div data-testid="protected">Secret content</div>
      </BetaGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("protected")).toBeTruthy();
    });
  });

  it("renders children when fetch fails (graceful fallback)", async () => {
    // If the API is unreachable, allow access (beta gate disabled)
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(
      <BetaGate>
        <div data-testid="protected">Fallback content</div>
      </BetaGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("protected")).toBeTruthy();
    });
  });

  it("shows password form when server says not authorized", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ authorized: false }),
    });

    render(
      <BetaGate>
        <div data-testid="protected">Protected</div>
      </BetaGate>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter beta password")).toBeTruthy();
    });

    // Children should NOT be rendered
    expect(screen.queryByTestId("protected")).toBeNull();
  });

  it("does not crash on render", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ authorized: true }),
    });

    const { container } = render(
      <BetaGate>
        <div>Content</div>
      </BetaGate>,
    );

    await waitFor(() => {
      expect(container.textContent).toContain("Content");
    });
  });
});

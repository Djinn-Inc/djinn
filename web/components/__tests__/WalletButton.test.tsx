import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WalletButton from "../WalletButton";

// Mock Privy
const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: vi.fn(() => ({
    ready: true,
    authenticated: false,
    login: mockLogin,
    logout: mockLogout,
    user: null,
  })),
}));

// Need to import after mock setup for re-mocking per test
import { usePrivy } from "@privy-io/react-auth";

describe("WalletButton", () => {
  it("shows loading state when not ready", () => {
    vi.mocked(usePrivy).mockReturnValue({
      ready: false,
      authenticated: false,
      login: mockLogin,
      logout: mockLogout,
      user: null,
    } as ReturnType<typeof usePrivy>);
    render(<WalletButton />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe("Loading...");
  });

  it("shows connect button when not authenticated", () => {
    vi.mocked(usePrivy).mockReturnValue({
      ready: true,
      authenticated: false,
      login: mockLogin,
      logout: mockLogout,
      user: null,
    } as ReturnType<typeof usePrivy>);
    render(<WalletButton />);
    const btn = screen.getByRole("button", { name: /connect wallet/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(mockLogin).toHaveBeenCalled();
  });

  it("shows address and disconnect when authenticated", () => {
    vi.mocked(usePrivy).mockReturnValue({
      ready: true,
      authenticated: true,
      login: mockLogin,
      logout: mockLogout,
      user: {
        wallet: { address: "0x1234567890abcdef1234567890abcdef12345678" },
      },
    } as unknown as ReturnType<typeof usePrivy>);
    render(<WalletButton />);
    // Should show truncated address
    expect(screen.getByText("0x1234...5678")).toBeTruthy();
    // Should show disconnect button
    const btn = screen.getByRole("button", { name: /disconnect/i });
    fireEvent.click(btn);
    expect(mockLogout).toHaveBeenCalled();
  });
});

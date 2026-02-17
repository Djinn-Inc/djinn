import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock RainbowKit's ConnectButton
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button data-testid="connect-button">Connect Wallet</button>,
}));

import WalletButton from "../WalletButton";

describe("WalletButton", () => {
  it("renders the RainbowKit ConnectButton", () => {
    render(<WalletButton />);
    expect(screen.getByTestId("connect-button")).toBeDefined();
  });
});

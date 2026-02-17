import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock RainbowKit's ConnectButton.Custom
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
      children({
        account: undefined,
        chain: undefined,
        openConnectModal: vi.fn(),
        openAccountModal: vi.fn(),
        openChainModal: vi.fn(),
        mounted: true,
      }),
  },
}));

import WalletButton from "../WalletButton";

describe("WalletButton", () => {
  it("renders Get Started button when not connected", () => {
    render(<WalletButton />);
    expect(screen.getByText("Get Started")).toBeDefined();
  });
});

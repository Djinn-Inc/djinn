"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const activeChain = CHAIN_ID === 8453 ? base : baseSepolia;

if (!PRIVY_APP_ID && typeof window !== "undefined") {
  console.warn(
    "[Djinn] NEXT_PUBLIC_PRIVY_APP_ID is not set. Authentication will not work.",
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#059669",
        },
        loginMethods: ["email", "wallet"],
        defaultChain: activeChain,
        supportedChains: [activeChain],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

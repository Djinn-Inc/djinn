import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "./providers";
import Layout from "@/components/Layout";
import BetaGate from "@/components/BetaGate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Djinn | Sports Intelligence Marketplace",
  description:
    "Analysts sell encrypted predictions. Buyers purchase access. Signals stay secret forever. Track records are cryptographically verifiable. Built on Bittensor Subnet 103, settled in USDC on Base.",
  openGraph: {
    title: "Djinn | Sports Intelligence Marketplace",
    description:
      "Unbundling information from execution. Encrypted predictions, ZK-verified track records, settled in USDC on Base.",
    siteName: "Djinn",
  },
  twitter: {
    card: "summary_large_image",
    title: "Djinn | Sports Intelligence Marketplace",
    description:
      "Unbundling information from execution. Encrypted predictions, ZK-verified track records, settled in USDC on Base.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <BetaGate>
          <Providers>
            <Layout>{children}</Layout>
          </Providers>
        </BetaGate>
      </body>
    </html>
  );
}

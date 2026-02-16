import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Genius Dashboard | Djinn",
  description:
    "Manage your signals, collateral, and track record proofs. Create encrypted predictions and build a cryptographically verifiable track record.",
  openGraph: {
    title: "Genius Dashboard | Djinn",
    description:
      "Create encrypted predictions and build a cryptographically verifiable track record.",
  },
};

export default function GeniusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "./providers";
import Layout from "@/components/Layout";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Djinn Protocol",
  description:
    "Unbundling information from execution in sports betting. Encrypted predictions, cryptographic verification, settled in USDC on Base.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}

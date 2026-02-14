"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/genius", label: "Genius" },
  { href: "/idiot", label: "Idiot" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-bold text-white tracking-tight">
                  djinn
                </span>
                <span className="text-xs text-djinn-400 font-mono mt-1">
                  protocol
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map(({ href, label }) => {
                  const isActive =
                    href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-djinn-950 text-djinn-300"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-gray-800 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Djinn Protocol -- Bittensor Subnet 103</span>
            <span>Settled in USDC on Base</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/genius", label: "Genius" },
  { href: "/idiot", label: "Idiot" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/about", label: "About" },
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2.5">
                <Image
                  src="/djinn-logo.png"
                  alt="Djinn"
                  width={28}
                  height={28}
                  className="w-7 h-7"
                />
                <span className="text-lg font-bold text-slate-900 tracking-tight">
                  djinn
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
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <a
                  href="https://x.com/djinn_gg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="X / Twitter"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://github.com/djinn-inc/djinn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="GitHub"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
              </div>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Image
                  src="/djinn-logo.png"
                  alt="Djinn"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
                <span className="text-sm font-bold text-slate-900">djinn</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sports Intelligence Marketplace.
                <br />
                Bittensor Subnet 103.
                <br />
                Settled in USDC on Base.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Protocol</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link href="/genius" className="hover:text-slate-700 transition-colors">Genius Dashboard</Link></li>
                <li><Link href="/idiot" className="hover:text-slate-700 transition-colors">Browse Signals</Link></li>
                <li><Link href="/leaderboard" className="hover:text-slate-700 transition-colors">Leaderboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="https://github.com/djinn-inc/djinn" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 transition-colors">GitHub</a></li>
                <li><a href="https://github.com/djinn-inc/djinn/blob/main/docs/whitepaper.md" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 transition-colors">Whitepaper</a></li>
                <li><Link href="/about" className="hover:text-slate-700 transition-colors">About</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Community</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>
                  <a href="https://x.com/djinn_gg" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 transition-colors flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @djinn_gg
                  </a>
                </li>
                <li>
                  <a href="https://discord.com/channels/799672011265015819/1465362098971345010" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 transition-colors">Discord</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-6 border-t border-slate-200">
            <span>Djinn Protocol</span>
            <span>Information &times; Execution</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

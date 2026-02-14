import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="text-center py-20 max-w-4xl">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-6">
          Unbundling information
          <br />
          <span className="text-djinn-400">from execution</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12">
          Analysts sell encrypted predictions. Buyers purchase access. Signals
          stay secret forever. Track records are cryptographically verifiable.
          Built on Bittensor Subnet 103, settled in USDC on Base.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/genius"
            className="rounded-xl bg-djinn-600 px-8 py-4 text-lg font-semibold text-white hover:bg-djinn-500 transition-colors"
          >
            I&apos;m a Genius
          </Link>
          <Link
            href="/idiot"
            className="rounded-xl border border-gray-600 px-8 py-4 text-lg font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
          >
            I&apos;m an Idiot
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-5xl py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-12">
          How it works
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="card text-center">
            <div className="w-12 h-12 rounded-full bg-djinn-950 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-djinn-400">1</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Commit Signal
            </h3>
            <p className="text-sm text-gray-400">
              Geniuses encrypt their prediction with AES-256-GCM and commit it
              on-chain with 10 decoy lines. The real signal stays hidden.
            </p>
          </div>

          <div className="card text-center">
            <div className="w-12 h-12 rounded-full bg-djinn-950 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-djinn-400">2</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Purchase Access
            </h3>
            <p className="text-sm text-gray-400">
              Idiots deposit USDC into escrow and purchase signal access. Fees
              are calculated from the notional amount and max price. Credits
              offset fees.
            </p>
          </div>

          <div className="card text-center">
            <div className="w-12 h-12 rounded-full bg-djinn-950 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-djinn-400">3</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Audit & Settle
            </h3>
            <p className="text-sm text-gray-400">
              After 10 signals, a ZK audit verifies the Genius&apos;s track record.
              Positive Quality Score = Genius keeps fees. Negative = collateral
              gets slashed and credits are issued.
            </p>
          </div>
        </div>
      </section>

      {/* Stats placeholder */}
      <section className="w-full max-w-5xl py-16 border-t border-gray-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Active Signals</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Total Purchased</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Geniuses</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">USDC Volume</p>
          </div>
        </div>
      </section>

      {/* Leaderboard teaser */}
      <section className="w-full max-w-5xl py-16 border-t border-gray-800">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">Top Geniuses</h2>
          <Link
            href="/leaderboard"
            className="text-sm text-djinn-400 hover:text-djinn-300 transition-colors"
          >
            View full leaderboard
          </Link>
        </div>
        <div className="card">
          <p className="text-center text-gray-500 py-8">
            Leaderboard data will appear once signals are live on-chain.
          </p>
        </div>
      </section>
    </div>
  );
}

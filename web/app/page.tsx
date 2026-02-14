import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="text-center pt-20 pb-24 max-w-4xl px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-djinn-800 bg-djinn-950/50 px-4 py-1.5 text-sm text-djinn-300 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-djinn-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-djinn-500" />
          </span>
          Live on Bittensor Subnet 103
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
          Unbundling information
          <br />
          <span className="bg-gradient-to-r from-djinn-400 to-djinn-600 bg-clip-text text-transparent">
            from execution
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          The sports intelligence marketplace where analysts sell encrypted
          predictions and buyers purchase access. Signals stay secret forever.
          Track records are cryptographically verifiable.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/genius"
            className="group relative rounded-xl bg-djinn-600 px-8 py-4 text-lg font-semibold text-white hover:bg-djinn-500 transition-all hover:shadow-lg hover:shadow-djinn-600/25"
          >
            I&apos;m a Genius
            <span className="block text-xs font-normal text-djinn-200 mt-0.5">
              Sell your predictions
            </span>
          </Link>
          <Link
            href="/idiot"
            className="group rounded-xl border border-gray-600 px-8 py-4 text-lg font-semibold text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-all"
          >
            I&apos;m an Idiot
            <span className="block text-xs font-normal text-gray-500 mt-0.5">
              Buy signal access
            </span>
          </Link>
        </div>
      </section>

      {/* Trust bar */}
      <section className="w-full border-y border-gray-800 bg-gray-900/30 py-6">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap items-center justify-center gap-x-12 gap-y-3 text-sm text-gray-500">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-djinn-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            AES-256-GCM Encrypted
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-djinn-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            ZK-Verified Track Records
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-djinn-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Settled in USDC on Base
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-djinn-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Powered by Bittensor
          </span>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-5xl py-20 px-4">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-white mb-4">
          How it works
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
          Three steps. No middlemen. Fully on-chain settlement.
        </p>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop only) */}
          <div className="hidden md:block absolute top-10 left-[20%] right-[20%] h-px bg-gradient-to-r from-djinn-800 via-djinn-600 to-djinn-800" />

          <div className="card text-center relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-djinn-600 to-djinn-800 flex items-center justify-center mx-auto mb-5 ring-4 ring-gray-800">
              <span className="text-xl font-bold text-white">1</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-3">
              Commit Signal
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Geniuses encrypt their prediction with AES-256-GCM and commit it
              on-chain alongside 10 decoy lines. The real signal stays hidden
              until purchased.
            </p>
          </div>

          <div className="card text-center relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-djinn-600 to-djinn-800 flex items-center justify-center mx-auto mb-5 ring-4 ring-gray-800">
              <span className="text-xl font-bold text-white">2</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-3">
              Purchase Access
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Idiots deposit USDC into escrow and buy signal access. Miners
              verify line availability at real sportsbooks. The decryption key is
              released via Shamir secret sharing.
            </p>
          </div>

          <div className="card text-center relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-djinn-600 to-djinn-800 flex items-center justify-center mx-auto mb-5 ring-4 ring-gray-800">
              <span className="text-xl font-bold text-white">3</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-3">
              Audit & Settle
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              After 10 signals, a zero-knowledge audit computes the Genius&apos;s
              Quality Score. Positive = Genius keeps fees. Negative = collateral
              is slashed and credits are issued.
            </p>
          </div>
        </div>
      </section>

      {/* For Geniuses / For Idiots */}
      <section className="w-full max-w-5xl py-16 px-4">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Genius card */}
          <div className="rounded-2xl border border-djinn-800/50 bg-gradient-to-b from-djinn-950/80 to-gray-900/50 p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-djinn-950 px-3 py-1 text-xs font-medium text-djinn-400 mb-6">
              FOR ANALYSTS
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Become a Genius
            </h3>
            <ul className="space-y-3 text-sm text-gray-400 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-djinn-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Monetize your edge without revealing your strategy
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-djinn-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Predictions stay encrypted forever &mdash; no one can front-run you
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-djinn-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Build a ZK-verified track record that proves your accuracy
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-djinn-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Earn USDC fees directly &mdash; no platform cut beyond 0.5%
              </li>
            </ul>
            <Link
              href="/genius"
              className="btn-primary inline-flex items-center gap-2 !px-6 !py-3 !text-base"
            >
              Start Selling Signals
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          {/* Idiot card */}
          <div className="rounded-2xl border border-gray-700/50 bg-gradient-to-b from-gray-800/80 to-gray-900/50 p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-400 mb-6">
              FOR BUYERS
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Buy as an Idiot
            </h3>
            <ul className="space-y-3 text-sm text-gray-400 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Access predictions from verified analysts with proven track records
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                If the Genius underperforms, you get credits back automatically
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Line availability is verified by the miner network before purchase
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Quality Scores are ZK-proven &mdash; no one can fake their record
              </li>
            </ul>
            <Link
              href="/idiot"
              className="btn-secondary inline-flex items-center gap-2 !px-6 !py-3 !text-base"
            >
              Browse Signals
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* The Signal Lifecycle */}
      <section className="w-full max-w-5xl py-16 px-4 border-t border-gray-800">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-white mb-4">
          The signal lifecycle
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
          Every signal follows the same trustless path from prediction to settlement.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              step: "Encrypt",
              desc: "AES-256-GCM encryption with 10 decoy lines",
              icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
            },
            {
              step: "Commit",
              desc: "On-chain commitment with collateral locked",
              icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
            },
            {
              step: "Verify",
              desc: "Miners confirm real-time line availability",
              icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
            },
            {
              step: "Reveal",
              desc: "Shamir key shares released to buyer",
              icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
            },
            {
              step: "Attest",
              desc: "Validators independently verify game outcomes",
              icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
            },
            {
              step: "Consensus",
              desc: "2/3+ validator agreement required",
              icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
            },
            {
              step: "ZK Audit",
              desc: "Quality Score proven in zero knowledge",
              icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
            },
            {
              step: "Settle",
              desc: "USDC distributed based on performance",
              icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            },
          ].map(({ step, desc, icon }) => (
            <div
              key={step}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 hover:border-djinn-800 transition-colors"
            >
              <svg
                className="w-6 h-6 text-djinn-500 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={icon}
                />
              </svg>
              <h4 className="text-sm font-semibold text-white mb-1">{step}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cryptographic guarantees */}
      <section className="w-full max-w-5xl py-16 px-4 border-t border-gray-800">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-white mb-4">
          Cryptographic guarantees
        </h2>
        <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
          Don&apos;t trust. Verify.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-2">
              Signals stay secret forever
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Each prediction is encrypted with AES-256-GCM and committed
              alongside 10 decoy lines. Even after purchase, only the buyer can
              decrypt. The Genius&apos;s strategy is never exposed.
            </p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-2">
              Track records can&apos;t be faked
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Quality Scores are computed inside a Groth16 zero-knowledge
              circuit. The proof is verified on-chain. No one &mdash; not even
              the protocol &mdash; can manipulate a Genius&apos;s record.
            </p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-2">
              Line availability is attested
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Before key release, Bittensor miners verify that the signal&apos;s
              line is actually available at real sportsbooks. Buyers never pay
              for a stale or fake line.
            </p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-2">
              Outcomes are consensus-driven
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Game results are independently attested by multiple validators.
              2/3+ must agree before an outcome is written on-chain. No single
              party can manipulate settlement.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="w-full max-w-5xl py-16 px-4 border-t border-gray-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="text-center">
            <p className="text-3xl sm:text-4xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Active Signals</p>
          </div>
          <div className="text-center">
            <p className="text-3xl sm:text-4xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Signals Purchased</p>
          </div>
          <div className="text-center">
            <p className="text-3xl sm:text-4xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">Verified Geniuses</p>
          </div>
          <div className="text-center">
            <p className="text-3xl sm:text-4xl font-bold text-white">--</p>
            <p className="text-sm text-gray-500 mt-1">USDC Volume</p>
          </div>
        </div>
      </section>

      {/* Leaderboard teaser */}
      <section className="w-full max-w-5xl py-16 px-4 border-t border-gray-800">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">Top Geniuses</h2>
          <Link
            href="/leaderboard"
            className="text-sm text-djinn-400 hover:text-djinn-300 transition-colors flex items-center gap-1"
          >
            View full leaderboard
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        <div className="card">
          <p className="text-center text-gray-500 py-8">
            Leaderboard data will appear once signals are live on-chain.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="w-full max-w-3xl py-20 px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to get started?
        </h2>
        <p className="text-gray-400 mb-8 max-w-lg mx-auto">
          Whether you have the edge or you&apos;re looking for it, Djinn is the
          trustless marketplace where sports intelligence meets cryptographic
          settlement.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/genius"
            className="rounded-xl bg-djinn-600 px-8 py-4 text-lg font-semibold text-white hover:bg-djinn-500 transition-all hover:shadow-lg hover:shadow-djinn-600/25"
          >
            Sell Signals
          </Link>
          <Link
            href="/idiot"
            className="rounded-xl border border-gray-600 px-8 py-4 text-lg font-semibold text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-all"
          >
            Buy Signals
          </Link>
        </div>
      </section>
    </div>
  );
}

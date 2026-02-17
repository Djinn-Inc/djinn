import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Djinn",
};

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto prose prose-slate prose-sm">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-400 mb-8">Last updated: February 14, 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Djinn
        Protocol (&ldquo;Djinn,&rdquo; &ldquo;we,&rdquo; &ldquo;our&rdquo;), including
        the website at djinn.gg, the Djinn web application, and all associated smart
        contracts deployed on the Base blockchain. By using Djinn, you agree to these
        Terms. If you do not agree, do not use the service.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        1. What Djinn Is
      </h2>
      <p>
        Djinn is a decentralized <strong>information marketplace</strong>. Analysts
        (&ldquo;Geniuses&rdquo;) sell encrypted analytical predictions as an information
        service. Buyers (&ldquo;Idiots&rdquo;) purchase access to those predictions. The
        transaction is a service-level agreement: pay for analytical quality, receive
        compensation if quality is poor.
      </p>
      <p>
        Djinn follows the same structure as a consulting engagement, research subscription,
        or investment newsletter.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        2. What Djinn Is Not
      </h2>
      <p>Djinn is <strong>not</strong> a sportsbook, exchange, or gambling platform. Specifically, Djinn does not:</p>
      <ul className="list-disc list-inside space-y-1 text-slate-600">
        <li>Accept, facilitate, intermediate, or process any wager or bet</li>
        <li>Match bettors with one another</li>
        <li>Set, quote, or offer odds on any sporting event</li>
        <li>Take any position on any sporting event</li>
        <li>Know whether any user places a bet based on a purchased signal</li>
      </ul>
      <p>
        These are not policy commitments. They are architectural constraints enforced by
        protocol design. All signal content is encrypted client-side, and the encryption
        key is split across independent validators via Shamir&apos;s Secret Sharing. Djinn
        structurally cannot view signal content. Anyone can verify this from the{" "}
        <a
          href="https://github.com/djinn-inc/djinn"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-900 underline"
        >
          open-source client code
        </a>.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        3. Eligibility
      </h2>
      <p>
        You must be at least 18 years old (or the age of majority in your jurisdiction)
        to use Djinn. You are responsible for ensuring that your use of Djinn complies
        with all laws applicable to you in your jurisdiction.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        4. Accounts and Wallets
      </h2>
      <p>
        You connect to Djinn using a blockchain wallet (e.g. Coinbase Smart Wallet,
        MetaMask, or any WalletConnect-compatible wallet). You are solely responsible for the
        security of your wallet, private keys, and any credentials associated with your
        account. Djinn never has access to your private keys.
      </p>
      <p>
        If you lose access to your wallet, you may lose access to your funds and signal
        history. Djinn cannot recover private keys on your behalf.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        5. USDC and Platform Balances
      </h2>
      <p>
        Idiots deposit USDC into the Djinn smart contracts to maintain a platform
        balance for purchasing signals. Geniuses deposit USDC as collateral backing
        their service-level agreements. All deposits and withdrawals are executed by
        smart contracts on the Base blockchain and are subject to blockchain transaction
        finality.
      </p>
      <p>
        Djinn does not custody user funds. Funds are held in auditable, open-source smart
        contracts on the Base blockchain.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        6. Signals and Service-Level Agreements
      </h2>
      <p>
        When a Genius creates a signal, they set a Max Price (fee percentage) and SLA
        Multiplier (damages rate). When an Idiot purchases a signal, the fee is
        automatically deducted from their platform balance, and the Genius&apos;s
        collateral is locked proportionally.
      </p>
      <p>
        After every 10 signals between a Genius-Idiot pair, a cryptographic audit
        computes a Quality Score. If the Quality Score is negative, the Genius&apos;s
        collateral is slashed: the Idiot receives a USDC refund (up to fees paid) plus
        Djinn Credits for any excess damages. If the Quality Score is positive, the Genius
        retains the fees.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        7. Djinn Credits
      </h2>
      <p>
        Djinn Credits are non-transferable, non-cashable platform credits that function
        as a discount on future signal purchases. Credits do not expire but carry no cash
        value outside the platform. A buyer can never extract more USDC than they
        deposited. Credits are analogous to store credit after a refund.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        8. No Financial or Betting Advice
      </h2>
      <p>
        Nothing on Djinn constitutes financial advice, investment advice, or a
        recommendation to place any wager. Signals are analytical predictions sold as
        information. What you do with purchased information is entirely your decision and
        your responsibility.
      </p>
      <p>
        Past performance of any Genius, as reflected in their Quality Score or track
        record, does not guarantee future results.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        9. Risks
      </h2>
      <p>You acknowledge and accept the following risks:</p>
      <ul className="list-disc list-inside space-y-1 text-slate-600">
        <li>
          <strong>Smart contract risk:</strong> While audited, smart contracts may contain
          vulnerabilities. Funds deposited into smart contracts are subject to this risk.
        </li>
        <li>
          <strong>Blockchain risk:</strong> Transactions on the Base blockchain are
          irreversible. Network congestion, outages, or forks may affect the protocol.
        </li>
        <li>
          <strong>Signal quality risk:</strong> Geniuses may underperform. The SLA
          mechanism provides structured compensation but does not eliminate the risk of
          purchasing poor-quality analysis.
        </li>
        <li>
          <strong>Regulatory risk:</strong> The legal status of information marketplaces,
          cryptocurrency, and related technologies varies by jurisdiction and may change.
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        10. Prohibited Conduct
      </h2>
      <p>You agree not to:</p>
      <ul className="list-disc list-inside space-y-1 text-slate-600">
        <li>Use Djinn for any purpose that violates applicable law</li>
        <li>Attempt to manipulate track records, Quality Scores, or audit outcomes</li>
        <li>Interfere with the operation of the smart contracts, validators, or miners</li>
        <li>Use automated systems to interact with Djinn in a way that degrades service for other users</li>
        <li>Misrepresent your identity or qualifications</li>
      </ul>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        11. Intellectual Property
      </h2>
      <p>
        The Djinn Protocol is open-source software. The Djinn name, logo, and brand
        assets are the property of Djinn Inc. The open-source license governs the code;
        it does not grant rights to the Djinn brand.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        12. Limitation of Liability
      </h2>
      <p>
        To the maximum extent permitted by law, Djinn Inc. and its contributors shall not
        be liable for any indirect, incidental, special, consequential, or punitive
        damages, including loss of funds, arising from your use of the protocol. Djinn is
        provided &ldquo;as is&rdquo; without warranties of any kind.
      </p>
      <p>
        Djinn operates as a decentralized protocol. Once deployed, Djinn Inc. does not
        control the operation of the smart contracts, validators, miners, or any other
        infrastructure component.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        13. Modifications
      </h2>
      <p>
        We may update these Terms from time to time. Material changes will be posted on
        this page with an updated date. Continued use of Djinn after changes constitutes
        acceptance of the revised Terms.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        14. Governing Law
      </h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, United States,
        without regard to conflict of law principles.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">
        15. Contact
      </h2>
      <p>
        For questions about these Terms, reach us at{" "}
        <a href="https://x.com/djinn_gg" target="_blank" rel="noopener noreferrer" className="text-slate-900 underline">
          @djinn_gg on X
        </a>{" "}
        or through our{" "}
        <a href="https://discord.com/channels/799672011265015819/1465362098971345010" target="_blank" rel="noopener noreferrer" className="text-slate-900 underline">
          Discord channel
        </a>.
      </p>

      <div className="mt-12 pt-8 border-t border-slate-200">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
          &larr; Back to Djinn
        </Link>
      </div>
    </div>
  );
}

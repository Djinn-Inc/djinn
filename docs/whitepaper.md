# Djinn Protocol — Whitepaper

### Intelligence × Execution

Buy intelligence you can trust. Sell analysis you can prove.
Signals stay secret forever — even from us.

Bittensor Subnet 103 · Base Chain · USDC

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Solution](#2-the-solution)
3. [The Accountability Layer](#3-the-accountability-layer)
4. [Key Terms](#4-key-terms)
5. [Life of a Signal](#5-life-of-a-signal)
6. [The Audit](#6-the-audit)
7. [Economics](#7-economics)
8. [Network Equilibrium](#8-network-equilibrium)
9. [Architecture](#9-architecture)
10. [Validators and Miners](#10-validators-and-miners)
11. [Security](#11-security)
12. [Dispute Resolution](#12-dispute-resolution)
13. [Legal Positioning](#13-legal-positioning)
14. [Edge Cases](#14-edge-cases)
15. [Web Attestation Service](#15-web-attestation-service)
16. [Beyond Sports](#16-beyond-sports)
17. [Governance](#17-governance)
- [Appendix A: API Reference](#appendix-a-api-reference)
- [Appendix B: Base Contracts](#appendix-b-base-contracts)
- [Appendix C: Cryptographic Details](#appendix-c-cryptographic-details)

---

## 1. The Problem

Skilled sports analysts face a binary choice: bet personally or sell picks.

**Betting limitations:** Sportsbooks restrict winning accounts. Markets have finite liquidity. Large positions move lines adversely. Edge cannot scale.

**Selling picks problems:** Track records lack accountability. Screenshots can be forged. Tweets disappear. Success correlates with marketing ability rather than analytical skill.

The fundamental issue: information and execution are bundled together.

- **Information** = identifying value.
- **Execution** = placing bets.

These represent different capabilities. A brilliant analyst may lack bankroll discipline or sportsbook access. A skilled executor without proprietary edge seeks quality analysis elsewhere.

---

## 2. The Solution

Djinn unbundles information from execution.

Analysts (**Geniuses**) sell predictions. Buyers (**Idiots**) purchase access. What buyers do with information is their business — betting, not betting, or partial hedging. Djinn remains agnostic.

This separation benefits:

- **Geniuses:** Edge scales across thousands of buyers without moving markets
- **Idiots:** Purchasing methodology, not execution risk
- **Platform:** Information services have clearer regulatory standing than gambling

### Two Core Guarantees

1. **Signals stay secret forever.** Not until game time — permanently. No entity, including Djinn, ever views signal content.

2. **Track records are verifiable forever.** Cryptographic proof confirms ROI and performance without revealing individual picks.

---

## 3. The Accountability Layer

Information markets typically lack accountability. Djinn implements four mechanisms:

### Cryptographic Timestamps

Every signal is committed on-chain before the game. It is encrypted so no one can see the content, but the commitment is provably locked in time. After contests conclude, records verify against public outcomes. Commitments are immutable.

### Collateral-Backed Guarantees

Geniuses deposit real money as collateral. After 10 signals with a given buyer, an audit occurs. Underperformance triggers damages paid from collateral — a standard service-level agreement.

### True Blindness

Signal creation involves:
- Client-side encryption
- Encryption key split via Shamir's Secret Sharing across validators
- Decoy lines mask the actual signal
- Only purchasers decrypt locally

### Permanent Secrecy via Zero-Knowledge Proofs

For audits, neither party reveals signals to smart contracts. Instead, a zero-knowledge proof — a mathematical statement that says "I know the preimage of these on-chain commitments, and when I evaluate them against the public game outcomes, the Quality Score is X."

For public records, aggregate proofs work identically: "Across my 347 committed signals... my ROI is 8% and my favorable rate is 54%."

ZK circuits remain lightweight: hash preimage openings, index checks, arithmetic. Proof generation takes seconds on consumer hardware. On-chain verification costs fractions of a cent on Base, constant regardless of signal volume.

---

## 4. Key Terms

| Term | Definition |
|------|-----------|
| **Signal** | Specific prediction (Lakers −3 @ −110), including game, position, line, odds |
| **Genius** | Posts signals, sets pricing, deposits collateral |
| **Idiot** | Purchases signals, selects notional amount |
| **Notional** | Reference amount selected by buyer; determines both fees and potential audit damages |
| **Max Price (MP%)** | Genius's fee as percentage of notional |
| **SLA Multiplier** | Damages rate if methodology underperforms; minimum 100% |
| **Quality Score** | Audit metric; favorable outcomes minus SLA-weighted unfavorable outcomes |
| **Audit** | Settlement after 10 signals between Genius-Idiot pair |
| **Odds** | Decimal format internally; −110 American = 1.91 decimal |
| **Zero-Knowledge Proof** | Cryptographic proof of statement truth without revealing underlying data |
| **TLSNotary Proof** | Cryptographic attestation of TLS-session data received from web server |
| **Attestation** | Cryptographically verifiable record that information existed at specific time |

---

## 5. Life of a Signal

### Creation

Genius Alice identifies value: Lakers −3 @ −110 (1.91 decimal). She accesses Djinn dashboard showing estimated liquidity, current collateral ($50,000), and available exposure capacity.

She enters: NBA, Lakers vs Celtics Feb 15, Lakers −3 @ −110, 10% Max Price, 100% SLA Multiplier, expires 6:00 PM ET. She selects nine decoy lines to accompany her real signal.

MP%, SLA%, and expiry are set per signal. Alice can post her next signal with completely different parameters.

**System checks:**

1. **Executability:** Is this line available at 2+ sportsbooks at stated odds or better? Signal waits if unavailable.
2. **Validator health:** Are 10 validators online and responsive? If validator set is degraded, client warns and waits for healthy quorum.

If checks pass, the browser:
- Encrypts the signal
- Splits encryption key into 10 pieces via Shamir's Secret Sharing (7+ needed for reconstruction)
- Distributes shares to different Bittensor validators
- Commits hash to Base blockchain with 9 decoy lines
- Re-encrypts signal key to Alice's wallet public key
- Posts encrypted blob on-chain for wallet-based recovery

### Decoys

The Genius selects nine decoy lines to accompany the real signal — 10 lines total. Decoy quality is the Genius's responsibility. Sophisticated Geniuses choose plausible decoys at similar odds across the same sport to maximize ambiguity:

| Index | Line | Real? |
|-------|------|-------|
| 1 | Lakers −5 @ +190 | |
| 2 | Celtics +3 @ −110 | |
| 3 | Lakers ML @ −220 | |
| 4 | Over 218.5 @ −110 | |
| 5 | Lakers −3 @ −110 | ✓ |
| 6 | Under 218.5 @ −110 | |
| 7 | Celtics +5 @ −135 | |
| 8 | Heat −2 @ −115 | |
| 9 | Warriors ML @ −180 | |
| 10 | Bucks −4.5 @ −120 | |

Observers see ten lines and a commitment hash. Could be any of them.

### Discovery

Buyer Bob browses Djinn filtered by sport (NBA). He sees:

**Visible to Buyer:**
- Sport
- Genius wallet address
- Track record: ROI, favorable rate, unfavorable rate, void rate, signal count
- Track record by sport
- Purchase success rate
- Proof coverage percentage
- Max Price (10%)
- SLA Multiplier (100%)
- Signal expiry time

**Hidden (encrypted):**
- Game
- Teams
- Position
- Line
- Odds
- Sportsbook availability

Bob is buying methodology, not a specific pick.

Track records display per sport. Alice might show +18% ROI across 47 NBA signals but −15% across 3 NFL signals. Sport-level track records receive individual ZK proofs. Aggregate across-all-sports records available separately.

### Purchase

Bob clicks "Buy" with $1,000 notional and FanDuel as his sportsbook.

Notional is the amount of protection Bob is purchasing — the reference amount for both fees and potential SLA damages. It does not need to match the amount Bob actually wagers (or whether he wagers at all). If Bob buys a signal at $1,000 notional but bets $2,000 at a sportsbook, SLA damages cover only $1,000. Excess exposure is Bob's risk.

Bob has previously deposited USDC into the Escrow contract, giving him a platform balance. This pre-funding enables instant purchases without wallet approval delays.

Behind the scenes:

1. Request goes to validator checking if signal remains executable at FanDuel
2. Validators run MPC: they query miners for available lines at Bob's sportsbook, compute whether real line is available. Output: yes/no. Validators never learn which line is real.
3. If not executable: signal voided for Bob. No charge. Signal available for other buyers.
4. If executable: Escrow contract deducts $100 (10% MP × $1,000 notional) from Bob's balance. Validators release key shares.
5. Bob's browser collects 7+ shares, reconstructs key, decrypts locally. Bob sees: "Lakers −3 @ −110."
6. Browser re-encrypts signal key to Bob's wallet public key, posts on-chain for recovery from any device.

**Time:** 3–5 seconds. Pre-funded escrow eliminates wallet confirmation steps from the purchase flow.

### Two-Phase Miner Verification

**Phase 1 (immediate):** Miner receives 10 candidate lines, queries sportsbook APIs, reports availability back to validators. Gates the purchase. Speed matters.

**Phase 2 (seconds later):** Miner generates TLSNotary proof of the same TLS session from Phase 1. Proof is cryptographically tied to sportsbook's server, cannot be forged without server's private key. Submitted to validators, verified, updates miner's accuracy score, then discarded. Phase 2 doesn't block purchase — completes in seconds. If proof contradicts miner's Phase 1 report, miner faces accuracy degradation and emission reduction.

### Outcome

Game occurs. Lakers win by 5. Position covered: "favorable."

Validators attest final score from official sources, require 2/3+ consensus. Outcome written on-chain.

- If Lakers won by 2: signal not covered, "unfavorable."
- If Lakers won by exactly 3 or game cancelled: "void" (doesn't count toward audit).

---

## 6. The Audit

After 10 signals between Genius and Idiot, an audit occurs.

### Why 10?

Statistical separation between skilled and random pickers:

| N | Random (50% WR) | Skilled (+15% edge) | Gap |
|---|-----------------|-------------------|-----|
| 1 | −0.05 | +0.12 | 0.17 |
| 5 | −0.11 | +0.27 | 0.38 |
| 10 | −0.15 | +0.38 | 0.53 |
| 20 | −0.21 | +0.54 | 0.75 |
| 50 | −0.34 | +0.85 | 1.19 |

At 10 signals, gap of 0.53 is meaningful — roughly the difference between a losing strategy and stock market's long-term risk-adjusted return. Ten signals balance statistical separation against speed of accountability. An active Genius can complete a cycle in a week.

### Variance Is a Feature

Skilled Geniuses don't pass every audit. At −110 odds, 5-5 produces negative Quality Score because SLA penalty on unfavorable signals exceeds favorable credit. A Genius needs 6+ favorable out of 10 to pass. A Genius with genuine 60% win rate passes approximately 63% of the time. Losing audits occur roughly once every three cycles through variance alone.

This is intentional. Short audit windows protect Idiots from extended exposure to a Genius who may have lost edge. Skilled Geniuses recover quickly.

For fakers, math is unforgiving. Random picker at 50% has only 38% chance of passing any single audit. Consecutive passes collapse: 14% for two, 5% for three, under 1% for five. After 10 consecutive audits, faker has 0.006% chance of passing all. A skilled Genius at 60% has about 1% chance: 160 times more likely. Over time, protocol reliably separates real skill from noise.

### Quality Score Calculation

For each signal:

- **Favorable:** +N × (odds − 1)
- **Unfavorable:** −N × SLA%

Where N = notional, odds = decimal odds, SLA% = Genius's SLA Multiplier.

Quality Score = sum across all 10 signals.

### Example

Alice has 100% SLA Multiplier. Bob bought 10 signals at $500 notional each. 6 favorable, 4 unfavorable, average odds 1.91 (−110 American):

- Favorable (6): 6 × $500 × 0.91 = **$2,730**
- Unfavorable (4): 4 × $500 × 1.00 = **−$2,000**
- Quality Score = **+$730**

Positive. Alice's methodology delivered. She keeps fees.

If 4 favorable, 6 unfavorable: Quality Score = −$1,180 (negative).

### Settlement via Zero-Knowledge Proof

When 10th outcome finalizes, client application generates ZK proof of Quality Score. Proof demonstrates correct computation from committed signals and public outcomes, without revealing any signal.

Smart contract verifies proof and settles:

- **Tranche A (USDC):** Bob receives up to 100% of fees paid in actual USDC.
- **Tranche B (Credits):** Excess damages become non-transferable Djinn Credits.

Example: Bob paid $500 in fees (10 × $500 × 10%). Quality Score is −$1,180. He receives:
- Tranche A: $500 USDC (all fees paid)
- Tranche B: $680 Credits

Bob never receives more USDC than paid. Credits offset future purchases but cannot be cashed out. Standard service-level agreement structure.

### Track Record Integrity

A Genius's public track record must cover **every committed signal whose outcome has finalized**, not just signals from completed audit cycles. This prevents cherry-picking.

Client application computes track record proofs automatically. When Genius opens the app:
1. Client checks for newly finalized outcomes on-chain
2. Recomputes aggregate statistics against all committed signals with that wallet
3. Generates ZK proof per sport and overall
4. Submits to ZKVerifier contract on Base

If Genius has 100 committed signals but only proves 40, track record displays "40 of 100 proven" and gap is visible.

Track record staleness is informative. Active Genius with good record updates frequently. Genius who disappeared after bad streak shows "Last verified: [date]" with declining proof coverage.

### Track Record Metrics

- ROI
- Favorable rate
- Unfavorable rate
- Void rate
- Signal count
- Purchase success rate
- Proof coverage

Each metric computed per sport with aggregate available, backed by ZK proof. Scoring rules are fixed at launch, but Genius regenerates proofs each app session, enabling new metrics in future versions without disruption.

### Early Exit

Either party can exit before 10 signals. Settlement uses current Quality Score but pays entirely in Credits. Insufficient sample for USDC movement.

---

## 7. Economics

### Genius Pricing

- **Max Price (MP%):** Fee as percentage of notional.
- **SLA Multiplier:** Damages rate if unfavorable. Minimum 100%. Higher SLA signals confidence.

| Confidence Level | MP% | SLA% | Logic |
|------------------|-----|------|-------|
| Testing waters | 5% | 100% | Low fees, standard damages |
| Confident | 10% | 100% | Standard setup |
| Very confident | 10% | 150% | Higher damages signal confidence |
| Premium | 15% | 200% | High fees, willing to back it up |

### Collateral

Geniuses deposit USDC collateral covering worst-case damages across all active buyer relationships:

> Required collateral = Σ (notional × SLA%) across all active signals and all buyers.

Each buyer consumes collateral independently. If Alice posts a signal and three buyers each purchase at $1,000 notional with 100% SLA, Alice needs $3,000 in collateral for that signal alone. Her total collateral determines how much notional is available for buyers to purchase.

Excess collateral can be withdrawn at any time. If Alice has $50,000 deposited but only $30,000 is locked against active positions, she can withdraw $20,000 immediately.

If collateral drops below the minimum required, open signals auto-cancel. Existing audit cycles continue to settlement.

### Protocol Fee

0.5% of total notional at each audit, paid by Genius, goes to Djinn Protocol. This fee covers all protocol operational costs including Base chain gas fees for signal commitments, audit settlements, track record updates, and ZK verification. Users never pay gas directly. All protocol fees denominated in USDC.

### Djinn Credits

Non-transferable, non-cashable platform credits. Work as discount on future purchases.

Example: Signal costs $100. Bob has $30 credits. He pays $70 USDC + $30 credits.

**Refund structure:**

| USDC In | Credits In | Refund | USDC Out | Credits Out |
|---------|-----------|--------|----------|------------|
| $100 | $0 | $40 | $40 | $0 |
| $70 | $30 | $40 | $40 | $0 |
| $70 | $30 | $90 | $70 | $20 |
| $0 | $100 | $40 | $0 | $40 |

Never extract more USDC than put in.

Credits do not expire. They are non-transferable, non-cashable, and cannot be converted to USDC. They function solely as a discount on future purchases. This structure ensures credits are not profits — they are a service credit analogous to store credit after a refund, carrying no cash value outside the platform.

---

## 8. Network Equilibrium

Djinn operates as Bittensor Subnet 103. Protocol generates real USDC revenue through 0.5% fee on notional volume.

This revenue funds: protocol development, smart contract maintenance, gas fees, ZK circuit updates, security reviews, documentation, and community support. Remainder may purchase subnet's alpha token, creating sustained demand supporting token price.

### Revenue-Backed Token Value

Unlike subnets relying purely on speculative token value, Djinn's alpha token can be backed by actual economic activity through protocol-funded buybacks. This means miners and validators earn emissions in a token whose value is supported by real, recurring revenue, not inflation.

As platform volume grows, buyback pressure increases, supporting higher token value and attracting more network participants.

### The Flywheel

1. Volume generates USDC fees
2. Fees support alpha token through buybacks
3. Higher token price attracts more miners and validators
4. More participants improve service quality: faster executability checks, more reliable outcome attestation, better uptime
5. Better service attracts more Geniuses and Idiots
6. More users generate more volume

### Self-Regulating Economics

Network participation is self-regulating. If token price rises too high relative to revenue, excess miners enter and dilute returns until some exit. If price drops, marginal miners leave, increasing returns for remaining participants until equilibrium restored.

Protocol doesn't directly set miner or validator compensation. Market sets it.

Miner operating costs are modest: odds API subscriptions, TLSNotary proof generation, basic cloud compute. Validator costs similarly contained: outcome verification from public sources and standard server infrastructure. Low fixed costs mean moderate platform volumes support attractive returns.

### Emission Distribution

| Recipient | Share |
|-----------|-------|
| Miners | 41% |
| Validators | 41% |
| Subnet owner (Djinn) | 18% |

All user-facing transactions (escrow, collateral, fees, settlements, refunds) denominated in USDC on Base. Users never need to hold or interact with TAO, subnet alpha token, or any cryptocurrency other than USDC.

---

## 9. Architecture

### A Fully Decentralized Protocol

Once deployed, Djinn the company operates no infrastructure. Protocol runs on publicly verifiable, decentralized systems at every layer.

| Component | Location | Why |
|-----------|----------|-----|
| Static frontend | GitHub Pages | Open source, publicly hosted, verifiable |
| Smart contracts | Base chain | Escrow, collateral, credits, audits, ZK verification |
| Signal commitments | Base chain | Immutable, timestamped, encrypted |
| Track records | Base chain | ZK-verified aggregate statistics |
| Data indexing | The Graph | Open-source subgraph, no Djinn servers |
| Encrypted key shares | Validators (Bittensor) | Shamir shares, distributed trust |
| MPC computation | Validators (Bittensor) | No single point of failure |
| Line verification | Miners (Bittensor) | Competitive, decentralized, TLSNotary-attested |
| Outcome attestation | Validators (Bittensor) | Consensus required |
| ZK proof generation | Client-side | Never leaves user's device |

### Code Verification

All client-side cryptographic operations (encryption, decryption, Shamir splitting, ZK proof generation, wallet interaction) run in user's browser. Frontend is static application served directly from public Git repository via GitHub Pages or equivalent verifiable platform.

Every deploy is a public commit. To change what users see, a commit must be made to repository, visible to entire world. Build process is reproducible: anyone can clone repository, build it, confirm output matches served version.

Djinn never serves code touching user secrets. Client is open source, publicly hosted, verifiable. Backend is the blockchain.

### User Experience

Users interact only with Base chain. Need ETH wallet and USDC. No TAO, no Bittensor wallet, no subnet knowledge, no ZK proof knowledge. Complexity is hidden.

### Wallet-Based Key Recovery

When signal is created or purchased, client re-encrypts signal's decryption key to user's wallet public key and stores encrypted blob on-chain. Encrypted signals and outcomes already on-chain permanently.

If user loses device: log in with wallet (or Privy social login recovering wallet). Client pulls encrypted key blobs from chain, decrypts each with wallet's private key, reconstructs full history. Nothing stored on Djinn's servers. Nothing lost.

Local device storage is performance cache, not dependency. Wallet is backup.

### Wallet Options

Djinn offers social login via Privy. User clicks "Sign in with Google," wallet created automatically. Never see seed phrases. Djinn never sees emails, passwords, or private keys.

For larger amounts, users can export key to MetaMask or use self-custody wallet directly. Private key never leaves wallet: website requests decryption, wallet handles internally, similar to Apple Pay where merchant never sees card number.

### Reading the Chain

Reading blockchain data is free. Client queries public metadata (signal status, sport, timestamps, outcomes) without decrypting. Decryption happens lazily, only when user views specific signal. With 10,000 signals, metadata query takes seconds. Single signal decryption is instant.

Decentralized subgraph on The Graph indexes public on-chain data for fast queries. If indexer unavailable, client falls back to reading chain directly. Anyone can run own indexer from open-source subgraph definition.

---

## 10. Validators and Miners

### Validators

Validators are trust layer. They:
- Hold encrypted key shares
- Coordinate MPC for executability checks
- Release shares after payment
- Attest game outcomes from official sources
- Aggregate outcome reports into consensus
- Score miners for emissions

MPC protocol lets validators jointly compute "Is real signal among available lines?" without any validator learning which line is real. Output is single bit. Requires 7+ of 10 validators.

### Validator Churn

Bittensor validators can rotate in and out. If validator holding Shamir key shares goes offline between signal creation and purchase, those shares unavailable. Protocol handles simply: if fewer than 7 of original 10 validators remain available at purchase time, signal voided and may be resubmitted.

Client mitigates at creation time by checking validator health before distributing shares. If any validator in selected set has degraded connectivity or recent downtime, client selects replacement. Background monitor flags signals whose share-holding validators are degrading, giving Genius chance to void and resubmit before buyer encounters failed purchase.

Vulnerable window typically narrow: minutes to hours between creation and purchase. Catastrophic churn (4+ simultaneous departures) indicates broader network problem beyond scope of any single signal.

### Outcome Attestation

Game outcomes are publicly verifiable facts: final scores from official league sources (NBA API, NFL API, ESPN, etc.). Validators independently query these sources and attest outcomes, requiring 2/3+ consensus before writing results on-chain. If official sources agree — which is the overwhelming majority of cases — validators converge trivially.

When validators disagree (ambiguous outcomes, stat corrections, suspended games), Bittensor's Yuma Consensus mechanism determines the canonical result. Validators whose attestations align with the consensus-weighted majority receive full credit; outliers are penalized. This creates strong incentive to report accurately and wait for authoritative rulings before attesting, rather than racing to attest ambiguous results.

### Miners

Miners are line-checking oracles with cryptographic accountability. Focused role: verify real-time executability of betting lines against sportsbook data, prove they did it honestly.

During signal creation or purchase, miners receive 10 candidate lines (not knowing which is real), query sportsbook data sources checking availability at 2+ sportsbooks, report availability to validators. This is Phase 1: fast check gating purchase.

Miners acquire their own data sources: paid odds APIs (e.g., The Odds API, OddsJam), direct sportsbook integrations, or their own scraping infrastructure. Data acquisition is the miner's responsibility and primary operational cost. Miners without reliable data sources produce inaccurate reports and lose emissions. This mirrors other competitive markets — the cost of participating is the cost of obtaining good data.

Seconds later, miner submits TLSNotary proof of same TLS session (Phase 2). Proof is cryptographically tied to sportsbook's server. Cannot be forged without sportsbook's private key. Verified by validators, updates miner's accuracy score, then discarded. Accuracy score is permanent record. Proof is ephemeral: once score updated, it served purpose.

Because speed accounts for 40% of miner scoring, geographic proximity to sportsbook servers provides a measurable advantage. Miners optimizing for emissions will co-locate near major sportsbook infrastructure, typically in the eastern United States. This is a feature: it ensures the fastest miners serve the regions where most sportsbooks operate, directly improving purchase latency for users.

### Miner Scoring

Miner emissions during active epochs depend on five metrics:

**During Active Epochs (signals being verified):**

| Metric | Weight | Who Competes |
|--------|--------|--------------|
| Speed | 40% | All miners |
| Accuracy | 20% | All miners (scored by TLSNotary ground truth) |
| Uptime | 10% | All miners |
| History | 10% | All miners |
| TLSNotary proof submission | 20% | Proof-submitting miners only |

**Speed** ranks by response latency. Fastest miner for given query scores highest, normalized across all responding miners. Speed dominates because purchase latency is primary user-facing quality metric: 3–5 second purchase window is set by miner response time.

**Accuracy** is binary per query: did miner's Phase 1 report match TLSNotary ground truth? Accumulated as rolling percentage. Weight lower than speed because TLSNotary mechanism already punishes dishonesty directly through proof contradictions; this weight adds emission consequences on top.

**Uptime** is percentage of epochs where miner responded to health checks. Lower weight because overlaps with speed: offline miner cannot be fast either.

**History** is consecutive epochs of participation, scaled logarithmically so early loyalty rewarded more than marginal gains at epoch 1,000. Prevents churn, rewards commitment.

**TLSNotary proof submission** is percentage of queries where miner submitted valid TLSNotary proof. Pool is optional: miners skipping forfeit 20% but face no penalty. Combined with accuracy, honest and verifiable reporting accounts for 40% of emissions.

**During Empty Epochs (no active signals):**

| Metric | Weight |
|--------|--------|
| Uptime | 50% |
| History | 50% |

Empty-epoch emissions keep miners online during low-volume periods, ensure capacity available when demand returns.

These are initial values. As network matures and operational data accumulates, they can be adjusted through protocol governance.

### Continuous Accuracy Verification

Two-phase model transforms accuracy scoring from reactive to continuous. Proof-submitting miners create ground truth benchmark for every executability query. If Miner A reports line as available but Miners B, C, D submit TLSNotary proofs showing it wasn't, Miner A's accuracy score drops automatically. No dispute process needed.

TLSNotary proof pool is optional. Miners skipping forfeit 20% but face no penalty. Other miners' proofs can still expose inaccurate reporting. Game theory drives participation: if few miners submit proofs, per-miner return from 20% pool is high, attracting more submitters until pool equilibrates.

Only rational strategies: report honestly and submit proof (maximum earnings), or report honestly and skip proof (less earnings but no risk). Lying always loses.

---

## 11. Security

**Miner collusion:** Majority of miners could falsely report line availability. Two-phase TLSNotary model means honest miners automatically produce cryptographic evidence contradicting false reports. Colluding miners face accuracy score degradation and emission reduction without formal dispute. Attack requires controlling most miners AND successfully contradicting verifiable cryptographic evidence from every honest miner.

**Validator collusion:** 7 validators could reconstruct encryption key, but face 10 lines without knowing which is real. Acting on guess has 10% success rate. Caught validators lose staked TAO.

**Genius front-running:** Genius already knows their signal. Doesn't harm Idiots. Bad methodology means SLA damages regardless.

**Sybil attacks on track records:** Genius could create fake Idiot wallets, selectively complete favorable audit cycles. Prevented by requiring track record proofs to cover all committed signals whose outcomes finalized. Genius cannot prove 40 of 100 signals without gap being visible. Cherry-picking is publicly detectable.

**Signal leakage:** Signals encrypted client-side, split via Shamir, masked by decoys, settled via ZK proofs. No entity, including Djinn, ever sees signal plaintext. Historical signals remain permanently encrypted on-chain. Track records verified without revealing individual picks.

**Client code tampering:** Frontend served from public Git repository. Every deploy is public commit. Build is reproducible. Security researchers, competitors, automated monitors can continuously verify served code matches public source.

**Browser extension attacks:** A malicious browser extension with broad permissions could theoretically observe decrypted signal content in the DOM. This is an inherent limitation of browser-based cryptography, not specific to Djinn. Mitigations: users handling high-value signals should use a dedicated browser profile with extensions disabled, or use the protocol through a standalone application if one becomes available. The protocol's encryption, Shamir sharing, and ZK layers protect signals from every other attack vector — the browser is the last-mile trust boundary.

**TLSNotary and evolving TLS standards:** TLSNotary relies on the structure of TLS sessions to produce verifiable proofs. As TLS evolves (TLS 1.3 Encrypted Client Hello, post-quantum cipher suites), TLSNotary tooling must evolve alongside it. The protocol monitors TLSNotary compatibility with major sportsbook TLS configurations and will adapt proof mechanisms as the TLS landscape changes. If a specific sportsbook becomes incompatible with TLSNotary, miners cannot produce proofs for that sportsbook, and the accuracy scoring system reflects this naturally.

---

## 12. Dispute Resolution

### Outcome Disputes

Most outcomes are unambiguous: Lakers won by 5, final score public, validators agree. Occasionally outcomes are contested. Game might be suspended in 4th quarter due to weather. Stat correction might change final score after initial reporting. When validators fall below 2/3 consensus on outcome, dispute resolution activates.

Example: game suspended with 2 minutes remaining and 7-point lead. Some validators attest leading team as winner based on league's official ruling. Others mark game as void because it wasn't completed in regulation. Consensus falls below 2/3.

Process:
1. Anyone challenges current outcome by posting stake ($100 USDC minimum)
2. Validators review evidence and vote on correct outcome
3. If challenge succeeds: challenger gets stake back plus reward from slashed incorrect attesters
4. If challenge fails: challenger loses stake to correct attesters

All outcomes have 48-hour finalization window before disputes close, allowing time for official league rulings to settle ambiguous situations.

### Executability Disputes

With universal two-phase TLSNotary verification, most executability disputes resolve automatically through continuous accuracy scoring. If miner's Phase 1 report contradicted by TLSNotary proofs from other miners, inaccuracy reflected in scores without manual intervention.

For cases where no miner submitted TLSNotary proof for specific query, reactive dispute mechanism remains as backstop. Any miner can stake collateral and present TLSNotary proof after the fact. Single honest miner with valid proof can overturn colluding majority. Proofs must fall within time window of original executability query to prevent use of stale data.

---

## 13. Legal Positioning

Djinn is information marketplace. Not sportsbook, exchange, or gambling platform. Distinction is structural, not cosmetic.

### What Djinn Does

Djinn facilitates sale of analytical predictions as information service. Geniuses sell methodology. Idiots purchase access. Transaction is service-level agreement: pay for quality, receive refund if quality poor. Same structure as consulting engagement, research subscription, or investment newsletter.

### What Djinn Does Not Do

Djinn does not accept bets. Does not match bettors. Does not set odds. Does not take position on any sporting event. Does not know whether any user places bet based on signal. Does not facilitate, intermediate, or process any wager.

### Structural Enforcement

These are not policy commitments. Architectural constraints enforced by protocol design:

**Djinn cannot see signals.** All signal content encrypted client-side. Encryption key split across validators via Shamir's Secret Sharing. Djinn's servers never receive, process, or store signal plaintext. Provable from open-source client code.

**Djinn cannot see outcomes at signal level.** Audits settled via ZK proofs. Smart contract verifies Quality Score correctly computed without learning which signals favorable or unfavorable. Djinn sees only aggregate score.

**Djinn runs no infrastructure.** Frontend served from public repository. Indexer runs on decentralized network. Smart contracts execute on Base. Validators and miners operate on Bittensor. Djinn writes code and deploys contracts. Protocol then runs itself.

**Djinn has no mechanism to connect signal to bet.** Even if Djinn wanted to determine whether user bet on signal, couldn't. Doesn't have data. Signal content encrypted. User's sportsbook accounts unknown to Djinn. No data path from "signal purchased" to "bet placed."

### Regulatory Context

Information services regulated differently from gambling. Selling sports analysis legal in every U.S. jurisdiction. Key regulatory question is whether Djinn's collateral and SLA structure constitutes wager. It does not: collateral is performance bond backing service guarantee, standard mechanism in consulting, SaaS, and professional services. Damages for underperformance capped at fees paid (USDC) plus service credits. Idiot cannot profit from Genius's poor performance.

ZK proof layer further strengthens position by ensuring Djinn structurally incapable of operating as gambling intermediary. Difficult to regulate entity as gambling platform when entity provably cannot see predictions being traded on its protocol.

---

## 14. Edge Cases

| Scenario | Resolution |
|----------|-----------|
| Game cancelled? | Signal voided. Does not count toward 10. Fee refunded. |
| Game postponed? | Signal voided. Refunded. Does not count. |
| Push? | Signal voided. |
| Line moved before purchase? | Executability check fails. Signal voided. No fee charged. |
| Line moved after purchase? | Doesn't matter. Outcome based on whether position covered. |
| Signal not available at buyer's sportsbook? | Purchase voided for that buyer only. No charge. Signal available for other buyers at different sportsbooks. |
| Genius runs out of collateral? | Open signals cancelled. Existing audit cycles continue. |
| User loses device? | Wallet-based recovery. All signal keys re-encrypted to user's wallet public key on-chain. Log in from any device to restore full history. |
| Genius goes offline? | Track record goes stale until they open app. Displayed as "Last verified: [date]." No signals lost. |
| Genius abandons mid-cycle? | Unproven signals accumulate on-chain. Track record coverage ratio declines visibly. Future buyers see gap. Reputational damage is deterrent. |
| Validators go offline before purchase? | Client monitors validator health. If fewer than 7 of 10 share-holding validators remain, signal voided and may be resubmitted. Client warns Genius proactively. |

---

## 15. Web Attestation Service

TLSNotary infrastructure that Djinn builds for sports has immediate standalone value. TLSNotary proof attests that specific web server sent specific content at specific time. Decentralized, trustless, permanent record of what website said: cryptographic alternative to screenshots, archives, trust.

### How It Works

User submits URL and fee to Web Attestation contract on Base. Contract emits event. Miners (same miners online for sports executability checks) pick up request, race to fetch URL, generate TLSNotary proof of server's response. Validators verify proof and attest validity on-chain.

Proof hash stored on-chain permanently. Full proof stored on Arweave, decentralized permanent storage network where data paid for once and stored forever. Anyone can later retrieve proof, verify it cryptographically, confirm exactly what given website displayed at given time.

### Economics: Same Model as Sports

Web attestation follows same economic model as sports. Attestation fee flows to protocol as revenue, supporting subnet's alpha token through same buyback mechanism described in Section 8. Miners completing attestation work earn emission credit for it, scored on same metrics as sports queries: speed, accuracy, proof submission.

This is Bittensor-native approach. Emissions pay miners and validators for being online, responsive, accurate. User fees flow into protocol's revenue pool, supporting alpha token, making emissions more valuable, attracting better miners. Same flywheel applies whether miner is checking sportsbook line or attesting web page.

From miner's perspective, web attestation request is indistinguishable from sports executability check. Both involve fetching data from server, generating TLSNotary proof, submitting for validation. Scoring mechanism treats both workloads identically. This means attestation requests naturally fill low-volume sports periods, keeping miners engaged and network responsive without requiring separate incentive structure.

Bittensor's multiple incentive mechanism feature allows subnet to allocate portion of emissions specifically to web attestation work, ensuring miners rewarded proportionally for both sports and attestation tasks without one crowding out other.

### Use Cases

- **Legal evidence.** Prove website published specific content at specific time. Useful for litigation, regulatory compliance, intellectual property disputes.
- **Journalism.** Verify source published statement before it edited or deleted. Cryptographically stronger than screenshots or web archive snapshots.
- **Governance.** Prove DAO proposal, corporate announcement, or policy document publicly available at specific time.
- **Research.** Cite web sources with cryptographic proof of content and timestamp. Reproducible references that cannot be retroactively altered.

### Relationship to Sports

Web attestation doesn't require Geniuses, Idiots, signals, encryption, decoys, or audits. Uses only miner attestation layer: same infrastructure, same skills, same TLSNotary tooling. For miners, sports and web attestation are interchangeable workloads. For network, web attestation generates additional protocol revenue during low-volume sports periods, strengthening alpha token and improving miner retention.

Implementation requires single additional smart contract on Base and second incentive mechanism on subnet. No changes to existing sports protocol.

---

## 16. Beyond Sports

Djinn's core mechanism is not specific to sports. It's market for **accountable remote intelligence**: protocol for someone who knows what to do to sell instructions to someone who can act but doesn't know what to do, with cryptographic proof at every layer.

Primitives are domain-agnostic: enumerated available actions, reported with cryptographic attestation. Encrypted instructions committed before outcomes known. Objectively verifiable results: favorable, unfavorable, or void. SLA-based accountability over repeated interactions. Track records verifiable without revealing underlying instructions.

### What Changes Across Domains

Three things change when protocol extends to new domain:

**Available actions.** In sports, these are betting lines at sportsbooks. In other domains, might be robot commands, trade orders, logistical routes, or any finite set of executable options.

**Attestation method.** In sports, miners use TLSNotary to prove sportsbook data. In other domains, attestation might come from signed sensor data, trusted execution environments, exchange settlement proofs, or any mechanism cryptographically verifying what was available and what happened.

**Outcome verification.** In sports, outcomes are final scores from official sources. In other domains, might be sensor readings, delivery confirmations, trade settlement records, or any objectively measurable result. All outcomes reduced to favorable, unfavorable, or void.

### The Communication Delay Case

Some domains don't merely benefit from unbundling information and execution. They require it. Consider robot on factory floor, drone in remote location, or rover on another planet. When communication delays make real-time remote control impossible, local executors must act on pre-committed instructions from remote intelligence. Executor reports available actions, transmits to remote analyst, receives instructions, acts autonomously.

Interplanetary case makes this vivid. Light takes 3 to 24 minutes each way between Earth and Mars. Cannot remotely control Mars rover in real-time. Must have local execution with remote intelligence. Rover reports available actions. Earth-based analysts select optimal action. Rover executes. Outcome measurable. Unbundling is not design choice. It is physics.

In these environments, accountability layer matters more, not less. Cost of bad instructions scales with executing agent's cost: destroyed rover, not lost bet. Verified track records of which intelligence sources produce good outcomes become critical infrastructure, not convenience.

### Sequencing

Sports is where protocol launches. Market exists today. Outcomes are binary and objective. Action space is finite and publicly queryable. Attestation infrastructure maps perfectly to TLSNotary. Every mechanism described in this paper designed for and tested against sports analytics.

Once protocol is live and mechanism proven, expanding to new domains is natural evolution. Each new domain introduces own outcome verification and attestation mechanisms, running on same core infrastructure: same commitment scheme, same ZK settlement, same accountability layer, same economic flywheel.

Vision is general-purpose marketplace for accountable intelligence. Sports is proof of concept.

---

## 17. Governance

Protocol parameters — miner scoring weights, audit window size, fee percentages, emission allocations — are controlled by the subnet owner (Djinn Inc.). This is standard for Bittensor subnets: the subnet owner registers the subnet, deploys the incentive mechanism, and retains authority to update parameters as operational data dictates.

This is pragmatic, not ideological. Early-stage protocols require rapid iteration. Scoring weights that look correct on paper may need adjustment after observing real miner behavior. Fee structures may need rebalancing as volume scales. Decentralizing parameter control before the protocol has production data risks ossifying bad defaults.

Smart contracts on Base are immutable once deployed. Contract upgrades follow standard proxy patterns with timelock delays, giving users visibility into pending changes before they take effect.

As the protocol matures and operational data stabilizes, governance authority can progressively decentralize — either through on-chain governance mechanisms or delegation to the validator set. The timeline for this transition depends on protocol maturity, not a predetermined schedule.

---

## Appendix A: API Reference

### Validator API

**`POST /v1/signal`** — Genius deposits key share

```
Request:  { signal_id, encrypted_key_share, encrypted_index_share, signature }
Response: { received: true }
```

**`POST /v1/signal/{id}/purchase`** — Idiot purchases signal

```
Request:  { wallet, notional, sportsbook, signature }
Response (success): { executable: true, shares: [...], tx_hash }
Response (failed):  { executable: false, reason: "line_unavailable_at_sportsbook", voided: true }
```

**`POST /v1/analytics/attempt`** — Fire-and-forget to Djinn analytics

```
Body: { signal_id, result: "success" | "failed", validator, timestamp }
```

### Djinn API (via The Graph Subgraph)

**`GET /v1/signals`**

```
Query:    status=active, sport=NBA
Response: [{ id, genius, sport, mp_pct, sla_pct, expires_at,
             genius_roi, genius_favorable_rate, genius_unfavorable_rate,
             genius_void_rate, genius_signal_count, genius_purchase_success_rate,
             genius_proof_coverage }]
```

**`GET /v1/geniuses`**

```
Query:    sort=roi, sport=NBA
Response: [{ address, roi, favorable_rate, unfavorable_rate, void_rate,
             signal_count, proof_coverage, purchase_success_rate,
             active_signals, last_verified }]
```

**`GET /v1/accounts`** (authenticated)

```
Response: [{ genius, lifetime_signals, current_cycle, signals_until_audit }]
```

**`GET /v1/signals/history`** (authenticated)

```
Response: [{ id, genius, purchased_at, notional, outcome, content }]
```

**`GET /v1/credits`** (authenticated)

```
Response: { balance: 250.00 }
```

### Web Attestation API

**`POST /v1/attest`** — Submit attestation request

```
Request:  { url, callback_address, fee_usdc }
Response: { request_id, tx_hash, status: "pending" }
```

**`GET /v1/attest/{request_id}`** — Check attestation status

```
Response: { request_id, url, status, proof_hash, arweave_tx, attested_at, miner }
```

---

## Appendix B: Base Contracts

| Contract | Key Functions |
|----------|---------------|
| **SignalCommitment** | `commit(id, encrypted_blob, decoys[], hash)` |
| **Escrow** | `deposit()`, `purchase(signal_id, notional, sportsbook)`, `withdraw()` |
| **Collateral** | `deposit()`, `withdraw()`, `lock(signal_id)`, `release(signal_id)` |
| **CreditLedger** | `balanceOf(addr)` |
| **Account** | `status(genius, idiot)` → `{ cycle, count, quality_score }` |
| **Audit** | `trigger(genius, idiot)`, `verifyProof(zk_proof)`, `computeSettlement()` |
| **KeyRecovery** | `storeEncryptedKey(signal_id, encrypted_key, wallet)` |
| **ZKVerifier** | `verifyAuditProof(proof, public_inputs)`, `verifyTrackRecord(proof)` |
| **WebAttestation** | `request(url)`, `submitProof(request_id, proof_hash, arweave_tx)` |

### Purchase Flow

1. Idiot browser → Validator: `POST /v1/signal/{id}/purchase` with sportsbook
2. Validator → Miners: "Which lines available at this sportsbook?"
3. Validators: `MPC(real_index ∈ available)` → bool
4. If false: void signal for this buyer, return error
5. If true: `Escrow.purchase(signal_id, notional, sportsbook)`
6. Validators → Idiot browser: key shares
7. Idiot browser: reconstruct → decrypt
8. Idiot browser: re-encrypt key to wallet public key → `KeyRecovery.storeEncryptedKey()`
9. Miners: submit TLSNotary proof → accuracy score updated

### Audit Flow

1. Account reaches 10 signals
2. Client generates ZK proof of Quality Score from committed signals and public outcomes
3. Anyone calls `Audit.trigger(genius, idiot)` with ZK proof
4. `ZKVerifier.verifyAuditProof()` confirms proof against on-chain commitments
5. If negative: Collateral → Escrow (Tranche A) + `CreditLedger.mint` (Tranche B)
6. If positive: Genius keeps fees
7. Protocol fee: 0.5% of notional → Djinn

### Track Record Update

1. Genius opens app. Client decrypts all historical signals locally.
2. Client computes aggregate statistics (ROI, favorable rate, unfavorable rate, void rate) against all committed signals with finalized public outcomes.
3. Client generates ZK proof of aggregate statistics, per sport and overall.
4. Proof submitted on-chain via `ZKVerifier.verifyTrackRecord()`.
5. Public track record updates with aggregate stats and proof coverage ratio. No individual signal revealed.

### Web Attestation Flow

1. User submits URL and fee to `WebAttestation.request()`
2. Contract emits `AttestationRequested` event
3. Miners fetch URL and generate TLSNotary proof
4. First valid proof submitted via `WebAttestation.submitProof()`
5. Contract verifies proof validity, records attestation, stores proof hash on-chain
6. Full proof uploaded to Arweave for permanent retrieval

---

## Appendix C: Cryptographic Details

### Signal Encryption

Signals are encrypted client-side using AES-256-GCM with a randomly generated symmetric key. The key is then split via Shamir's Secret Sharing over a prime field (256-bit prime), producing 10 shares with a reconstruction threshold of 7.

Each share is individually encrypted to its assigned validator's public key before transmission. The original symmetric key is also re-encrypted to the Genius's wallet public key and stored on-chain for wallet-based recovery.

### Multi-Party Computation for Executability

The MPC protocol enables validators to jointly determine whether the real signal is among the lines reported as available by miners — without any validator learning which line is real.

The protocol operates as follows:

1. Each validator holds one Shamir share of the real signal's index (an integer 1–10).
2. Miners report a set of available line indices (e.g., {1, 3, 5, 7, 9}).
3. Validators execute a secure comparison: they jointly compute whether the secret index is a member of the available set, using additive secret sharing over a finite field.
4. The computation requires two communication rounds among the 7+ participating validators.
5. Output is a single bit: available or not. No validator learns the secret index.

The MPC is lightweight because the computation is simple (set membership of a single integer). This is not general-purpose MPC — it is a narrow, optimized protocol for this specific operation, keeping latency within the 3–5 second purchase window.

### Zero-Knowledge Proofs

Audit and track record proofs use a SNARK-based proving system (candidate: Groth16 over BN254 or PLONK, final selection based on proving time benchmarks on consumer hardware).

The ZK circuit for audit settlement performs:
1. Hash preimage opening: prove knowledge of signal content matching on-chain commitment hashes
2. Index verification: prove each signal's real index falls within 1–10
3. Outcome evaluation: compute favorable/unfavorable/void for each signal against public on-chain outcomes
4. Quality Score arithmetic: sum the weighted outcomes per the published formula

Circuit size is O(n) in the number of signals (10 for audits, up to hundreds for track records). Proof generation targets under 10 seconds on consumer hardware. On-chain verification is constant-time regardless of signal count.

Track record proofs follow the same circuit structure but cover all committed signals with finalized outcomes, not just the current audit window.

### TLSNotary

TLSNotary produces a cryptographic proof that a TLS session between a miner and a sportsbook server contained specific data. The proof is bound to the sportsbook's TLS certificate, making it unforgeable without the sportsbook's private key.

The protocol currently targets TLS 1.2 and TLS 1.3 sessions. As TLS standards evolve, proof generation tooling must track compatibility. The two-phase miner model isolates this risk: Phase 1 (fast response) does not depend on proof generation succeeding, so TLSNotary compatibility issues affect miner scoring but never block user purchases.

---

> Djinn unbundles information from execution.
>
> The protocol runs itself.

**Bittensor Subnet 103 · Base Chain · USDC**

[djinn.gg](https://djinn.gg)

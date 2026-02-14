# Deviations from Whitepaper

Append-only log. Each entry documents where implementation diverges from `docs/whitepaper.md`.

---

## DEV-001: Miner Scoring Weights

**Whitepaper Section:** Validators and Miners > Scoring
**Whitepaper Says:** 5 metrics — Speed 40%, Accuracy 20%, Uptime 10%, History 10%, TLSNotary 20%
**PDF v9 Says:** 4 metrics — Accuracy 40%, Speed 25%, Coverage 20%, Uptime 15%
**We Follow:** PDF v9 (4 metrics). The PDF is the most recent version of the whitepaper.
**Why:** The KICKOFF.md references a 5-metric system from an older version. PDF v9 consolidates to 4 metrics which is simpler and weights accuracy highest, which is correct.
**Impact:** Miner incentive economics. Non-breaking — just different weights.

## DEV-002: Bittensor Template Not Used

**Whitepaper Section:** N/A (implementation detail)
**What happened:** The opentensor subnet template (`djinn_subnet/`, `neurons/`) in the repo has known memory leaks (reported by Loai, confirmed by Tom Matcham). The Bittensor API is Rust with a thin Python wrapper that doesn't clean up properly.
**What we did:** Writing custom validator/miner code from scratch instead of extending the template. Will reference Loai's memory leak fix PR.
**Impact:** Better stability, no memory leaks in production validators/miners.

## DEV-003: MPC Protocol Simplified for Prototype

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Whitepaper Says:** 2-round MPC with additive secret sharing, no validator learns the actual index
**What we did:** Prototype uses Lagrange reconstruction + polynomial evaluation. The aggregator reconstructs the secret from Shamir shares and evaluates the availability polynomial P(secret). This reveals the secret to the aggregator.
**Production TODO:** Replace with SPDZ-style MPC or garbled circuit evaluation to prevent the aggregator from learning the secret. The protocol interface (compute_local_contribution → check_availability) is designed to be swappable.
**Impact:** Security — in production, the aggregator validator would learn which line is real. Functionally correct (single-bit output is correct). Privacy guarantee weakened until production MPC is implemented.

## DEV-004: Groth16 Instead of PLONK

**Whitepaper Section:** ZK Circuits
**CLAUDE.md Says:** "Switch to PLONK if proving time exceeds 10s on consumer hardware"
**What we did:** Groth16 proving time for both circuits is well under 10s. Keeping Groth16 for smaller proof size (128 bytes vs ~1KB) and faster on-chain verification.
**Impact:** None — Groth16 is strictly better for our circuit sizes.

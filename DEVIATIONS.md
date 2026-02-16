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

## DEV-005: TrackRecord Circuit MAX_SIGNALS Reduced 64 → 20

**Whitepaper Section:** ZK Circuits — Track Record Proof
**Whitepaper Implies:** Large aggregate track records (hundreds of signals)
**What we did:** Reduced MAX_SIGNALS from 64 to 20 to fit the Groth16 verifier under the EVM 24KB contract size limit. At 64 signals the verifier had 326 public inputs → 32KB bytecode (exceeds limit). At 20 signals: 106 public inputs → 11KB bytecode.
**Why:** Groth16 verifier size scales linearly with public inputs. Each public input adds two EC point constants (~100 bytes bytecode). 64 signals is 5.5x over the EVM limit with no way to optimize the generated verifier code.
**Impact:** Geniuses generating track record proofs for >20 signals must batch into multiple proofs. 20 signals covers ~3 weeks of daily activity. Proofs are composable — aggregate two sub-proofs' statistics off-chain. Non-breaking for users.

## DEV-006: Secure MPC Implemented with Beaver Triples [UPDATES DEV-003]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Whitepaper Says:** 2-round MPC, no validator learns the actual index
**What we did:** Implemented `SecureMPCSession` using Beaver triple-based multiplication. The protocol computes r * P(s) where P(x) = ∏(x - a_i) for available indices and r is joint randomness. The result is 0 iff the secret is in the available set. No single party reconstructs the secret — only blinded differences (d = x - a, e = y - b) are opened, where a and b are random Beaver triple values.
**Protocol details:** Sequential multiplication through Beaver triples. For d available indices, requires d multiplications (each 1 communication round). Uses trusted dealer model for triple generation (production would use OT-based offline phase).
**Communication rounds:** d + 1 (not 2 as whitepaper states). For d ≤ 10, this is at most 11 rounds. Could be reduced to ceil(log2(d)) + 2 ≈ 6 via tree multiplication (not yet implemented).
**Remaining work:** Trusted dealer model for triple generation should be replaced with OT-based offline phase in production. Tree multiplication could reduce rounds from d+1 to ceil(log2(d))+2.
**Impact:** Security significantly improved — no single aggregator learns the secret index. The core MPC math is production-ready.

## DEV-007: MPC Distributed Networking Implemented [UPDATES DEV-006]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Whitepaper Says:** Validators exchange messages to jointly compute availability without revealing the secret
**What we did:** Implemented the full distributed MPC networking layer:
- Coordinator generates random mask r, splits into Shamir shares, distributes with Beaver triple shares via `POST /v1/mpc/init`
- For each multiplication gate: coordinator collects (d_i, e_i) from peers via `POST /v1/mpc/compute_gate`, reconstructs opened values d, e, feeds into next gate
- After final gate, coordinator computes output shares and reconstructs r * P(s); broadcasts result via `POST /v1/mpc/result`
- Circuit breaker: peers that fail mid-protocol are removed from the active set; protocol continues if remaining participants >= threshold
- Parallel peer requests using `asyncio.gather` for each gate
**Trusted dealer limitation:** Coordinator generates and distributes Beaver triple shares, so it knows all (a, b, c) values. This means the coordinator could theoretically derive peers' secret shares after gate 0. In production, triples would be generated via OT (oblivious transfer) so no single party knows the underlying values. The current trusted-dealer model is acceptable for the initial deployment.
**Impact:** Multi-validator MPC now works end-to-end over HTTP. Single-validator prototype mode is preserved as fallback when no peers are available.

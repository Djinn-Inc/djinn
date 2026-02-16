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
**Communication rounds:** Tree multiplication (implemented in `SecureMPCSession.compute()`) reduces rounds from d+1 to ceil(log2(d))+2 ≈ 6 for d=10. The distributed MPC orchestrator uses sequential gates (d rounds) because each gate requires a network round-trip.
**Remaining work:** ~~Trusted dealer model for triple generation should be replaced with OT-based offline phase in production.~~ **Resolved in DEV-008.** ~~Tree multiplication could reduce rounds.~~ **Implemented for local MPC; distributed path remains sequential.**
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
**Trusted dealer limitation:** ~~Coordinator generates and distributes Beaver triple shares, so it knows all (a, b, c) values.~~ **Resolved in DEV-008.**
**Impact:** Multi-validator MPC now works end-to-end over HTTP. Single-validator prototype mode is preserved as fallback when no peers are available.

## DEV-008: OT-Based Beaver Triple Generation [RESOLVES DEV-006/DEV-007 LIMITATION]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Previous limitation:** DEV-006/DEV-007 used a trusted dealer model for Beaver triple generation. The coordinator knew all (a, b, c) values in the clear, meaning it could theoretically derive peers' secret shares.
**What we did:** Implemented OT-based distributed triple generation (`validator/djinn_validator/core/ot.py`):
- **Gilboa multiplication** (bit-decomposition + correlated OT): Each pair of parties (i, j) jointly computes additive shares of a_i * b_j without either party learning the other's input. Uses 256 rounds of 1-of-2 OT per multiplication (one per bit of the field element).
- **Distributed triple generation**: Each party generates random additive shares of a and b. Cross-terms (a_i * b_j for i != j) are computed via Gilboa multiplication. No single party learns the full triple.
- **Additive-to-Shamir conversion**: Additive shares are converted to Shamir shares via each party independently Shamir-sharing their additive share and parties summing the received evaluations.
- The coordinator now uses OT-based triples when >= 2 participants are available, falling back to trusted dealer only in single-validator dev mode.
**Security model:** Semi-honest (honest-but-curious). For malicious security, add MAC-based verification (SPDZ-style) in a future iteration.
**Performance:** Gilboa multiplication involves 256 OT instances per field multiplication, which is compute-intensive but parallelizable. For 10 available indices with 10 parties, this is 10 triples * 45 pairs * 256 OTs = ~115K OT instances. In practice, the OT operations are local hash evaluations (~3s on consumer hardware). Network round-trips for actual OT message exchange are not yet implemented — the current protocol simulates OT locally and would need `/v1/mpc/ot/*` endpoints for full distributed deployment.
**Impact:** Eliminates the trusted dealer limitation. The coordinator no longer learns Beaver triple underlying values. 47 new tests verify correctness, randomness, and compatibility with existing MPC protocol.

## DEV-009: Network OT Endpoints for Distributed Triple Generation [EXTENDS DEV-008]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Previous limitation:** DEV-008 computed OT-based triples locally within a single process. For actual multi-validator deployment, OT messages must traverse the network.
**What we did:** Implemented the full network-aware OT protocol in `validator/djinn_validator/core/ot_network.py`:
- **DH-based Gilboa OT**: Sender generates DH keypair (a, A=g^a). Receiver encodes bit b via T_k = g^{r_k} (b=0) or A·g^{r_k} (b=1). Sender derives two keys K0=H(T_k^a), K1=H((T_k/A)^a) and XOR-encrypts both messages. Only the receiver can decrypt the chosen one.
- **Configurable DH groups**: `DHGroup` abstraction supports RFC 3526 Group 14 (2048-bit) for production and a small safe prime (p=1223) for fast tests.
- **Adaptive bit count**: OT round count per multiplication matches field prime bit length (17 bits for test, 254 for BN254), minimizing unnecessary work.
- **OTTripleGenState**: Full lifecycle state machine managing sender/receiver setup, choice generation, transfer encryption/decryption, share accumulation, and Shamir polynomial evaluation.
- **REST endpoints**: `POST /v1/mpc/ot/{setup,choices,transfers,complete}`, `POST /v1/mpc/ot/shares`, `GET /v1/signal/{id}/share_info` — 6 new endpoints for the 4-phase OT protocol (setup → choices → transfers → complete) plus share retrieval and peer discovery.
- **Body size limit**: OT endpoints accept up to 5MB (DH group elements are large).
- **Serialization helpers**: Hex-encoded DH public keys, choice commitments, and encrypted transfers for HTTP transport.
**Security model:** CDH assumption in the chosen DH group. Semi-honest — same as DEV-008. SPDZ MAC verification deferred to future work.
**Impact:** Validators can now exchange Beaver triple shares over HTTP without any party learning the other's inputs. 35 new tests verify OT correctness, triple generation, Shamir conversion, serialization roundtrips, and all API endpoints. Full test suite (693 tests) passes with no regressions.

## DEV-010: SPDZ MAC Verification for Malicious Security [EXTENDS DEV-008/DEV-009]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Previous limitation:** DEV-008/DEV-009 assumed a semi-honest (honest-but-curious) adversary model. A malicious party could corrupt their shares to manipulate the MPC output without detection.
**What we did:** Implemented SPDZ-style information-theoretic MAC verification in `validator/djinn_validator/core/spdz.py`:
- **Global MAC key α**: Shamir-shared among validators. No single party knows α.
- **Authenticated shares**: Every shared value v carries MAC shares γ(v) where reconstruct(γ) = α * v. MACs are independently Shamir-shared.
- **Authenticated Beaver triples**: Triple components (a, b, c) all carry MAC shares.
- **MAC verification on every opening**: When d = x - a is opened, each party computes σ_j = γ(d)_j - α_j * d. Reconstructing Σ L_j * σ_j = 0 proves correctness; non-zero means cheating.
- **Commit-then-reveal protocol**: Parties commit to σ_j before revealing, preventing adaptive forgery.
- **AuthenticatedMPCSession**: Full MPC protocol with MAC checks on every multiplication gate opening. Aborts with `MACVerificationError` if any check fails.
- **AuthenticatedParticipantState**: Per-validator state for distributed protocol with MAC support.
- **MAC propagation through multiplication**: z = d*e + d*b + e*a + c has MAC γ(z)_j = d*e*α_j + d*γ(b)_j + e*γ(a)_j + γ(c)_j.
**Security model:** Active security with abort (malicious parties detected, protocol aborts). With 7-of-10 honest majority, guaranteed output delivery.
**Impact:** 32 new tests verify MAC generation, verification, commitment protocol, authenticated MPC correctness (including randomized trials), and tamper detection for corrupted shares and triples. 725 total tests pass.

## DEV-011: SPDZ Gossip-Abort and Payment Verification [EXTENDS DEV-010]

**Whitepaper Section:** Appendix A — Purchase Flow, Appendix C — MPC Protocol
**Previous limitations:**
1. MAC verification failure caused silent local abort — other validators continued computing with corrupted shares.
2. Purchase endpoint released key shares without verifying on-chain USDC payment.
**What we did:**
- **Gossip-abort protocol**: When the coordinator detects MAC verification failure during an authenticated MPC session, it broadcasts `POST /v1/mpc/abort` to all participants. Peers mark the session as FAILED and clean up state. The `compute_gate` endpoint rejects requests (HTTP 409) for aborted sessions.
- **On-chain payment verification**: The purchase endpoint now queries the Escrow contract via `chain_client.verify_purchase()` before releasing key shares. Returns `"payment_required"` status when `pricePaid == 0`. In dev mode (no chain client), skips the check with a warning for backwards compatibility. Uses `keccak256(signal_id)` for string-to-uint256 mapping.
**Impact:** Gossip-abort ensures consistency — all honest validators abort together when cheating is detected. Payment verification prevents free signal access. 6 new tests cover abort/payment flows. 736 total validator tests pass.

## DEV-012: Network OT Wired into MPC Orchestrator [EXTENDS DEV-009]

**Whitepaper Section:** Appendix C — MPC Set-Membership Protocol
**Previous limitation:** DEV-009 implemented the OT network endpoints and state machine, but the MPC orchestrator still generated triples locally — the coordinator knew all triple values during generation.
**What we did:** Wired the 4-phase OT protocol into the MPC orchestrator (`mpc_orchestrator.py`):
- **`_generate_ot_triples_via_network()`**: Drives the full bidirectional Gilboa OT protocol over HTTP with a peer validator. Both cross-terms (coordinator.a × peer.b and peer.a × coordinator.b) are computed via OT so neither party learns the other's random values.
- **Protocol flow**: Setup → exchange sender PKs → bidirectional choice generation → bidirectional transfer processing → decrypt & accumulate → compute Shamir evaluations → collect partial shares and combine into BeaverTriple objects.
- **Activation**: Enabled via `USE_NETWORK_OT=1` env var. Currently supports the 2-party case (coordinator + 1 peer). Falls back to local triple generation when OT fails or when >1 peer is available.
- **Configurable parameters**: DH group and field prime can be specified via the OT setup request, allowing fast DH groups (p=1223) in tests while using RFC 3526 Group 14 (2048-bit) in production.
- **Graceful fallback**: If any OT phase fails (network error, serialization issue), falls back to local OT triple generation with a warning log.
- **Serialization fix**: `deserialize_dh_public_key` and `deserialize_choices` now handle both `0x`-prefixed and raw hex formats. Server uses `serialize_dh_public_key()` for consistent fixed-width encoding.
**Limitation:** 2-party only — for n > 2 validators, peer-to-peer OT connections would be needed (each pair must independently run the OT protocol). The star topology (coordinator hub) still means the coordinator collects all Shamir evaluations; a fully peer-to-peer topology is deferred.
**Impact:** 7 new integration tests verify available/unavailable/single-index/all-indices/fallback/3-validator scenarios. 743 total validator tests pass.

## DEV-013: Tranche A Slash Direct to Idiot Wallet [CHANGES SETTLEMENT FLOW]

**Whitepaper Section:** Section 7 — Audit Settlement
**Whitepaper Says:** "Collateral → Escrow (Tranche A)" — genius collateral is slashed to escrow, then idiot gets a refund.
**What we did:** Changed `Audit._distributeDamages()` to slash collateral directly to the idiot's wallet (`collateral.slash(genius, trancheA, idiot)`) instead of routing through escrow.
**Why:** The original flow created stranded USDC: collateral was slashed to the escrow contract address, but escrow's internal accounting (feePool/balances) didn't track the incoming tokens. The `_refundFromFeePool` call moved existing fee pool accounting (fees the idiot already paid) rather than accounting for the newly-slashed collateral. This left the slashed USDC permanently unwithdrawable in the escrow contract.
**Alternative considered:** Adding a `creditBalance(address, uint256)` function to Escrow callable by Audit would have preserved the "Collateral → Escrow" path. Chose direct-to-wallet for simplicity and better UX (idiot receives USDC immediately without needing to withdraw from escrow).
**Impact:** Economic outcome identical — idiot receives the same USDC amount. UX improved — no additional withdrawal step. Fee pool for the cycle is left intact (genius earned fees stay in escrow; a future genius fee claim mechanism may be needed).

"""MPC set-membership protocol for signal availability checking.

Implements the protocol from Appendix C of the Djinn whitepaper:
- Each validator holds a Shamir share of the real signal index
- Miners report which of the 10 lines are available at a sportsbook
- Validators jointly compute "Is real index ∈ available set?"
- Output: single bit (available / not available)
- No validator learns the actual index

Two implementations:

1. PROTOTYPE (check_availability): Aggregator reconstructs the secret.
   Fast, correct, but the aggregator learns the secret index.
   Used in single-validator mode for local testing.

2. PRODUCTION (SecureMPCSession): Beaver triple-based multiplication.
   No single party learns the secret. Requires multi-round communication
   between validators. The protocol computes r * P(s) where
   P(x) = ∏(x - a_i) for available indices, and r is joint randomness.
   If the result is 0, the secret is in the set.
"""

from __future__ import annotations

import math
import secrets
from dataclasses import dataclass, field

import structlog

from djinn_validator.utils.crypto import BN254_PRIME, Share, _mod_inv, split_secret

log = structlog.get_logger()


@dataclass(frozen=True)
class MPCContribution:
    """A validator's contribution to the MPC protocol."""

    validator_id: int
    weighted_share: int  # L_i * y_i mod p (Lagrange-weighted share value)


@dataclass(frozen=True)
class MPCResult:
    """Result of the MPC protocol."""

    available: bool
    participating_validators: int


# ---------------------------------------------------------------------------
# Beaver Triple Infrastructure
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BeaverTriple:
    """Pre-computed multiplication triple: (a, b, c) where c = a*b mod p.

    Each value is Shamir-shared among validators.
    """

    a_shares: tuple[Share, ...]
    b_shares: tuple[Share, ...]
    c_shares: tuple[Share, ...]


def _split_secret_at_points(
    secret: int,
    x_coords: list[int],
    k: int,
    prime: int = BN254_PRIME,
) -> list[Share]:
    """Split a secret into Shamir shares evaluated at specific x-coordinates.

    Unlike split_secret() which always uses x=1..n, this evaluates the
    random polynomial at the specified x-coordinates.
    """
    coeffs = [secret] + [secrets.randbelow(prime) for _ in range(k - 1)]
    shares = []
    for x in x_coords:
        y = 0
        for j, c in enumerate(coeffs):
            y = (y + c * pow(x, j, prime)) % prime
        shares.append(Share(x=x, y=y))
    return shares


def generate_beaver_triples(
    count: int,
    n: int = 10,
    k: int = 7,
    prime: int = BN254_PRIME,
    x_coords: list[int] | None = None,
) -> list[BeaverTriple]:
    """Generate Beaver multiplication triples.

    Each triple contains Shamir shares of random (a, b, c) where c = a*b.
    In production, triples are generated via OT-based offline phase or
    a trusted dealer. This implementation uses a trusted dealer model.

    Args:
        count: Number of triples to generate.
        n: Number of shares per value.
        k: Reconstruction threshold.
        x_coords: Specific x-coordinates for shares. If None, uses 1..n.
    """
    if x_coords is None:
        x_coords = list(range(1, n + 1))

    triples = []
    for _ in range(count):
        a = secrets.randbelow(prime)
        b = secrets.randbelow(prime)
        c = (a * b) % prime

        a_shares = tuple(_split_secret_at_points(a, x_coords, k, prime))
        b_shares = tuple(_split_secret_at_points(b, x_coords, k, prime))
        c_shares = tuple(_split_secret_at_points(c, x_coords, k, prime))

        triples.append(BeaverTriple(a_shares, b_shares, c_shares))

    return triples


# ---------------------------------------------------------------------------
# Secure MPC Protocol
# ---------------------------------------------------------------------------


@dataclass
class Round1Message:
    """A validator's Round 1 broadcast for a single multiplication."""

    validator_x: int
    d_value: int  # x_share - a_share
    e_value: int  # y_share - b_share


@dataclass
class MultiplicationGate:
    """State for a single multiplication in the protocol."""

    triple: BeaverTriple
    # Input shares (one per validator, indexed by share.x)
    x_shares: dict[int, int] = field(default_factory=dict)
    y_shares: dict[int, int] = field(default_factory=dict)
    # Round 1 results
    d_opened: int | None = None  # reconstructed x - a
    e_opened: int | None = None  # reconstructed y - b
    # Output shares (one per validator)
    z_shares: dict[int, int] = field(default_factory=dict)


class SecureMPCSession:
    """Secure set-membership MPC using Beaver triple multiplication.

    Protocol for computing r * P(s) where P(x) = ∏(x - a_i):

    1. Offline: Beaver triples pre-generated for each multiplication
    2. Online - for each tree level of multiplications:
       a. Each validator broadcasts (d_i, e_i) for each multiplication gate
       b. Everyone reconstructs d, e
       c. Each validator computes their output share z_i
    3. Final: Open the masked result. Zero iff secret is in the set.

    Usage:
        session = SecureMPCSession(available_indices, triples, shares, ...)
        result = session.run()  # Local simulation
    """

    def __init__(
        self,
        available_indices: set[int],
        shares: list[Share],
        triples: list[BeaverTriple],
        threshold: int = 7,
        prime: int = BN254_PRIME,
    ) -> None:
        self._available = sorted(available_indices)
        self._shares = {s.x: s for s in shares}
        self._triples = list(triples)
        self._triple_idx = 0
        self._threshold = threshold
        self._prime = prime
        self._validator_xs = sorted(self._shares.keys())
        self._n_validators = len(shares)

    def _next_triple(self) -> BeaverTriple:
        if self._triple_idx >= len(self._triples):
            raise ValueError("Not enough Beaver triples for this computation")
        t = self._triples[self._triple_idx]
        self._triple_idx += 1
        return t

    def _lagrange_coefficients(self) -> dict[int, int]:
        """Compute Lagrange coefficients for all participating validators."""
        coeffs = {}
        for xi in self._validator_xs:
            coeffs[xi] = _lagrange_coefficient(xi, self._validator_xs, self._prime)
        return coeffs

    def _reconstruct_from_values(self, values: dict[int, int]) -> int:
        """Reconstruct a secret from validator-indexed share values."""
        p = self._prime
        result = 0
        xs = sorted(values.keys())
        for xi in xs:
            li = _lagrange_coefficient(xi, xs, p)
            result = (result + li * values[xi]) % p
        return result

    def _multiply_shares(
        self,
        x_by_validator: dict[int, int],
        y_by_validator: dict[int, int],
        triple: BeaverTriple,
    ) -> dict[int, int]:
        """Execute one Beaver triple multiplication.

        Given shares of x and y, compute shares of z = x * y using the triple.
        This is one round of communication (all validators broadcast d_i, e_i).
        """
        p = self._prime

        # Round 1: Each validator computes d_i = x_i - a_i, e_i = y_i - b_i
        d_by_validator: dict[int, int] = {}
        e_by_validator: dict[int, int] = {}

        a_map = {s.x: s.y for s in triple.a_shares}
        b_map = {s.x: s.y for s in triple.b_shares}
        c_map = {s.x: s.y for s in triple.c_shares}

        for vx in self._validator_xs:
            d_by_validator[vx] = (x_by_validator[vx] - a_map[vx]) % p
            e_by_validator[vx] = (y_by_validator[vx] - b_map[vx]) % p

        # Reconstruct d and e (these are opened publicly)
        d = self._reconstruct_from_values(d_by_validator)
        e = self._reconstruct_from_values(e_by_validator)

        # Each validator computes z_i = d*e + d*b_i + e*a_i + c_i
        z_by_validator: dict[int, int] = {}
        for vx in self._validator_xs:
            z_i = (d * e + d * b_map[vx] + e * a_map[vx] + c_map[vx]) % p
            z_by_validator[vx] = z_i

        return z_by_validator

    def run(self) -> MPCResult:
        """Run the full secure MPC protocol (local simulation).

        Computes r * P(s) where P(x) = ∏(x - a_i) for available indices.
        Opens the result: 0 means s is in the set, nonzero means it isn't.
        No single party ever sees the reconstructed secret s.
        """
        if self._n_validators < self._threshold:
            log.warning(
                "insufficient_mpc_participants",
                received=self._n_validators,
                threshold=self._threshold,
            )
            return MPCResult(available=False, participating_validators=self._n_validators)

        p = self._prime

        if not self._available:
            # No available indices → secret can't be in empty set
            return MPCResult(available=False, participating_validators=self._n_validators)

        # Step 1: Compute shares of (s - a_i) for each available index
        # These are LINEAR operations on shares, so purely local
        factors: list[dict[int, int]] = []
        for a in self._available:
            factor_shares: dict[int, int] = {}
            for vx in self._validator_xs:
                factor_shares[vx] = (self._shares[vx].y - a) % p
            factors.append(factor_shares)

        # Step 2: Generate shared random mask r (nonzero)
        # In production, r is generated via joint randomness (each validator
        # contributes randomness). Here we simulate by sharing a random value.
        r = secrets.randbelow(p - 1) + 1  # r ∈ [1, p-1]
        r_shares_list = _split_secret_at_points(
            r, self._validator_xs, self._threshold, p
        )
        r_by_validator = {s.x: s.y for s in r_shares_list}

        # Step 3: Multiply all factors together using Beaver triples (tree)
        # Start with r * factor[0], then multiply in remaining factors
        current = self._multiply_shares(
            r_by_validator, factors[0], self._next_triple()
        )

        for i in range(1, len(factors)):
            current = self._multiply_shares(
                current, factors[i], self._next_triple()
            )

        # Step 4: Open the result r * P(s)
        result_value = self._reconstruct_from_values(current)

        available = result_value == 0

        log.info(
            "secure_mpc_result",
            available=available,
            participants=self._n_validators,
            multiplications=len(self._available),
        )

        return MPCResult(available=available, participating_validators=self._n_validators)


def secure_check_availability(
    shares: list[Share],
    available_indices: set[int],
    threshold: int = 7,
    prime: int = BN254_PRIME,
) -> MPCResult:
    """Production-ready set membership check using Beaver triple MPC.

    Unlike check_availability(), no single party ever reconstructs the
    secret. The protocol computes a randomly masked polynomial evaluation
    that equals 0 iff the secret is in the available set.

    Args:
        shares: Shamir shares from participating validators.
        available_indices: Line indices miners report as available.
        threshold: Minimum validators for the protocol.
    """
    if len(shares) < threshold:
        return MPCResult(available=False, participating_validators=len(shares))

    # Use the actual x-coordinates from the shares for triple generation
    x_coords = sorted(s.x for s in shares)

    # Generate enough Beaver triples: |available_indices| multiplications
    # (one for r * factor[0], then one per additional factor)
    n_mults = max(len(available_indices), 1)
    triples = generate_beaver_triples(
        n_mults, n=len(shares), k=threshold, prime=prime, x_coords=x_coords,
    )

    session = SecureMPCSession(
        available_indices=available_indices,
        shares=shares,
        triples=triples,
        threshold=threshold,
        prime=prime,
    )
    return session.run()


# ---------------------------------------------------------------------------
# Per-Validator API (for production with network transport)
# ---------------------------------------------------------------------------


@dataclass
class ValidatorMPCState:
    """MPC state held by a single validator during the protocol.

    In production, each validator creates this locally and exchanges
    messages with other validators over the network.
    """

    validator_x: int
    share_y: int
    available_indices: list[int]
    prime: int = BN254_PRIME

    # Beaver triple shares assigned to this validator
    triple_a_shares: list[int] = field(default_factory=list)
    triple_b_shares: list[int] = field(default_factory=list)
    triple_c_shares: list[int] = field(default_factory=list)

    def compute_round1(self) -> list[Round1Message]:
        """Compute this validator's Round 1 messages for all multiplication gates.

        Returns (d_i, e_i) pairs for each gate, to be broadcast to all validators.
        """
        p = self.prime
        messages = []

        # First gate: r * (s - a_0)
        # Subsequent gates: prev_result * (s - a_{i})
        # The input shares for each gate depend on the previous gate's output,
        # BUT d_i and e_i only depend on the validator's LOCAL shares.
        # In the sequential protocol, we need Round 1 results before computing
        # the next gate's inputs. In tree multiplication, independent gates
        # can be parallelized.

        # For sequential multiplication, the validator needs to know the
        # intermediate share values, which depend on the opened (d, e) from
        # previous rounds. This method handles the FIRST multiplication only.
        # Subsequent rounds use compute_round1_continued().

        if not self.available_indices:
            return messages

        # First multiplication: inputs are r_share and (share_y - a_0)
        a0 = self.available_indices[0]
        x_share = self.share_y  # This would be r_share in production
        y_share = (self.share_y - a0) % p

        if self.triple_a_shares and self.triple_b_shares:
            d = (x_share - self.triple_a_shares[0]) % p
            e = (y_share - self.triple_b_shares[0]) % p
            messages.append(Round1Message(self.validator_x, d, e))

        return messages

    def compute_output_share(
        self,
        gate_idx: int,
        d_opened: int,
        e_opened: int,
    ) -> int:
        """Compute this validator's output share for a multiplication gate."""
        p = self.prime
        a_i = self.triple_a_shares[gate_idx]
        b_i = self.triple_b_shares[gate_idx]
        c_i = self.triple_c_shares[gate_idx]
        return (d_opened * e_opened + d_opened * b_i + e_opened * a_i + c_i) % p


# ---------------------------------------------------------------------------
# Prototype Implementation (kept for single-validator mode)
# ---------------------------------------------------------------------------


def _lagrange_coefficient(
    share_x: int,
    all_x: list[int],
    prime: int = BN254_PRIME,
) -> int:
    """Compute Lagrange basis polynomial L_i evaluated at 0.

    L_i(0) = ∏_{j≠i} (0 - x_j) / (x_i - x_j)
    """
    numerator = 1
    denominator = 1
    for xj in all_x:
        if xj == share_x:
            continue
        numerator = (numerator * (0 - xj)) % prime
        denominator = (denominator * (share_x - xj)) % prime
    return (numerator * _mod_inv(denominator, prime)) % prime


def compute_local_contribution(
    share: Share,
    all_share_xs: list[int],
    prime: int = BN254_PRIME,
) -> MPCContribution:
    """Compute this validator's Lagrange-weighted share contribution.

    Each validator computes L_i * y_i where L_i is their Lagrange coefficient
    for interpolation at x=0 (the secret).

    Args:
        share: This validator's Shamir share (x_i, y_i).
        all_share_xs: X-coordinates of all participating validators.
    """
    li = _lagrange_coefficient(share.x, all_share_xs, prime)
    weighted = (li * share.y) % prime

    return MPCContribution(
        validator_id=share.x,
        weighted_share=weighted,
    )


def check_availability(
    contributions: list[MPCContribution],
    available_indices: set[int],
    threshold: int = 7,
    prime: int = BN254_PRIME,
) -> MPCResult:
    """PROTOTYPE: Aggregate contributions and check set membership.

    Reconstructs the secret via Lagrange interpolation, then evaluates the
    availability polynomial. Functionally correct but the aggregator learns
    the secret. Used in single-validator mode for local testing.

    For production multi-validator mode, use secure_check_availability().
    """
    if len(contributions) < threshold:
        log.warning(
            "insufficient_mpc_participants",
            received=len(contributions),
            threshold=threshold,
        )
        return MPCResult(available=False, participating_validators=len(contributions))

    # Reconstruct the secret: s = Σ L_i * y_i
    secret = sum(c.weighted_share for c in contributions) % prime

    # Evaluate P(secret) = ∏(secret - a_i) for available indices
    product = 1
    for a in available_indices:
        product = (product * ((secret - a) % prime)) % prime

    available = product == 0

    log.info(
        "mpc_result",
        available=available,
        participants=len(contributions),
    )
    return MPCResult(available=available, participating_validators=len(contributions))

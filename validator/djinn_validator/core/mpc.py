"""MPC set-membership protocol for signal availability checking.

Implements the protocol from Appendix C of the Djinn whitepaper:
- Each validator holds a Shamir share of the real signal index
- Miners report which of the 10 lines are available at a sportsbook
- Validators jointly compute "Is real index ∈ available set?"
- Output: single bit (available / not available)
- No validator learns the actual index

PROTOTYPE IMPLEMENTATION:
This version uses Lagrange reconstruction + polynomial evaluation.
The aggregator reconstructs the secret and evaluates P(secret).
This is functionally correct but the aggregator learns the secret.

PRODUCTION TODO: Replace with a proper 2-round MPC protocol:
- Round 1: Validators commit to blinded polynomial evaluations
- Round 2: Joint verification via coin-tossing + verifiable computation
- The aggregator should only learn the single-bit output, never the secret
- Options: SPDZ-style MPC, garbled circuits, or custom Shamir-based protocol
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

import structlog

from djinn_validator.utils.crypto import BN254_PRIME, Share, _mod_inv

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
    """Aggregate contributions and check if the secret is in the available set.

    Reconstructs the secret via Lagrange interpolation, then evaluates the
    availability polynomial P(x) = ∏(x - a_i) at the secret.
    P(secret) == 0 iff secret ∈ available_indices.

    The single-bit output (available/not) doesn't reveal WHICH index matched.

    NOTE: In this prototype, the aggregator learns the secret value.
    Production should use a proper MPC to evaluate P(secret) without
    reconstructing the secret. See module docstring.

    Args:
        contributions: Lagrange-weighted shares from participating validators.
        available_indices: Set of indices miners report as available.
        threshold: Minimum validators required.
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

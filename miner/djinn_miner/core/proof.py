"""TLSNotary proof generation — STUB implementation.

In production, this module generates a TLSNotary proof of the TLS session
used during Phase 1 line checking. The proof is cryptographically tied to
the sportsbook's server certificate and proves the miner actually queried
the sportsbook (not just fabricated results).

This stub returns a deterministic mock proof for development and testing.
"""

from __future__ import annotations

import hashlib
import time

import structlog

from djinn_miner.api.models import ProofResponse

log = structlog.get_logger()


class ProofGenerator:
    """Stub TLSNotary proof generator.

    Generates mock proofs that follow the expected interface. In production,
    this would use the tlsn library to create actual TLSNotary proofs.
    """

    def __init__(self) -> None:
        self._generated_count = 0

    async def generate(self, query_id: str, session_data: str) -> ProofResponse:
        """Generate a mock TLSNotary proof for the given query.

        In production, this would:
        1. Replay or reference the TLS session from Phase 1
        2. Generate a TLSNotary proof binding the session to the server cert
        3. Return the proof hash for validator verification

        Currently returns a deterministic mock proof hash.
        """
        proof_input = f"{query_id}:{session_data}:{time.time()}"
        proof_hash = hashlib.sha256(proof_input.encode()).hexdigest()

        self._generated_count += 1

        log.info(
            "mock_proof_generated",
            query_id=query_id,
            proof_hash=proof_hash[:16],
            total_generated=self._generated_count,
        )

        return ProofResponse(
            query_id=query_id,
            proof_hash=proof_hash,
            status="submitted",
            message="stub: mock TLSNotary proof generated",
        )

    @property
    def generated_count(self) -> int:
        return self._generated_count

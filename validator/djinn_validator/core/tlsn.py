"""TLSNotary proof verification via Rust CLI wrapper.

Calls the `djinn-tlsn-verifier` binary to verify a TLSNotary presentation
and extract the disclosed HTTP response data. Validators use this to confirm
that a miner's odds data came from an authentic TLS session.

When the binary is not available, falls back to HTTP attestation verification
(re-querying the same endpoint within a time window).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
from dataclasses import dataclass

import structlog

log = structlog.get_logger()

VERIFIER_BINARY = os.getenv(
    "TLSN_VERIFIER_BINARY",
    shutil.which("djinn-tlsn-verifier") or "djinn-tlsn-verifier",
)

# Trusted notary public keys (hex-encoded secp256k1). If empty, any key is
# accepted (dev mode). In production, configure via TLSN_TRUSTED_NOTARY_KEYS.
TRUSTED_NOTARY_KEYS: set[str] = set(
    filter(None, os.getenv("TLSN_TRUSTED_NOTARY_KEYS", "").split(","))
)


@dataclass
class TLSNVerifyResult:
    """Result of TLSNotary proof verification."""

    verified: bool
    server_name: str = ""
    connection_time: str = ""
    response_body: str = ""
    notary_key: str = ""
    error: str = ""


def is_available() -> bool:
    """Check if the TLSNotary verifier binary is available."""
    binary = shutil.which(VERIFIER_BINARY)
    if binary:
        return True
    return os.path.isfile(VERIFIER_BINARY) and os.access(VERIFIER_BINARY, os.X_OK)


async def verify_proof(
    presentation_bytes: bytes,
    *,
    expected_server: str | None = None,
    timeout: float = 30.0,
) -> TLSNVerifyResult:
    """Verify a TLSNotary presentation and extract disclosed data.

    Args:
        presentation_bytes: Serialized Presentation from the miner.
        expected_server: If set, verify the server name matches.
        timeout: Max seconds to wait for verification.

    Returns:
        TLSNVerifyResult with the verified response body on success.
    """
    # Write presentation to a temp file
    with tempfile.NamedTemporaryFile(
        suffix=".bin", prefix="djinn-verify-", delete=False
    ) as f:
        f.write(presentation_bytes)
        presentation_path = f.name

    cmd = [VERIFIER_BINARY, "--presentation", presentation_path]

    # If we have trusted notary keys, pass the first one for now.
    # In production, try each trusted key until one matches.
    if TRUSTED_NOTARY_KEYS:
        cmd.extend(["--notary-pubkey", next(iter(TRUSTED_NOTARY_KEYS))])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        _cleanup(presentation_path)
        return TLSNVerifyResult(
            verified=False, error=f"verification timed out after {timeout}s"
        )
    except FileNotFoundError:
        _cleanup(presentation_path)
        return TLSNVerifyResult(
            verified=False,
            error=f"TLSNotary verifier binary not found: {VERIFIER_BINARY}",
        )
    finally:
        _cleanup(presentation_path)

    if proc.returncode != 0:
        error_msg = stderr.decode().strip() if stderr else "unknown error"
        # Try to parse stdout for structured error
        try:
            result = json.loads(stdout.decode().strip())
            error_msg = result.get("error", error_msg)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            log.debug("tlsn_error_output_parse_failed", error=str(e))
        return TLSNVerifyResult(verified=False, error=error_msg[:500])

    # Parse verification output
    try:
        result = json.loads(stdout.decode().strip())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return TLSNVerifyResult(
            verified=False, error="failed to parse verifier output"
        )

    if result.get("status") != "verified":
        return TLSNVerifyResult(
            verified=False, error=result.get("error", "verification failed")
        )

    server_name = result.get("server_name", "")

    # Check expected server if provided
    if expected_server and expected_server not in server_name:
        return TLSNVerifyResult(
            verified=False,
            server_name=server_name,
            error=f"server mismatch: expected {expected_server}, got {server_name}",
        )

    return TLSNVerifyResult(
        verified=True,
        server_name=server_name,
        connection_time=result.get("connection_time", ""),
        response_body=result.get("response_body", ""),
        notary_key=result.get("notary_key", ""),
    )


def _cleanup(path: str) -> None:
    """Remove temp file, ignoring errors."""
    try:
        os.unlink(path)
    except OSError:
        pass

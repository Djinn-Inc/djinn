#!/bin/bash
# Trusted setup for Djinn Protocol ZK circuits
# Uses Groth16 over BN254 with Powers of Tau ceremony
set -euo pipefail

CIRCUITS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUITS_DIR/build"
SNARKJS="npx snarkjs"

cd "$CIRCUITS_DIR"

echo "=== Djinn Protocol ZK Trusted Setup ==="
echo ""

# Step 1: Powers of Tau (download precomputed from Hermez ceremony)
PTAU_FILE="$BUILD_DIR/powersOfTau28_hez_final_16.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "--- Downloading Powers of Tau (Hermez ceremony, 2^16) ---"
    curl -L -o "$PTAU_FILE" "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"
    echo "Powers of Tau downloaded."
else
    echo "Powers of Tau file found, skipping download."
fi

echo ""

# Step 2: Circuit-specific setup for audit_proof
echo "--- Phase 2: Audit Proof circuit setup ---"
if [ ! -f "$BUILD_DIR/audit_proof.r1cs" ]; then
    echo "ERROR: audit_proof.r1cs not found. Run circom compilation first."
    exit 1
fi

$SNARKJS groth16 setup "$BUILD_DIR/audit_proof.r1cs" "$PTAU_FILE" "$BUILD_DIR/audit_proof_0000.zkey"
$SNARKJS zkey contribute "$BUILD_DIR/audit_proof_0000.zkey" "$BUILD_DIR/audit_proof.zkey" \
    --name="Djinn Audit Proof" -v -e="audit-proof-entropy-$(date +%s)"
$SNARKJS zkey export verificationkey "$BUILD_DIR/audit_proof.zkey" "$BUILD_DIR/audit_proof_vkey.json"
rm -f "$BUILD_DIR/audit_proof_0000.zkey"
echo "Audit proof setup complete."

echo ""

# Step 3: Circuit-specific setup for track_record
echo "--- Phase 2: Track Record circuit setup ---"
if [ ! -f "$BUILD_DIR/track_record.r1cs" ]; then
    echo "ERROR: track_record.r1cs not found. Run circom compilation first."
    exit 1
fi

$SNARKJS groth16 setup "$BUILD_DIR/track_record.r1cs" "$PTAU_FILE" "$BUILD_DIR/track_record_0000.zkey"
$SNARKJS zkey contribute "$BUILD_DIR/track_record_0000.zkey" "$BUILD_DIR/track_record.zkey" \
    --name="Djinn Track Record" -v -e="track-record-entropy-$(date +%s)"
$SNARKJS zkey export verificationkey "$BUILD_DIR/track_record.zkey" "$BUILD_DIR/track_record_vkey.json"
rm -f "$BUILD_DIR/track_record_0000.zkey"
echo "Track record setup complete."

echo ""

# Step 4: Export Solidity verifier contracts
echo "--- Exporting Solidity verifiers ---"
$SNARKJS zkey export solidityverifier "$BUILD_DIR/audit_proof.zkey" "$CIRCUITS_DIR/../contracts/src/Groth16AuditVerifier.sol"
$SNARKJS zkey export solidityverifier "$BUILD_DIR/track_record.zkey" "$CIRCUITS_DIR/../contracts/src/Groth16TrackRecordVerifier.sol"
echo "Solidity verifiers exported to contracts/src/"

echo ""
echo "=== Setup complete ==="
echo "  audit_proof.zkey:        $(du -h "$BUILD_DIR/audit_proof.zkey" | cut -f1)"
echo "  track_record.zkey:       $(du -h "$BUILD_DIR/track_record.zkey" | cut -f1)"
echo "  audit_proof_vkey.json:   $BUILD_DIR/audit_proof_vkey.json"
echo "  track_record_vkey.json:  $BUILD_DIR/track_record_vkey.json"

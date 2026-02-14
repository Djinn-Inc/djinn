// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZKVerifier
/// @notice Placeholder verifier contract for the Djinn Protocol. In Phase 2, this will
///         delegate to real Groth16 verifier contracts generated from circom circuits.
///         For now, all verification functions return true to unblock contract integration.
/// @dev Once ZK circuits are built, the owner sets the actual verifier contract addresses
///      and the verify functions delegate to them.
contract ZKVerifier is Ownable {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Address of the actual audit proof verifier contract (set in Phase 2)
    address public auditVerifier;

    /// @notice Address of the actual track record proof verifier contract (set in Phase 2)
    address public trackRecordVerifier;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when the audit verifier contract is set
    event AuditVerifierUpdated(address indexed verifier);

    /// @notice Emitted when the track record verifier contract is set
    event TrackRecordVerifierUpdated(address indexed verifier);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _owner Address that will own this contract and set verifier addresses
    constructor(address _owner) Ownable(_owner) {}

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Set the actual audit proof verifier contract address.
    ///         Called once ZK circuits are built and the Groth16 verifier is deployed.
    /// @param _verifier Address of the deployed Groth16 audit verifier
    function setAuditVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        auditVerifier = _verifier;
        emit AuditVerifierUpdated(_verifier);
    }

    /// @notice Set the actual track record proof verifier contract address.
    ///         Called once ZK circuits are built and the Groth16 verifier is deployed.
    /// @param _verifier Address of the deployed Groth16 track record verifier
    function setTrackRecordVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        trackRecordVerifier = _verifier;
        emit TrackRecordVerifierUpdated(_verifier);
    }

    // -------------------------------------------------------------------------
    // Verification functions
    // -------------------------------------------------------------------------

    /// @notice Verify a ZK proof of audit settlement (Quality Score computation).
    ///         In Phase 2, this will delegate to the actual Groth16 verifier.
    ///         Currently returns true as a placeholder.
    /// @param proof The serialized proof bytes
    /// @param publicInputs The public inputs to the ZK circuit
    /// @return valid True if the proof is valid (always true in placeholder mode)
    function verifyAuditProof(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool valid) {
        if (auditVerifier != address(0)) {
            // Phase 2: delegate to real verifier
            // The actual verifier contract will implement the same interface
            (bool success, bytes memory result) = auditVerifier.staticcall(
                abi.encodeWithSignature("verifyProof(bytes,uint256[])", proof, publicInputs)
            );
            if (success && result.length >= 32) {
                return abi.decode(result, (bool));
            }
            return false;
        }

        // Placeholder: always returns true
        return true;
    }

    /// @notice Verify a ZK proof of track record statistics (ROI, win rate, etc.).
    ///         In Phase 2, this will delegate to the actual Groth16 verifier.
    ///         Currently returns true as a placeholder.
    /// @param proof The serialized proof bytes
    /// @param publicInputs The public inputs to the ZK circuit
    /// @return valid True if the proof is valid (always true in placeholder mode)
    function verifyTrackRecordProof(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool valid) {
        if (trackRecordVerifier != address(0)) {
            // Phase 2: delegate to real verifier
            (bool success, bytes memory result) = trackRecordVerifier.staticcall(
                abi.encodeWithSignature("verifyProof(bytes,uint256[])", proof, publicInputs)
            );
            if (success && result.length >= 32) {
                return abi.decode(result, (bool));
            }
            return false;
        }

        // Placeholder: always returns true
        return true;
    }
}

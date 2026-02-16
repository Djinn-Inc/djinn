// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal interface for the ZKVerifier contract
interface IZKVerifierForTrackRecord {
    function verifyTrackRecordProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[106] calldata _pubSignals
    ) external view returns (bool);
}

/// @notice On-chain record of a verified track record proof
struct VerifiedRecord {
    address genius;
    uint256 signalCount;
    uint256 totalGain;
    uint256 totalLoss;
    uint256 favCount;
    uint256 unfavCount;
    uint256 voidCount;
    bytes32 proofHash;
    uint256 submittedAt;
    uint256 blockNumber;
}

/// @title TrackRecord
/// @notice Stores on-chain verified ZK track record proofs submitted by Geniuses.
///         Each proof demonstrates aggregate performance statistics (wins, losses,
///         gains) without revealing individual signal details.
contract TrackRecord is Ownable {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice ZKVerifier contract used for proof verification
    IZKVerifierForTrackRecord public zkVerifier;

    /// @notice All verified records, indexed by recordId
    mapping(uint256 => VerifiedRecord) public records;

    /// @notice Total number of submitted records
    uint256 public recordCount;

    /// @notice Record IDs per genius address
    mapping(address => uint256[]) public geniusRecordIds;

    /// @notice Tracks proof hashes to prevent duplicate submissions
    mapping(bytes32 => bool) public usedProofHashes;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a track record proof is verified and stored
    event TrackRecordSubmitted(
        uint256 indexed recordId,
        address indexed genius,
        uint256 signalCount,
        uint256 totalGain,
        uint256 totalLoss,
        uint256 favCount,
        uint256 unfavCount,
        uint256 voidCount,
        bytes32 proofHash
    );

    event ZKVerifierUpdated(address indexed verifier);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error VerifierNotSet();
    error ProofVerificationFailed();
    error DuplicateProof();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _owner Address that will own this contract
    constructor(address _owner) Ownable(_owner) {}

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Set the ZKVerifier contract address
    /// @param _zkVerifier Address of the deployed ZKVerifier
    function setZKVerifier(address _zkVerifier) external onlyOwner {
        if (_zkVerifier == address(0)) revert ZeroAddress();
        zkVerifier = IZKVerifierForTrackRecord(_zkVerifier);
        emit ZKVerifierUpdated(_zkVerifier);
    }

    // -------------------------------------------------------------------------
    // Core
    // -------------------------------------------------------------------------

    /// @notice Submit a verified track record proof on-chain
    /// @dev Public signals layout (106 elements):
    ///      [0..19]   commitHash   — Poseidon hashes of (preimage, index) for each signal
    ///      [20..39]  outcome      — 1=Favorable, 2=Unfavorable, 3=Void
    ///      [40..59]  notional     — Bet amounts
    ///      [60..79]  odds         — 6-decimal fixed point (1.91 = 1,910,000)
    ///      [80..99]  slaBps       — SLA basis points
    ///      [100]     signalCount  — Number of active signals (1..20)
    ///      [101]     totalGain    — Sum of favorable gains
    ///      [102]     totalLoss    — Sum of unfavorable losses
    ///      [103]     favCount     — Count of favorable outcomes
    ///      [104]     unfavCount   — Count of unfavorable outcomes
    ///      [105]     voidCount    — Count of void outcomes
    /// @param _pA Groth16 proof element A
    /// @param _pB Groth16 proof element B
    /// @param _pC Groth16 proof element C
    /// @param _pubSignals Public signals array (106 elements)
    /// @return recordId The ID of the newly created record
    function submit(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[106] calldata _pubSignals
    ) external returns (uint256 recordId) {
        if (address(zkVerifier) == address(0)) revert VerifierNotSet();

        // Compute proof hash for deduplication
        bytes32 proofHash = keccak256(abi.encodePacked(_pA, _pB, _pC, _pubSignals));
        if (usedProofHashes[proofHash]) revert DuplicateProof();

        // Verify the Groth16 proof on-chain
        if (!zkVerifier.verifyTrackRecordProof(_pA, _pB, _pC, _pubSignals)) {
            revert ProofVerificationFailed();
        }

        // Store the record — read public signals directly to avoid stack depth
        recordId = recordCount++;
        VerifiedRecord storage rec = records[recordId];
        rec.genius = msg.sender;
        rec.signalCount = _pubSignals[100];
        rec.totalGain = _pubSignals[101];
        rec.totalLoss = _pubSignals[102];
        rec.favCount = _pubSignals[103];
        rec.unfavCount = _pubSignals[104];
        rec.voidCount = _pubSignals[105];
        rec.proofHash = proofHash;
        rec.submittedAt = block.timestamp;
        rec.blockNumber = block.number;

        usedProofHashes[proofHash] = true;
        geniusRecordIds[msg.sender].push(recordId);

        emit TrackRecordSubmitted(
            recordId,
            msg.sender,
            rec.signalCount,
            rec.totalGain,
            rec.totalLoss,
            rec.favCount,
            rec.unfavCount,
            rec.voidCount,
            proofHash
        );
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Get the number of verified records for a genius
    /// @param genius Address of the genius
    /// @return count Number of verified records
    function getRecordCount(address genius) external view returns (uint256 count) {
        return geniusRecordIds[genius].length;
    }

    /// @notice Get all record IDs for a genius
    /// @param genius Address of the genius
    /// @return ids Array of record IDs
    function getRecordIds(address genius) external view returns (uint256[] memory ids) {
        return geniusRecordIds[genius];
    }

    /// @notice Get a specific verified record
    /// @param recordId The record ID
    /// @return record The verified record data
    function getRecord(uint256 recordId) external view returns (VerifiedRecord memory record) {
        return records[recordId];
    }
}

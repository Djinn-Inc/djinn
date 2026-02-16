// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Signal, SignalStatus} from "./interfaces/IDjinn.sol";

/// @title SignalCommitment
/// @notice Stores encrypted signal commitments for the Djinn Protocol.
///         A Genius commits an encrypted signal with 10 decoy lines (9 decoys + 1 real).
///         The real signal content remains hidden inside the AES-256-GCM encrypted blob.
/// @dev Signal IDs are externally generated and must be globally unique.
contract SignalCommitment is Ownable {
    // ─── Types ──────────────────────────────────────────────────────────

    /// @notice Parameters for committing a new signal, packed to avoid stack-too-deep
    struct CommitParams {
        uint256 signalId;
        bytes encryptedBlob;
        bytes32 commitHash;
        string sport;
        uint256 maxPriceBps;
        uint256 slaMultiplierBps;
        uint256 expiresAt;
        string[] decoyLines;
        string[] availableSportsbooks;
    }

    // ─── Storage ────────────────────────────────────────────────────────

    /// @dev signalId => Signal struct
    mapping(uint256 => Signal) private _signals;

    /// @dev signalId => whether it exists
    mapping(uint256 => bool) private _exists;

    /// @dev address => whether it can call updateStatus
    mapping(address => bool) public authorizedCallers;

    // ─── Events ─────────────────────────────────────────────────────────

    /// @notice Emitted when a Genius commits a new signal
    event SignalCommitted(
        uint256 indexed signalId,
        address indexed genius,
        string sport,
        uint256 maxPriceBps,
        uint256 slaMultiplierBps,
        uint256 expiresAt
    );

    /// @notice Emitted when a Genius voids their own signal
    event SignalVoided(uint256 indexed signalId, address indexed genius);

    /// @notice Emitted when an authorized contract updates signal status
    event SignalStatusUpdated(uint256 indexed signalId, SignalStatus newStatus);

    /// @notice Emitted when an authorized caller is added or removed
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    // ─── Errors ─────────────────────────────────────────────────────────

    /// @notice Signal ID already exists
    error SignalAlreadyExists(uint256 signalId);

    /// @notice Signal ID does not exist
    error SignalNotFound(uint256 signalId);

    /// @notice decoyLines must contain exactly 10 entries
    error InvalidDecoyLinesLength(uint256 provided);

    /// @notice slaMultiplierBps must be >= 10000 (100%)
    error SlaMultiplierTooLow(uint256 provided);

    /// @notice maxPriceBps must be > 0 and <= 5000 (50%)
    error InvalidMaxPriceBps(uint256 provided);

    /// @notice expiresAt must be in the future
    error ExpirationInPast(uint256 expiresAt, uint256 currentTime);

    /// @notice Only the Genius who committed the signal can call this
    error NotSignalGenius(address caller, address genius);

    /// @notice Signal has already been purchased and cannot be voided
    error SignalAlreadyPurchased(uint256 signalId);

    /// @notice Caller is not authorized to update signal status
    error CallerNotAuthorized(address caller);

    /// @notice Invalid state transition
    error InvalidStatusTransition(uint256 signalId, SignalStatus current, SignalStatus requested);

    /// @notice Encrypted blob must not be empty
    error EmptyEncryptedBlob();

    /// @notice Commit hash must not be zero
    error ZeroCommitHash();

    // ─── Modifiers ──────────────────────────────────────────────────────

    /// @dev Reverts if the caller is not an authorized contract
    modifier onlyAuthorized() {
        _checkAuthorized();
        _;
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _checkAuthorized() internal view {
        if (!authorizedCallers[msg.sender]) {
            revert CallerNotAuthorized(msg.sender);
        }
    }

    // ─── Constructor ────────────────────────────────────────────────────

    /// @notice Deploys the SignalCommitment contract
    /// @param initialOwner Address that will own this contract and manage authorized callers
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─── External Functions ─────────────────────────────────────────────

    /// @notice Commit a new encrypted signal on-chain
    /// @dev The encrypted blob contains the real signal encrypted with AES-256-GCM.
    ///      The 10 decoy lines obscure which line is the real signal.
    ///      Uses a struct parameter to avoid stack-too-deep with 9 inputs.
    /// @param p CommitParams struct containing all signal data
    function commit(CommitParams calldata p) external {
        if (_exists[p.signalId]) revert SignalAlreadyExists(p.signalId);
        if (p.encryptedBlob.length == 0) revert EmptyEncryptedBlob();
        if (p.commitHash == bytes32(0)) revert ZeroCommitHash();
        if (p.decoyLines.length != 10) revert InvalidDecoyLinesLength(p.decoyLines.length);
        if (p.slaMultiplierBps < 10_000) revert SlaMultiplierTooLow(p.slaMultiplierBps);
        if (p.maxPriceBps == 0 || p.maxPriceBps > 5_000) revert InvalidMaxPriceBps(p.maxPriceBps);
        if (p.expiresAt <= block.timestamp) revert ExpirationInPast(p.expiresAt, block.timestamp);

        _exists[p.signalId] = true;

        Signal storage s = _signals[p.signalId];
        s.genius = msg.sender;
        s.encryptedBlob = p.encryptedBlob;
        s.commitHash = p.commitHash;
        s.sport = p.sport;
        s.maxPriceBps = p.maxPriceBps;
        s.slaMultiplierBps = p.slaMultiplierBps;
        s.expiresAt = p.expiresAt;
        s.status = SignalStatus.Active;
        s.createdAt = block.timestamp;

        uint256 len = p.decoyLines.length;
        for (uint256 i; i < len; ++i) {
            s.decoyLines.push(p.decoyLines[i]);
        }

        len = p.availableSportsbooks.length;
        for (uint256 i; i < len; ++i) {
            s.availableSportsbooks.push(p.availableSportsbooks[i]);
        }

        emit SignalCommitted(
            p.signalId, msg.sender, p.sport, p.maxPriceBps, p.slaMultiplierBps, p.expiresAt
        );
    }

    /// @notice Void a signal that has not yet been purchased
    /// @dev Only the Genius who created the signal can void it.
    ///      Voiding is irreversible and only allowed while status is Active.
    /// @param signalId The signal to void
    function voidSignal(uint256 signalId) external {
        if (!_exists[signalId]) revert SignalNotFound(signalId);

        Signal storage s = _signals[signalId];
        if (s.genius != msg.sender) revert NotSignalGenius(msg.sender, s.genius);
        if (s.status != SignalStatus.Active) revert SignalAlreadyPurchased(signalId);

        s.status = SignalStatus.Voided;

        emit SignalVoided(signalId, msg.sender);
    }

    /// @notice Update the status of a signal
    /// @dev Only callable by contracts authorized by the owner (e.g. Escrow, Audit).
    ///      Enforces a state transition matrix:
    ///        Active   → Purchased, Voided
    ///        Purchased → Settled, Voided
    ///        Settled  → (terminal, no transitions)
    ///        Voided   → (terminal, no transitions)
    /// @param signalId The signal to update
    /// @param newStatus The new status to set
    function updateStatus(uint256 signalId, SignalStatus newStatus) external onlyAuthorized {
        if (!_exists[signalId]) revert SignalNotFound(signalId);

        SignalStatus current = _signals[signalId].status;

        if (current == SignalStatus.Active) {
            if (newStatus != SignalStatus.Purchased && newStatus != SignalStatus.Voided) {
                revert InvalidStatusTransition(signalId, current, newStatus);
            }
        } else if (current == SignalStatus.Purchased) {
            if (newStatus != SignalStatus.Settled && newStatus != SignalStatus.Voided) {
                revert InvalidStatusTransition(signalId, current, newStatus);
            }
        } else {
            // Settled and Voided are terminal states
            revert InvalidStatusTransition(signalId, current, newStatus);
        }

        _signals[signalId].status = newStatus;

        emit SignalStatusUpdated(signalId, newStatus);
    }

    /// @notice Authorize or deauthorize a contract to call updateStatus
    /// @dev Only the contract owner can manage authorized callers.
    /// @param caller The address to authorize or deauthorize
    /// @param authorized Whether the address should be authorized
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;

        emit AuthorizedCallerSet(caller, authorized);
    }

    // ─── View Functions ─────────────────────────────────────────────────

    /// @notice Retrieve the full Signal struct for a given signal ID
    /// @param signalId The signal to look up
    /// @return The complete Signal struct
    function getSignal(uint256 signalId) external view returns (Signal memory) {
        if (!_exists[signalId]) revert SignalNotFound(signalId);
        return _signals[signalId];
    }

    /// @notice Retrieve the Genius address that committed a signal
    /// @param signalId The signal to look up
    /// @return The address of the Genius who committed the signal
    function getSignalGenius(uint256 signalId) external view returns (address) {
        if (!_exists[signalId]) revert SignalNotFound(signalId);
        return _signals[signalId].genius;
    }

    /// @notice Check whether a signal is currently active (not expired, not voided/settled)
    /// @param signalId The signal to check
    /// @return True if the signal exists, has Active status, and has not expired
    function isActive(uint256 signalId) external view returns (bool) {
        if (!_exists[signalId]) return false;

        Signal storage s = _signals[signalId];
        return s.status == SignalStatus.Active && block.timestamp < s.expiresAt;
    }

    /// @notice Check whether a signal ID has been used
    /// @param signalId The signal ID to check
    /// @return True if a signal with this ID has been committed
    function signalExists(uint256 signalId) external view returns (bool) {
        return _exists[signalId];
    }
}

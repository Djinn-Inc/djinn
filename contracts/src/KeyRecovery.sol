// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title KeyRecovery
/// @notice Stores encrypted key recovery blobs associated with wallet addresses.
///         Users encrypt their signal decryption keys to their wallet public key and
///         store the blob on-chain. This enables key recovery from any device: the user
///         logs in with their wallet, pulls the blob, and decrypts locally.
/// @dev No access control beyond msg.sender — only the wallet owner can store their blob,
///      and anyone can read any blob (it is encrypted, so reading reveals nothing).
contract KeyRecovery {
    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev wallet address => encrypted recovery blob
    mapping(address => bytes) private _recoveryBlobs;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a user stores or overwrites their recovery blob
    event RecoveryBlobStored(address indexed user, uint256 timestamp);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Recovery blob must not be empty
    error EmptyBlob();

    /// @notice Recovery blob exceeds maximum allowed size
    error BlobTooLarge(uint256 size, uint256 maxSize);

    /// @notice Maximum blob size (4 KB — plenty for encrypted AES keys)
    uint256 public constant MAX_BLOB_SIZE = 4096;

    // -------------------------------------------------------------------------
    // External Functions
    // -------------------------------------------------------------------------

    /// @notice Store or overwrite the encrypted key recovery blob for msg.sender.
    ///         The blob should contain the user's signal encryption keys encrypted
    ///         to their wallet public key.
    /// @param blob The encrypted recovery blob
    function storeRecoveryBlob(bytes calldata blob) external {
        if (blob.length == 0) revert EmptyBlob();
        if (blob.length > MAX_BLOB_SIZE) revert BlobTooLarge(blob.length, MAX_BLOB_SIZE);

        _recoveryBlobs[msg.sender] = blob;

        emit RecoveryBlobStored(msg.sender, block.timestamp);
    }

    /// @notice Retrieve the stored recovery blob for a given user address.
    ///         The blob is encrypted, so reading it reveals nothing without
    ///         the user's wallet private key.
    /// @param user The wallet address to look up
    /// @return The encrypted recovery blob (empty bytes if none stored)
    function getRecoveryBlob(address user) external view returns (bytes memory) {
        return _recoveryBlobs[user];
    }
}

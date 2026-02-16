// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Collateral
/// @notice Holds Genius USDC collateral to cover worst-case damages on active signals.
/// Required collateral = sum of (notional * slaMultiplierBps / 10000) for all active signal purchases.
/// If a Genius's collateral drops below the locked minimum, open signals can be auto-cancelled.
contract Collateral is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice USDC token (6 decimals)
    IERC20 public immutable usdc;

    /// @notice Total deposited collateral per Genius
    mapping(address genius => uint256) public deposits;

    /// @notice Total locked collateral across all active signals per Genius
    mapping(address genius => uint256) public locked;

    /// @notice Locked collateral per signal per Genius
    mapping(address genius => mapping(uint256 signalId => uint256)) public signalLocks;

    /// @notice Authorized callers (Escrow, Audit contracts)
    mapping(address caller => bool) public authorized;

    /// @dev Emitted when a Genius deposits collateral
    event Deposited(address indexed genius, uint256 amount);

    /// @dev Emitted when a Genius withdraws excess collateral
    event Withdrawn(address indexed genius, uint256 amount);

    /// @dev Emitted when collateral is locked for a signal purchase
    event Locked(uint256 indexed signalId, address indexed genius, uint256 amount);

    /// @dev Emitted when collateral is released after settlement or voiding
    event Released(uint256 indexed signalId, address indexed genius, uint256 amount);

    /// @dev Emitted when collateral is slashed due to negative Quality Score
    event Slashed(address indexed genius, uint256 amount, address indexed recipient);

    /// @dev Emitted when an authorized caller is added or removed
    event AuthorizedUpdated(address indexed caller, bool status);

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientFreeCollateral(uint256 available, uint256 required);
    error InsufficientSignalLock(uint256 locked, uint256 requested);
    error WithdrawalExceedsAvailable(uint256 available, uint256 requested);

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert Unauthorized();
        _;
    }

    /// @param _usdc Address of the USDC token contract
    /// @param _owner Address that will own this contract and manage authorized callers
    constructor(address _usdc, address _owner) Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    /// @notice Add or remove an authorized caller (Escrow or Audit contract)
    /// @param caller The address to authorize or deauthorize
    /// @param status True to authorize, false to revoke
    function setAuthorized(address caller, bool status) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorized[caller] = status;
        emit AuthorizedUpdated(caller, status);
    }

    /// @notice Deposit USDC collateral. Caller must have approved this contract.
    /// @param amount Amount of USDC to deposit (6 decimals)
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw excess collateral not currently locked
    /// @param amount Amount of USDC to withdraw (6 decimals)
    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 dep = deposits[msg.sender];
        uint256 lock = locked[msg.sender];
        uint256 available = dep > lock ? dep - lock : 0;
        if (amount > available) {
            revert WithdrawalExceedsAvailable(available, amount);
        }
        deposits[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Lock collateral for a signal purchase. Called by Escrow.
    /// @dev The lock amount should equal notional * slaMultiplierBps / 10000
    /// @param signalId The signal being purchased
    /// @param genius The Genius whose collateral is being locked
    /// @param amount Amount of USDC to lock (6 decimals)
    function lock(uint256 signalId, address genius, uint256 amount) external onlyAuthorized {
        if (amount == 0) revert ZeroAmount();
        uint256 available = deposits[genius] - locked[genius];
        if (amount > available) {
            revert InsufficientFreeCollateral(available, amount);
        }
        locked[genius] += amount;
        signalLocks[genius][signalId] += amount;
        emit Locked(signalId, genius, amount);
    }

    /// @notice Release locked collateral after settlement or voiding. Called by Escrow/Audit.
    /// @param signalId The signal whose lock is being released
    /// @param genius The Genius whose collateral is being released
    /// @param amount Amount of USDC to release (6 decimals)
    function release(uint256 signalId, address genius, uint256 amount) external onlyAuthorized {
        if (amount == 0) revert ZeroAmount();
        uint256 signalLock = signalLocks[genius][signalId];
        if (amount > signalLock) {
            revert InsufficientSignalLock(signalLock, amount);
        }
        signalLocks[genius][signalId] -= amount;
        // After slash(), locked may have been capped below the sum of individual signalLocks.
        // Prevent underflow by capping the decrease.
        if (amount > locked[genius]) {
            locked[genius] = 0;
        } else {
            locked[genius] -= amount;
        }
        emit Released(signalId, genius, amount);
    }

    /// @notice Slash a Genius's collateral and transfer to a recipient. Called by Audit
    ///         when Quality Score is negative during settlement.
    /// @param genius The Genius being slashed
    /// @param amount Amount of USDC to slash (6 decimals)
    /// @param recipient Address to receive the slashed USDC (the Idiot, via Escrow/Audit)
    function slash(address genius, uint256 amount, address recipient) external onlyAuthorized nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 available = deposits[genius];
        uint256 slashAmount = amount > available ? available : amount;
        deposits[genius] -= slashAmount;
        if (locked[genius] > deposits[genius]) {
            locked[genius] = deposits[genius];
        }
        usdc.safeTransfer(recipient, slashAmount);
        emit Slashed(genius, slashAmount, recipient);
    }

    /// @notice Get total deposited collateral for a Genius
    /// @param genius The Genius address
    /// @return Total deposited amount in USDC (6 decimals)
    function getDeposit(address genius) external view returns (uint256) {
        return deposits[genius];
    }

    /// @notice Get total locked collateral for a Genius
    /// @param genius The Genius address
    /// @return Total locked amount in USDC (6 decimals)
    function getLocked(address genius) external view returns (uint256) {
        return locked[genius];
    }

    /// @notice Get available (free) collateral for a Genius
    /// @param genius The Genius address
    /// @return Available collateral (deposit - locked) in USDC (6 decimals)
    function getAvailable(address genius) external view returns (uint256) {
        uint256 dep = deposits[genius];
        uint256 loc = locked[genius];
        return dep > loc ? dep - loc : 0;
    }

    /// @notice Get collateral locked for a specific signal
    /// @param genius The Genius address
    /// @param signalId The signal ID
    /// @return Amount locked for this signal in USDC (6 decimals)
    function getSignalLock(address genius, uint256 signalId) external view returns (uint256) {
        return signalLocks[genius][signalId];
    }

    // -------------------------------------------------------------------------
    // Emergency pause
    // -------------------------------------------------------------------------

    /// @notice Pause deposits and withdrawals
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause deposits and withdrawals
    function unpause() external onlyOwner {
        _unpause();
    }
}

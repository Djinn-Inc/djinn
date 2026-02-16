// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Outcome, Purchase, Signal, SignalStatus} from "./interfaces/IDjinn.sol";

/// @notice Minimal interface for the SignalCommitment contract
interface ISignalCommitment {
    function getSignal(uint256 signalId) external view returns (Signal memory);
    function updateStatus(uint256 signalId, SignalStatus status) external;
}

/// @notice Minimal interface for the Collateral contract
interface ICollateral {
    function lock(uint256 signalId, address genius, uint256 amount) external;
}

/// @notice Minimal interface for the CreditLedger contract
interface ICreditLedger {
    function balanceOf(address account) external view returns (uint256);
    function burn(address account, uint256 amount) external;
}

/// @notice Minimal interface for the Account contract
interface IAccount {
    function recordPurchase(address genius, address idiot, uint256 purchaseId) external;
    function getCurrentCycle(address genius, address idiot) external view returns (uint256);
}

/// @title Escrow
/// @notice Holds Idiot USDC deposits and processes signal purchases in the Djinn Protocol.
///         Buyers deposit USDC ahead of time for instant purchases. Fees are split between
///         escrowed USDC and Djinn Credits (credits used first). A fee pool tracks collections
///         per genius-idiot-cycle for audit-time refunds.
contract Escrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice USDC token (6 decimals)
    IERC20 public immutable usdc;

    /// @notice Protocol contract references
    ISignalCommitment public signalCommitment;
    ICollateral public collateral;
    ICreditLedger public creditLedger;
    IAccount public account;

    /// @notice Address authorised to call refund() (the Audit contract)
    address public auditContract;

    /// @notice Addresses authorised to call setOutcome() (e.g. Account contract or oracle)
    mapping(address => bool) public authorizedCallers;

    /// @notice Auto-incrementing purchase counter (next ID to assign)
    uint256 public nextPurchaseId;

    /// @notice Per-user escrowed USDC balance
    mapping(address => uint256) public balances;

    /// @notice Purchase records keyed by purchaseId
    mapping(uint256 => Purchase) internal _purchases;

    /// @notice Mapping from signalId to the list of purchaseIds for that signal
    mapping(uint256 => uint256[]) internal _purchasesBySignal;

    /// @notice Fee pool: genius -> idiot -> cycle -> total USDC fees collected
    mapping(address => mapping(address => mapping(uint256 => uint256))) public feePool;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when an Idiot deposits USDC into escrow
    event Deposited(address indexed user, uint256 amount);

    /// @notice Emitted when an Idiot withdraws USDC from escrow
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when a signal is purchased
    event SignalPurchased(
        uint256 indexed signalId,
        address indexed buyer,
        uint256 purchaseId,
        uint256 notional,
        uint256 feePaid,
        uint256 creditUsed,
        uint256 usdcPaid
    );

    /// @notice Emitted when the Audit contract triggers a refund to an Idiot
    event Refunded(address indexed genius, address indexed idiot, uint256 cycle, uint256 amount);

    /// @notice Emitted when a purchase outcome is updated
    event OutcomeUpdated(uint256 indexed purchaseId, Outcome outcome);

    /// @notice Emitted when a protocol contract address is updated
    event ContractAddressUpdated(string name, address addr);

    /// @notice Emitted when an authorized caller is set
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error SignalNotActive(uint256 signalId);
    error SignalExpired(uint256 signalId);
    error InsufficientCollateral(uint256 signalId);
    error ContractNotSet(string name);
    error Unauthorized();
    error ZeroAddress();
    error NotionalTooLarge(uint256 provided, uint256 max);

    /// @notice Maximum notional per purchase (1 billion USDC in 6 decimals)
    uint256 public constant MAX_NOTIONAL = 1e15;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Reverts if the Audit contract address has not been configured
    modifier onlyAudit() {
        if (msg.sender != auditContract) revert Unauthorized();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _usdc Address of the USDC token on Base
    /// @param _owner Initial owner of the contract
    constructor(address _usdc, address _owner) Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    // -------------------------------------------------------------------------
    // Admin — set protocol contract addresses
    // -------------------------------------------------------------------------

    /// @notice Set the SignalCommitment contract address
    /// @param _addr SignalCommitment contract address
    function setSignalCommitment(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        signalCommitment = ISignalCommitment(_addr);
        emit ContractAddressUpdated("SignalCommitment", _addr);
    }

    /// @notice Set the Collateral contract address
    /// @param _addr Collateral contract address
    function setCollateral(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        collateral = ICollateral(_addr);
        emit ContractAddressUpdated("Collateral", _addr);
    }

    /// @notice Set the CreditLedger contract address
    /// @param _addr CreditLedger contract address
    function setCreditLedger(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        creditLedger = ICreditLedger(_addr);
        emit ContractAddressUpdated("CreditLedger", _addr);
    }

    /// @notice Set the Account contract address
    /// @param _addr Account contract address
    function setAccount(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        account = IAccount(_addr);
        emit ContractAddressUpdated("Account", _addr);
    }

    /// @notice Set the Audit contract address (authorised to call refund)
    /// @param _addr Audit contract address
    function setAuditContract(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        auditContract = _addr;
        emit ContractAddressUpdated("Audit", _addr);
    }

    /// @notice Authorize or deauthorize a caller for setOutcome
    /// @param caller The address to authorize or deauthorize
    /// @param _authorized Whether the address should be authorized
    function setAuthorizedCaller(address caller, bool _authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = _authorized;
        emit AuthorizedCallerSet(caller, _authorized);
    }

    /// @notice Update the outcome of a purchase. Called by authorized contracts (e.g. oracle/validator).
    /// @param purchaseId The purchase to update
    /// @param outcome The new outcome
    function setOutcome(uint256 purchaseId, Outcome outcome) external {
        if (!authorizedCallers[msg.sender]) revert Unauthorized();
        _purchases[purchaseId].outcome = outcome;
        emit OutcomeUpdated(purchaseId, outcome);
    }

    // -------------------------------------------------------------------------
    // Idiot operations
    // -------------------------------------------------------------------------

    /// @notice Deposit USDC into escrow. Caller must have approved this contract.
    /// @param amount Amount of USDC to deposit (6 decimals)
    function deposit(uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        balances[msg.sender] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw unused USDC from escrow
    /// @param amount Amount of USDC to withdraw (6 decimals)
    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        balances[msg.sender] = bal - amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Purchase a signal. Credits offset the fee first; remainder is paid from
    ///         the buyer's escrowed USDC balance. Locks Genius collateral and records the
    ///         purchase across all protocol contracts.
    /// @param signalId On-chain signal identifier
    /// @param notional Reference amount chosen by the buyer (6-decimal USDC scale)
    /// @param odds Decimal odds scaled by 1e6 (e.g. 1_910_000 = 1.91x = -110 American)
    /// @return purchaseId The auto-incremented purchase identifier
    function purchase(uint256 signalId, uint256 notional, uint256 odds)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 purchaseId)
    {
        // --- Validate inputs ---
        if (notional == 0) revert ZeroAmount();
        if (notional > MAX_NOTIONAL) revert NotionalTooLarge(notional, MAX_NOTIONAL);

        // --- Validate dependencies are wired up ---
        if (address(signalCommitment) == address(0)) revert ContractNotSet("SignalCommitment");
        if (address(collateral) == address(0)) revert ContractNotSet("Collateral");
        if (address(creditLedger) == address(0)) revert ContractNotSet("CreditLedger");
        if (address(account) == address(0)) revert ContractNotSet("Account");

        // --- Load & validate signal ---
        Signal memory sig = signalCommitment.getSignal(signalId);
        if (sig.status != SignalStatus.Active) revert SignalNotActive(signalId);
        if (block.timestamp >= sig.expiresAt) revert SignalExpired(signalId);

        // --- Mark signal as purchased immediately (prevents re-entry/double-purchase) ---
        signalCommitment.updateStatus(signalId, SignalStatus.Purchased);

        // --- Calculate fee ---
        // fee = notional * maxPriceBps / 10_000
        uint256 fee = (notional * sig.maxPriceBps) / 10_000;

        // --- Credit / USDC split ---
        uint256 creditBalance = creditLedger.balanceOf(msg.sender);
        uint256 creditUsed = fee < creditBalance ? fee : creditBalance;
        uint256 usdcPaid = fee - creditUsed;

        // --- Check and deduct buyer's escrowed USDC ---
        uint256 buyerBal = balances[msg.sender];
        if (buyerBal < usdcPaid) revert InsufficientBalance(buyerBal, usdcPaid);
        balances[msg.sender] = buyerBal - usdcPaid;

        // --- Burn credits used ---
        if (creditUsed > 0) {
            creditLedger.burn(msg.sender, creditUsed);
        }

        // --- Lock Genius collateral ---
        // lockAmount = notional * slaMultiplierBps / 10_000
        uint256 lockAmount = (notional * sig.slaMultiplierBps) / 10_000;
        collateral.lock(signalId, sig.genius, lockAmount);

        // --- Record purchase ---
        unchecked {
            purchaseId = nextPurchaseId++;
        }
        _purchases[purchaseId] = Purchase({
            idiot: msg.sender,
            signalId: signalId,
            notional: notional,
            feePaid: fee,
            creditUsed: creditUsed,
            usdcPaid: usdcPaid,
            odds: odds,
            outcome: Outcome(0), // Pending
            purchasedAt: block.timestamp
        });

        _purchasesBySignal[signalId].push(purchaseId);

        // --- Track fee pool for audit refunds ---
        uint256 cycle = account.getCurrentCycle(sig.genius, msg.sender);
        feePool[sig.genius][msg.sender][cycle] += usdcPaid;

        // --- Notify Account contract ---
        account.recordPurchase(sig.genius, msg.sender, purchaseId);

        emit SignalPurchased(signalId, msg.sender, purchaseId, notional, fee, creditUsed, usdcPaid);
    }

    // -------------------------------------------------------------------------
    // Audit-initiated refund
    // -------------------------------------------------------------------------

    /// @notice Refund USDC to an Idiot from the fee pool. Only callable by the Audit contract.
    /// @param genius Genius address whose fee pool is debited
    /// @param idiot  Idiot address who receives the refund
    /// @param cycle  The audit cycle for the fee pool lookup
    /// @param amount USDC amount to refund
    function refund(address genius, address idiot, uint256 cycle, uint256 amount) external onlyAudit nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 poolBalance = feePool[genius][idiot][cycle];
        if (poolBalance < amount) revert InsufficientBalance(poolBalance, amount);

        feePool[genius][idiot][cycle] = poolBalance - amount;
        balances[idiot] += amount;

        emit Refunded(genius, idiot, cycle, amount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Returns the escrowed USDC balance for a user
    /// @param user Address to query
    /// @return balance The user's escrowed USDC balance
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /// @notice Returns a Purchase record by its ID
    /// @param purchaseId The purchase identifier
    /// @return The Purchase struct
    function getPurchase(uint256 purchaseId) external view returns (Purchase memory) {
        return _purchases[purchaseId];
    }

    /// @notice Returns all purchase IDs associated with a signal
    /// @param signalId The signal identifier
    /// @return Array of purchaseIds for this signal
    function getPurchasesBySignal(uint256 signalId) external view returns (uint256[] memory) {
        return _purchasesBySignal[signalId];
    }

    // -------------------------------------------------------------------------
    // Emergency pause
    // -------------------------------------------------------------------------

    /// @notice Pause deposits, withdrawals, and purchases
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause deposits, withdrawals, and purchases
    function unpause() external onlyOwner {
        _unpause();
    }
}

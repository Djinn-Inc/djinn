// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Purchase, Outcome, Signal, AccountState} from "./interfaces/IDjinn.sol";

/// @notice Minimal interface for the Escrow contract
interface IEscrowForAudit {
    function getPurchase(uint256 purchaseId) external view returns (Purchase memory);
    function feePool(address genius, address idiot, uint256 cycle) external view returns (uint256);
    function refund(address genius, address idiot, uint256 cycle, uint256 amount) external;
}

/// @notice Minimal interface for the Collateral contract
interface ICollateralForAudit {
    function slash(address genius, uint256 amount, address recipient) external;
    function release(uint256 signalId, address genius, uint256 amount) external;
    function getSignalLock(address genius, uint256 signalId) external view returns (uint256);
}

/// @notice Minimal interface for the CreditLedger contract
interface ICreditLedgerForAudit {
    function mint(address to, uint256 amount) external;
}

/// @notice Minimal interface for the Account contract
interface IAccountForAudit {
    function isAuditReady(address genius, address idiot) external view returns (bool);
    function getAccountState(address genius, address idiot) external view returns (AccountState memory);
    function settleAudit(address genius, address idiot) external;
    function getCurrentCycle(address genius, address idiot) external view returns (uint256);
    function getOutcome(address genius, address idiot, uint256 purchaseId) external view returns (Outcome);
}

/// @notice Minimal interface for the SignalCommitment contract
interface ISignalCommitmentForAudit {
    function getSignal(uint256 signalId) external view returns (Signal memory);
}

/// @notice Result of an audit settlement
struct AuditResult {
    int256 qualityScore;
    uint256 trancheA;
    uint256 trancheB;
    uint256 protocolFee;
    uint256 timestamp;
}

/// @title Audit
/// @notice Handles settlement after 10 signals between a Genius-Idiot pair.
///         Computes the Quality Score per the whitepaper formula, distributes damages
///         across Tranche A (USDC refund) and Tranche B (Credits), collects a 0.5%
///         protocol fee on total notional, and releases remaining collateral locks.
contract Audit is Ownable {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Protocol fee in basis points (0.5% = 50 bps)
    uint256 public constant PROTOCOL_FEE_BPS = 50;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Odds precision: 6-decimal fixed point (1.91 = 1_910_000)
    uint256 public constant ODDS_PRECISION = 1e6;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Protocol contract references
    IEscrowForAudit public escrow;
    ICollateralForAudit public collateral;
    ICreditLedgerForAudit public creditLedger;
    IAccountForAudit public account;
    ISignalCommitmentForAudit public signalCommitment;

    /// @notice Protocol treasury address that receives the 0.5% fee
    address public protocolTreasury;

    /// @notice Stored audit results: genius -> idiot -> cycle -> AuditResult
    mapping(address => mapping(address => mapping(uint256 => AuditResult))) public auditResults;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when an audit is triggered
    event AuditTriggered(address indexed genius, address indexed idiot, uint256 cycle);

    /// @notice Emitted when an audit is settled
    event AuditSettled(
        address indexed genius,
        address indexed idiot,
        uint256 cycle,
        int256 qualityScore,
        uint256 trancheA,
        uint256 trancheB,
        uint256 protocolFee
    );

    /// @notice Emitted when an early exit is executed
    event EarlyExitSettled(
        address indexed genius,
        address indexed idiot,
        uint256 cycle,
        int256 qualityScore,
        uint256 creditsAwarded
    );

    /// @notice Emitted when a contract address is updated
    event ContractAddressUpdated(string name, address addr);

    /// @notice Emitted when the protocol treasury address is updated
    event TreasuryUpdated(address newTreasury);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotAuditReady(address genius, address idiot);
    error AlreadySettled(address genius, address idiot, uint256 cycle);
    error ZeroAddress();
    error ContractNotSet(string name);
    error NotPartyToAudit(address caller, address genius, address idiot);
    error NoPurchasesInCycle(address genius, address idiot, uint256 cycle);
    error AuditAlreadyReady(address genius, address idiot);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _owner Address that will own this contract
    constructor(address _owner) Ownable(_owner) {}

    // -------------------------------------------------------------------------
    // Admin -- set protocol contract addresses
    // -------------------------------------------------------------------------

    /// @notice Set the Escrow contract address
    /// @param _addr Escrow contract address
    function setEscrow(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        escrow = IEscrowForAudit(_addr);
        emit ContractAddressUpdated("Escrow", _addr);
    }

    /// @notice Set the Collateral contract address
    /// @param _addr Collateral contract address
    function setCollateral(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        collateral = ICollateralForAudit(_addr);
        emit ContractAddressUpdated("Collateral", _addr);
    }

    /// @notice Set the CreditLedger contract address
    /// @param _addr CreditLedger contract address
    function setCreditLedger(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        creditLedger = ICreditLedgerForAudit(_addr);
        emit ContractAddressUpdated("CreditLedger", _addr);
    }

    /// @notice Set the Account contract address
    /// @param _addr Account contract address
    function setAccount(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        account = IAccountForAudit(_addr);
        emit ContractAddressUpdated("Account", _addr);
    }

    /// @notice Set the SignalCommitment contract address
    /// @param _addr SignalCommitment contract address
    function setSignalCommitment(address _addr) external onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();
        signalCommitment = ISignalCommitmentForAudit(_addr);
        emit ContractAddressUpdated("SignalCommitment", _addr);
    }

    /// @notice Set the protocol treasury address
    /// @param _treasury Address that receives the 0.5% protocol fee
    function setProtocolTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        protocolTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // -------------------------------------------------------------------------
    // Core functions
    // -------------------------------------------------------------------------

    /// @notice Trigger an audit for a Genius-Idiot pair. Anyone can call this.
    /// @dev Checks that the pair has reached 10 signals via Account.isAuditReady().
    ///      Computes the Quality Score, executes settlement, and starts a new cycle.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    function trigger(address genius, address idiot) external {
        _validateDependencies();
        if (!account.isAuditReady(genius, idiot)) {
            revert NotAuditReady(genius, idiot);
        }

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        if (auditResults[genius][idiot][cycle].timestamp != 0) {
            revert AlreadySettled(genius, idiot, cycle);
        }

        int256 score = computeScore(genius, idiot);
        _settle(genius, idiot, cycle, score, false);
    }

    /// @notice Compute the Quality Score for a Genius-Idiot pair in the current cycle.
    /// @dev For each purchase:
    ///      - Favorable: +notional * (odds - 1e6) / 1e6
    ///      - Unfavorable: -notional * slaMultiplierBps / 10000
    ///      - Void/Pending: skip
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @return score The computed Quality Score (can be negative)
    function computeScore(address genius, address idiot) public view returns (int256 score) {
        _validateDependenciesView();

        AccountState memory state = account.getAccountState(genius, idiot);
        uint256[] memory purchaseIds = state.purchaseIds;

        if (purchaseIds.length == 0) {
            revert NoPurchasesInCycle(genius, idiot, state.currentCycle);
        }

        score = 0;

        for (uint256 i; i < purchaseIds.length; ++i) {
            Purchase memory p = escrow.getPurchase(purchaseIds[i]);
            Signal memory sig = signalCommitment.getSignal(p.signalId);
            Outcome outcome = account.getOutcome(genius, idiot, purchaseIds[i]);

            if (outcome == Outcome.Favorable) {
                // +notional * (odds - 1e6) / 1e6
                // odds is 6-decimal fixed point, e.g., 1.91 = 1_910_000
                int256 gain = int256(p.notional) * (int256(p.odds) - int256(ODDS_PRECISION)) / int256(ODDS_PRECISION);
                score += gain;
            } else if (outcome == Outcome.Unfavorable) {
                // -notional * slaMultiplierBps / 10000
                int256 loss = int256(p.notional) * int256(sig.slaMultiplierBps) / int256(BPS_DENOMINATOR);
                score -= loss;
            }
            // Void and Pending: skip
        }
    }

    /// @notice Execute settlement for a Genius-Idiot pair.
    ///         Handles Tranche A (USDC), Tranche B (Credits),
    ///         protocol fee, collateral release, and cycle advancement.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    function settle(address genius, address idiot) external {
        _validateDependencies();
        if (!account.isAuditReady(genius, idiot)) {
            revert NotAuditReady(genius, idiot);
        }

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        if (auditResults[genius][idiot][cycle].timestamp != 0) {
            revert AlreadySettled(genius, idiot, cycle);
        }

        int256 score = computeScore(genius, idiot);
        _settle(genius, idiot, cycle, score, false);
    }

    /// @notice Either party can trigger early exit before 10 signals.
    ///         Settlement uses the current Quality Score but pays entirely in Credits
    ///         (not USDC), per whitepaper: "insufficient sample for USDC movement."
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    function earlyExit(address genius, address idiot) external {
        _validateDependencies();

        // Only the genius or idiot can trigger early exit
        if (msg.sender != genius && msg.sender != idiot) {
            revert NotPartyToAudit(msg.sender, genius, idiot);
        }

        // Must NOT be audit-ready (i.e., fewer than 10 signals)
        if (account.isAuditReady(genius, idiot)) {
            revert AuditAlreadyReady(genius, idiot);
        }

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        if (auditResults[genius][idiot][cycle].timestamp != 0) {
            revert AlreadySettled(genius, idiot, cycle);
        }

        AccountState memory state = account.getAccountState(genius, idiot);
        if (state.purchaseIds.length == 0) {
            revert NoPurchasesInCycle(genius, idiot, cycle);
        }

        int256 score = computeScore(genius, idiot);
        _settle(genius, idiot, cycle, score, true);
    }

    // -------------------------------------------------------------------------
    // Internal settlement logic
    // -------------------------------------------------------------------------

    /// @dev Aggregates totals across purchases in the current cycle
    /// @param genius The Genius address (needed to read outcomes from Account)
    /// @param idiot The Idiot address (needed to read outcomes from Account)
    /// @param purchaseIds Array of purchase IDs in the cycle
    /// @return totalNotional Sum of notional for non-void purchases
    /// @return totalUsdcFeesPaid Sum of USDC fees paid across all purchases
    function _aggregatePurchases(
        address genius,
        address idiot,
        uint256[] memory purchaseIds
    ) internal view returns (uint256 totalNotional, uint256 totalUsdcFeesPaid) {
        for (uint256 i; i < purchaseIds.length; ++i) {
            Purchase memory p = escrow.getPurchase(purchaseIds[i]);
            Outcome outcome = account.getOutcome(genius, idiot, purchaseIds[i]);
            if (outcome != Outcome.Void) {
                totalNotional += p.notional;
            }
            totalUsdcFeesPaid += p.usdcPaid;
        }
    }

    /// @dev Distributes damages for a negative Quality Score in standard (non-early-exit) mode.
    ///      Tranche A: USDC refund capped at total USDC fees paid (slashed from Genius collateral).
    ///      Tranche B: excess damages minted as Credits.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The current audit cycle
    /// @param totalDamages Absolute value of the negative Quality Score
    /// @param totalUsdcFeesPaid Total USDC fees the Idiot paid this cycle
    /// @return trancheA USDC refunded to the Idiot
    /// @return trancheB Credits minted to the Idiot
    function _distributeDamages(
        address genius,
        address idiot,
        uint256 cycle,
        uint256 totalDamages,
        uint256 totalUsdcFeesPaid
    ) internal returns (uint256 trancheA, uint256 trancheB) {
        // Tranche A: USDC refund, capped at total USDC fees paid by this Idiot
        // Per Section 7: "You can never extract more USDC than you put in"
        trancheA = totalDamages < totalUsdcFeesPaid ? totalDamages : totalUsdcFeesPaid;

        // Tranche B: excess damages as Credits
        if (totalDamages > trancheA) {
            trancheB = totalDamages - trancheA;
        }

        // Slash Genius collateral and send USDC to Escrow for Idiot refund
        if (trancheA > 0) {
            collateral.slash(genius, trancheA, address(escrow));
            _refundFromFeePool(genius, idiot, cycle, trancheA);
        }

        // Mint Credits for Tranche B
        if (trancheB > 0) {
            creditLedger.mint(idiot, trancheB);
        }
    }

    /// @dev Refunds USDC to the Idiot via the Escrow fee pool.
    ///      Capped at the available fee pool balance.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The current audit cycle
    /// @param amount Amount to refund
    function _refundFromFeePool(
        address genius,
        address idiot,
        uint256 cycle,
        uint256 amount
    ) internal {
        uint256 poolBalance = escrow.feePool(genius, idiot, cycle);
        uint256 refundAmount = amount < poolBalance ? amount : poolBalance;
        if (refundAmount > 0) {
            escrow.refund(genius, idiot, cycle, refundAmount);
        }
    }

    /// @dev Releases all remaining signal collateral locks for purchases in the cycle
    /// @param genius The Genius address
    /// @param purchaseIds Array of purchase IDs in the cycle
    function _releaseSignalLocks(address genius, uint256[] memory purchaseIds) internal {
        for (uint256 i; i < purchaseIds.length; ++i) {
            Purchase memory p = escrow.getPurchase(purchaseIds[i]);
            uint256 lockAmount = collateral.getSignalLock(genius, p.signalId);
            if (lockAmount > 0) {
                collateral.release(p.signalId, genius, lockAmount);
            }
        }
    }

    /// @dev Core settlement logic shared by trigger/settle and earlyExit.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The current audit cycle
    /// @param score The computed Quality Score
    /// @param isEarlyExit If true, all damages paid as Credits only
    function _settle(
        address genius,
        address idiot,
        uint256 cycle,
        int256 score,
        bool isEarlyExit
    ) internal {
        AccountState memory state = account.getAccountState(genius, idiot);
        uint256[] memory purchaseIds = state.purchaseIds;

        (uint256 totalNotional, uint256 totalUsdcFeesPaid) = _aggregatePurchases(genius, idiot, purchaseIds);

        // Protocol fee: 0.5% of total notional
        uint256 protocolFee = (totalNotional * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        uint256 trancheA;
        uint256 trancheB;

        if (isEarlyExit) {
            // Early exit: all damages as Credits, no USDC movement
            if (score < 0) {
                trancheB = uint256(-score);
                creditLedger.mint(idiot, trancheB);
            }
        } else if (score < 0) {
            // Standard settlement with negative score
            (trancheA, trancheB) = _distributeDamages(genius, idiot, cycle, uint256(-score), totalUsdcFeesPaid);
        }
        // If score >= 0 and not early exit: Genius keeps all fees, no damages

        // Protocol fee -- slash from genius collateral to treasury
        if (protocolFee > 0) {
            collateral.slash(genius, protocolFee, protocolTreasury);
        }

        // Release remaining signal locks from Collateral
        _releaseSignalLocks(genius, purchaseIds);

        // Store audit result
        auditResults[genius][idiot][cycle] = AuditResult({
            qualityScore: score,
            trancheA: trancheA,
            trancheB: trancheB,
            protocolFee: protocolFee,
            timestamp: block.timestamp
        });

        // Mark account as settled, start new cycle
        account.settleAudit(genius, idiot);

        if (isEarlyExit) {
            emit EarlyExitSettled(genius, idiot, cycle, score, trancheB);
        } else {
            emit AuditSettled(genius, idiot, cycle, score, trancheA, trancheB, protocolFee);
        }
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Get the audit result for a specific Genius-Idiot cycle
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The audit cycle number
    /// @return result The AuditResult struct
    function getAuditResult(
        address genius,
        address idiot,
        uint256 cycle
    ) external view returns (AuditResult memory result) {
        return auditResults[genius][idiot][cycle];
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Validates that all required contract references are set (state-changing)
    function _validateDependencies() internal view {
        if (address(escrow) == address(0)) revert ContractNotSet("Escrow");
        if (address(collateral) == address(0)) revert ContractNotSet("Collateral");
        if (address(creditLedger) == address(0)) revert ContractNotSet("CreditLedger");
        if (address(account) == address(0)) revert ContractNotSet("Account");
        if (address(signalCommitment) == address(0)) revert ContractNotSet("SignalCommitment");
        if (protocolTreasury == address(0)) revert ContractNotSet("ProtocolTreasury");
    }

    /// @dev Validates that all required contract references are set (view functions)
    function _validateDependenciesView() internal view {
        if (address(escrow) == address(0)) revert ContractNotSet("Escrow");
        if (address(account) == address(0)) revert ContractNotSet("Account");
        if (address(signalCommitment) == address(0)) revert ContractNotSet("SignalCommitment");
    }
}

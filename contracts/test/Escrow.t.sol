// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {SignalCommitment} from "../src/SignalCommitment.sol";
import {Escrow} from "../src/Escrow.sol";
import {Collateral} from "../src/Collateral.sol";
import {CreditLedger} from "../src/CreditLedger.sol";
import {Account as DjinnAccount} from "../src/Account.sol";
import {Signal, SignalStatus, Purchase, Outcome} from "../src/interfaces/IDjinn.sol";

/// @title EscrowIntegrationTest
/// @notice Integration tests for the full purchase flow through Escrow
contract EscrowIntegrationTest is Test {
    MockUSDC usdc;
    SignalCommitment signalCommitment;
    Escrow escrow;
    Collateral collateral;
    CreditLedger creditLedger;
    DjinnAccount account;

    address owner;
    address genius = address(0xBEEF);
    address idiot = address(0xCAFE);

    // Standard signal parameters
    uint256 constant SIGNAL_ID = 1;
    uint256 constant MAX_PRICE_BPS = 500; // 5%
    uint256 constant SLA_MULTIPLIER_BPS = 15_000; // 150%
    uint256 constant NOTIONAL = 1000e6; // 1000 USDC
    uint256 constant ODDS = 1_910_000; // 1.91 (6 decimal fixed point)

    function setUp() public {
        owner = address(this);

        // Deploy all contracts
        usdc = new MockUSDC();
        signalCommitment = new SignalCommitment(owner);
        escrow = new Escrow(address(usdc), owner);
        collateral = new Collateral(address(usdc), owner);
        creditLedger = new CreditLedger(owner);
        account = new DjinnAccount(owner);

        // Wire contracts together
        escrow.setSignalCommitment(address(signalCommitment));
        escrow.setCollateral(address(collateral));
        escrow.setCreditLedger(address(creditLedger));
        escrow.setAccount(address(account));
        escrow.setAuditContract(owner); // owner acts as audit for refund tests

        // Authorize callers
        signalCommitment.setAuthorizedCaller(address(escrow), true);
        collateral.setAuthorized(address(escrow), true);
        creditLedger.setAuthorizedCaller(address(escrow), true);
        account.setAuthorizedCaller(address(escrow), true);
        account.setAuthorizedCaller(owner, true); // for recording outcomes in tests
    }

    // ─── Helpers
    // ─────────────────────────────────────────────────────────

    function _buildDecoyLines() internal pure returns (string[] memory) {
        string[] memory decoys = new string[](10);
        for (uint256 i; i < 10; i++) {
            decoys[i] = "decoy";
        }
        return decoys;
    }

    function _buildSportsbooks() internal pure returns (string[] memory) {
        string[] memory books = new string[](2);
        books[0] = "DraftKings";
        books[1] = "FanDuel";
        return books;
    }

    function _createSignal(uint256 signalId) internal {
        vm.prank(genius);
        signalCommitment.commit(
            SignalCommitment.CommitParams({
                signalId: signalId,
                encryptedBlob: hex"deadbeef",
                commitHash: keccak256("signal"),
                sport: "NFL",
                maxPriceBps: MAX_PRICE_BPS,
                slaMultiplierBps: SLA_MULTIPLIER_BPS,
                expiresAt: block.timestamp + 1 days,
                decoyLines: _buildDecoyLines(),
                availableSportsbooks: _buildSportsbooks()
            })
        );
    }

    function _depositGeniusCollateral(uint256 amount) internal {
        usdc.mint(genius, amount);
        vm.startPrank(genius);
        usdc.approve(address(collateral), amount);
        collateral.deposit(amount);
        vm.stopPrank();
    }

    function _depositIdiotEscrow(uint256 amount) internal {
        usdc.mint(idiot, amount);
        vm.startPrank(idiot);
        usdc.approve(address(escrow), amount);
        escrow.deposit(amount);
        vm.stopPrank();
    }

    // ─── Deposit / Withdraw Tests
    // ────────────────────────────────────────

    function test_deposit() public {
        uint256 amount = 500e6;
        usdc.mint(idiot, amount);

        vm.startPrank(idiot);
        usdc.approve(address(escrow), amount);
        escrow.deposit(amount);
        vm.stopPrank();

        assertEq(escrow.getBalance(idiot), amount, "Escrow balance should match deposit");
        assertEq(usdc.balanceOf(address(escrow)), amount, "USDC should be in escrow contract");
    }

    function test_deposit_reverts_zero() public {
        vm.expectRevert(Escrow.ZeroAmount.selector);
        vm.prank(idiot);
        escrow.deposit(0);
    }

    function test_withdraw() public {
        uint256 depositAmount = 500e6;
        uint256 withdrawAmount = 200e6;

        _depositIdiotEscrow(depositAmount);

        vm.prank(idiot);
        escrow.withdraw(withdrawAmount);

        assertEq(escrow.getBalance(idiot), depositAmount - withdrawAmount, "Remaining balance wrong");
        assertEq(usdc.balanceOf(idiot), withdrawAmount, "Withdrawn USDC not received");
    }

    function test_withdraw_reverts_insufficient() public {
        _depositIdiotEscrow(100e6);

        vm.expectRevert(abi.encodeWithSelector(Escrow.InsufficientBalance.selector, 100e6, 200e6));
        vm.prank(idiot);
        escrow.withdraw(200e6);
    }

    function test_withdraw_reverts_zero() public {
        vm.expectRevert(Escrow.ZeroAmount.selector);
        vm.prank(idiot);
        escrow.withdraw(0);
    }

    function test_deposit_and_full_withdraw() public {
        uint256 amount = 1000e6;
        _depositIdiotEscrow(amount);

        vm.prank(idiot);
        escrow.withdraw(amount);

        assertEq(escrow.getBalance(idiot), 0, "Balance should be zero after full withdraw");
        assertEq(usdc.balanceOf(idiot), amount, "All USDC returned to idiot");
    }

    // ─── Successful Purchase
    // ─────────────────────────────────────────────

    function test_purchase_success() public {
        _createSignal(SIGNAL_ID);

        // Genius needs enough collateral for: notional * slaMultiplierBps / 10000
        // 1000e6 * 15000 / 10000 = 1500e6
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        // Fee = notional * maxPriceBps / 10000 = 1000e6 * 500 / 10000 = 50e6
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        uint256 idiotBalBefore = escrow.getBalance(idiot);

        vm.prank(idiot);
        uint256 purchaseId = escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        // Verify Purchase struct
        Purchase memory p = escrow.getPurchase(purchaseId);
        assertEq(p.idiot, idiot, "Purchase idiot mismatch");
        assertEq(p.signalId, SIGNAL_ID, "Purchase signalId mismatch");
        assertEq(p.notional, NOTIONAL, "Purchase notional mismatch");
        assertEq(p.feePaid, expectedFee, "Purchase feePaid mismatch");
        assertEq(p.creditUsed, 0, "No credits should be used");
        assertEq(p.usdcPaid, expectedFee, "Purchase usdcPaid should equal fee");
        assertEq(p.odds, ODDS, "Purchase odds mismatch");
        assertEq(uint8(p.outcome), uint8(Outcome.Pending), "Purchase outcome should be Pending");

        // Verify escrow balance reduced
        assertEq(escrow.getBalance(idiot), idiotBalBefore - expectedFee, "Idiot escrow balance not reduced");

        // Verify collateral locked
        assertEq(collateral.getLocked(genius), requiredCollateral, "Collateral not locked");
        assertEq(collateral.getSignalLock(genius, SIGNAL_ID), requiredCollateral, "Signal lock amount mismatch");

        // Verify signal status updated to Purchased
        Signal memory sig = signalCommitment.getSignal(SIGNAL_ID);
        assertEq(uint8(sig.status), uint8(SignalStatus.Purchased), "Signal should be Purchased");

        // Verify fee pool
        uint256 cycle = account.getCurrentCycle(genius, idiot);
        assertEq(escrow.feePool(genius, idiot, cycle), expectedFee, "Fee pool not tracked");

        // Verify account recorded the purchase
        assertEq(account.getSignalCount(genius, idiot), 1, "Account signal count wrong");
    }

    // ─── Purchase With Credits
    // ───────────────────────────────────────────

    function test_purchase_with_credits() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000; // 50e6
        uint256 creditAmount = 20e6; // 20 USDC worth of credits
        uint256 expectedUsdcPaid = expectedFee - creditAmount;

        // Mint credits to idiot (creditLedger needs authorized caller)
        creditLedger.setAuthorizedCaller(owner, true);
        creditLedger.mint(idiot, creditAmount);

        // Idiot only needs to deposit the USDC portion
        _depositIdiotEscrow(expectedUsdcPaid);

        vm.prank(idiot);
        uint256 purchaseId = escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        Purchase memory p = escrow.getPurchase(purchaseId);
        assertEq(p.feePaid, expectedFee, "Total fee should be full amount");
        assertEq(p.creditUsed, creditAmount, "Credits should offset part of fee");
        assertEq(p.usdcPaid, expectedUsdcPaid, "USDC paid should be fee minus credits");

        // Credits should be burned
        assertEq(creditLedger.balanceOf(idiot), 0, "Credits should be burned");

        // Escrow balance should be zero (all USDC used)
        assertEq(escrow.getBalance(idiot), 0, "Idiot escrow balance should be zero");

        // Fee pool only tracks USDC, not credits
        uint256 cycle = account.getCurrentCycle(genius, idiot);
        assertEq(escrow.feePool(genius, idiot, cycle), expectedUsdcPaid, "Fee pool should only have USDC paid");
    }

    function test_purchase_fully_covered_by_credits() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000; // 50e6

        // Give idiot enough credits to fully cover the fee
        creditLedger.setAuthorizedCaller(owner, true);
        creditLedger.mint(idiot, expectedFee + 10e6); // extra credits

        // No USDC deposit needed
        vm.prank(idiot);
        uint256 purchaseId = escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        Purchase memory p = escrow.getPurchase(purchaseId);
        assertEq(p.creditUsed, expectedFee, "Credits should cover entire fee");
        assertEq(p.usdcPaid, 0, "No USDC should be paid");

        // Leftover credits remain
        assertEq(creditLedger.balanceOf(idiot), 10e6, "Remaining credits should be untouched");

        // Fee pool should be zero since no USDC was paid
        uint256 cycle = account.getCurrentCycle(genius, idiot);
        assertEq(escrow.feePool(genius, idiot, cycle), 0, "Fee pool should be zero when paid entirely by credits");
    }

    // ─── Purchase Reverts
    // ────────────────────────────────────────────────

    function test_purchase_reverts_insufficient_balance() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        // Deposit less than needed
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        uint256 insufficientDeposit = expectedFee / 2;
        _depositIdiotEscrow(insufficientDeposit);

        vm.expectRevert(abi.encodeWithSelector(Escrow.InsufficientBalance.selector, insufficientDeposit, expectedFee));
        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);
    }

    function test_purchase_reverts_non_active_signal() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        // Void the signal so it's not Active
        vm.prank(genius);
        signalCommitment.voidSignal(SIGNAL_ID);

        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        vm.expectRevert(abi.encodeWithSelector(Escrow.SignalNotActive.selector, SIGNAL_ID));
        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);
    }

    function test_purchase_reverts_expired_signal() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        // Fast forward past expiration
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(abi.encodeWithSelector(Escrow.SignalExpired.selector, SIGNAL_ID));
        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);
    }

    function test_purchase_reverts_insufficient_collateral() public {
        _createSignal(SIGNAL_ID);

        // Deposit less collateral than needed
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000; // 1500e6
        uint256 insufficientCollateral = requiredCollateral / 2;
        _depositGeniusCollateral(insufficientCollateral);

        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        vm.expectRevert(
            abi.encodeWithSelector(
                Collateral.InsufficientFreeCollateral.selector, insufficientCollateral, requiredCollateral
            )
        );
        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);
    }

    function test_purchase_reverts_zero_notional() public {
        _createSignal(SIGNAL_ID);

        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);

        _depositIdiotEscrow(1e6);

        vm.expectRevert(Escrow.ZeroAmount.selector);
        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, 0, ODDS);
    }

    // ─── Fee Calculation
    // ─────────────────────────────────────────────────

    function test_fee_calculation_various_maxPrice() public {
        // Test with different maxPriceBps values
        uint256[] memory priceBps = new uint256[](4);
        priceBps[0] = 100; // 1%
        priceBps[1] = 500; // 5%
        priceBps[2] = 1000; // 10%
        priceBps[3] = 5000; // 50% (max)

        for (uint256 i; i < priceBps.length; i++) {
            uint256 sigId = 100 + i;

            vm.prank(genius);
            signalCommitment.commit(
                SignalCommitment.CommitParams({
                    signalId: sigId,
                    encryptedBlob: hex"deadbeef",
                    commitHash: keccak256(abi.encodePacked("signal", i)),
                    sport: "NFL",
                    maxPriceBps: priceBps[i],
                    slaMultiplierBps: SLA_MULTIPLIER_BPS,
                    expiresAt: block.timestamp + 1 days,
                    decoyLines: _buildDecoyLines(),
                    availableSportsbooks: _buildSportsbooks()
                })
            );

            uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
            _depositGeniusCollateral(requiredCollateral);

            uint256 expectedFee = (NOTIONAL * priceBps[i]) / 10_000;
            _depositIdiotEscrow(expectedFee);

            vm.prank(idiot);
            uint256 purchaseId = escrow.purchase(sigId, NOTIONAL, ODDS);

            Purchase memory p = escrow.getPurchase(purchaseId);
            assertEq(p.feePaid, expectedFee, "Fee calculation wrong");
        }
    }

    // ─── Multiple Purchases
    // ──────────────────────────────────────────────

    function test_multiple_purchases_same_pair() public {
        uint256 numPurchases = 5;

        for (uint256 i; i < numPurchases; i++) {
            uint256 sigId = 200 + i;
            _createSignalWithId(sigId);

            uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
            _depositGeniusCollateral(requiredCollateral);

            uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
            _depositIdiotEscrow(expectedFee);

            vm.prank(idiot);
            escrow.purchase(sigId, NOTIONAL, ODDS);
        }

        assertEq(account.getSignalCount(genius, idiot), numPurchases, "Signal count should match");
        assertEq(escrow.nextPurchaseId(), numPurchases, "Purchase counter wrong");
    }

    function _createSignalWithId(uint256 signalId) internal {
        vm.prank(genius);
        signalCommitment.commit(
            SignalCommitment.CommitParams({
                signalId: signalId,
                encryptedBlob: hex"deadbeef",
                commitHash: keccak256(abi.encodePacked("signal", signalId)),
                sport: "NFL",
                maxPriceBps: MAX_PRICE_BPS,
                slaMultiplierBps: SLA_MULTIPLIER_BPS,
                expiresAt: block.timestamp + 1 days,
                decoyLines: _buildDecoyLines(),
                availableSportsbooks: _buildSportsbooks()
            })
        );
    }

    // ─── Refund (via Audit)
    // ──────────────────────────────────────────────

    function test_refund_from_audit() public {
        // Complete a purchase to build up fee pool
        _createSignal(SIGNAL_ID);
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        uint256 poolBefore = escrow.feePool(genius, idiot, cycle);
        assertEq(poolBefore, expectedFee, "Pool should contain fee");

        // Owner acts as audit contract, trigger refund
        uint256 refundAmount = expectedFee / 2;
        escrow.refund(genius, idiot, cycle, refundAmount);

        assertEq(escrow.feePool(genius, idiot, cycle), poolBefore - refundAmount, "Pool not reduced");
        assertEq(escrow.getBalance(idiot), refundAmount, "Refund not credited to idiot balance");
    }

    function test_refund_unauthorized_reverts() public {
        address random = address(0xDEAD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        vm.prank(random);
        escrow.refund(genius, idiot, 0, 100e6);
    }

    function test_refund_zero_reverts() public {
        vm.expectRevert(Escrow.ZeroAmount.selector);
        escrow.refund(genius, idiot, 0, 0);
    }

    function test_refund_exceeds_pool_reverts() public {
        // Build up a fee pool via a purchase
        _createSignal(SIGNAL_ID);
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        uint256 poolBalance = escrow.feePool(genius, idiot, cycle);

        // Try to refund more than pool contains
        vm.expectRevert(abi.encodeWithSelector(Escrow.InsufficientBalance.selector, poolBalance, poolBalance + 1));
        escrow.refund(genius, idiot, cycle, poolBalance + 1);
    }

    function test_refund_successive_drains_pool() public {
        // Build up a fee pool via a purchase
        _createSignal(SIGNAL_ID);
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000; // 50e6
        _depositIdiotEscrow(expectedFee);

        vm.prank(idiot);
        escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        uint256 cycle = account.getCurrentCycle(genius, idiot);

        // First refund: half the pool
        escrow.refund(genius, idiot, cycle, expectedFee / 2);
        assertEq(escrow.feePool(genius, idiot, cycle), expectedFee / 2, "Pool half-drained");
        assertEq(escrow.getBalance(idiot), expectedFee / 2, "Idiot got first refund");

        // Second refund: remaining half
        escrow.refund(genius, idiot, cycle, expectedFee / 2);
        assertEq(escrow.feePool(genius, idiot, cycle), 0, "Pool fully drained");
        assertEq(escrow.getBalance(idiot), expectedFee, "Idiot got full refund");

        // Third refund: pool is empty, should revert
        vm.expectRevert(abi.encodeWithSelector(Escrow.InsufficientBalance.selector, 0, 1));
        escrow.refund(genius, idiot, cycle, 1);
    }

    // ─── setOutcome Tests
    // ─────────────────────────────────────────────────

    function test_setOutcome_success() public {
        // Complete a purchase
        _createSignal(SIGNAL_ID);
        uint256 requiredCollateral = (NOTIONAL * SLA_MULTIPLIER_BPS) / 10_000;
        _depositGeniusCollateral(requiredCollateral);
        uint256 expectedFee = (NOTIONAL * MAX_PRICE_BPS) / 10_000;
        _depositIdiotEscrow(expectedFee);

        vm.prank(idiot);
        uint256 purchaseId = escrow.purchase(SIGNAL_ID, NOTIONAL, ODDS);

        // Set authorized caller
        escrow.setAuthorizedCaller(owner, true);

        escrow.setOutcome(purchaseId, Outcome.Favorable);

        Purchase memory p = escrow.getPurchase(purchaseId);
        assertEq(uint8(p.outcome), uint8(Outcome.Favorable), "Outcome should be Favorable");
    }

    function test_setOutcome_unauthorized_reverts() public {
        address random = address(0xDEAD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        vm.prank(random);
        escrow.setOutcome(0, Outcome.Favorable);
    }
}

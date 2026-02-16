// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SignalCommitment} from "../src/SignalCommitment.sol";
import {Signal, SignalStatus} from "../src/interfaces/IDjinn.sol";

contract SignalCommitmentTest is Test {
    SignalCommitment public sc;

    address public owner = address(this);
    address public genius = address(0xA1);
    address public authorizedCaller = address(0xA2);
    address public unauthorizedCaller = address(0xA3);

    function setUp() public {
        sc = new SignalCommitment(owner);
        sc.setAuthorizedCaller(authorizedCaller, true);
    }

    // ─── Helpers
    // ─────────────────────────────────────────────────────────

    function _makeDecoyLines() internal pure returns (string[] memory) {
        string[] memory lines = new string[](10);
        for (uint256 i = 0; i < 10; i++) {
            lines[i] = string(abi.encodePacked("decoy-", vm.toString(i)));
        }
        return lines;
    }

    function _makeSportsbooks() internal pure returns (string[] memory) {
        string[] memory books = new string[](2);
        books[0] = "DraftKings";
        books[1] = "FanDuel";
        return books;
    }

    function _defaultParams(uint256 signalId) internal view returns (SignalCommitment.CommitParams memory) {
        return SignalCommitment.CommitParams({
            signalId: signalId,
            encryptedBlob: hex"aabbccdd",
            commitHash: keccak256("test-commit"),
            sport: "NFL",
            maxPriceBps: 500,
            slaMultiplierBps: 15_000,
            expiresAt: block.timestamp + 1 hours,
            decoyLines: _makeDecoyLines(),
            availableSportsbooks: _makeSportsbooks()
        });
    }

    function _commitDefault(uint256 signalId) internal {
        vm.prank(genius);
        sc.commit(_defaultParams(signalId));
    }

    // ─── Tests: Successful commit
    // ────────────────────────────────────────

    function test_commit_success() public {
        uint256 signalId = 1;
        SignalCommitment.CommitParams memory p = _defaultParams(signalId);

        vm.prank(genius);
        sc.commit(p);

        assertTrue(sc.signalExists(signalId));

        Signal memory sig = sc.getSignal(signalId);
        assertEq(sig.genius, genius);
        assertEq(sig.commitHash, p.commitHash);
        assertEq(keccak256(sig.encryptedBlob), keccak256(p.encryptedBlob));
        assertEq(keccak256(bytes(sig.sport)), keccak256(bytes("NFL")));
        assertEq(sig.maxPriceBps, 500);
        assertEq(sig.slaMultiplierBps, 15_000);
        assertEq(sig.expiresAt, p.expiresAt);
        assertEq(sig.decoyLines.length, 10);
        assertEq(sig.availableSportsbooks.length, 2);
        assertEq(uint8(sig.status), uint8(SignalStatus.Active));
        assertEq(sig.createdAt, block.timestamp);
    }

    function test_commit_emitsEvent() public {
        uint256 signalId = 42;
        SignalCommitment.CommitParams memory p = _defaultParams(signalId);

        vm.expectEmit(true, true, false, true);
        emit SignalCommitment.SignalCommitted(signalId, genius, "NFL", p.maxPriceBps, p.slaMultiplierBps, p.expiresAt);

        vm.prank(genius);
        sc.commit(p);
    }

    // ─── Tests: Revert on duplicate signal ID
    // ────────────────────────────

    function test_commit_revertOnDuplicateSignalId() public {
        _commitDefault(1);

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalAlreadyExists.selector, 1));
        vm.prank(genius);
        sc.commit(_defaultParams(1));
    }

    // ─── Tests: Revert on invalid decoy lines length
    // ─────────────────────

    function test_commit_revertOnDecoyLinesTooFew() public {
        SignalCommitment.CommitParams memory p = _defaultParams(100);
        string[] memory shortLines = new string[](5);
        for (uint256 i = 0; i < 5; i++) {
            shortLines[i] = "decoy";
        }
        p.decoyLines = shortLines;

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.InvalidDecoyLinesLength.selector, 5));
        vm.prank(genius);
        sc.commit(p);
    }

    function test_commit_revertOnDecoyLinesTooMany() public {
        SignalCommitment.CommitParams memory p = _defaultParams(101);
        string[] memory longLines = new string[](11);
        for (uint256 i = 0; i < 11; i++) {
            longLines[i] = "decoy";
        }
        p.decoyLines = longLines;

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.InvalidDecoyLinesLength.selector, 11));
        vm.prank(genius);
        sc.commit(p);
    }

    // ─── Tests: Revert on SLA multiplier too low
    // ─────────────────────────

    function test_commit_revertOnSlaMultiplierTooLow() public {
        SignalCommitment.CommitParams memory p = _defaultParams(200);
        p.slaMultiplierBps = 9999;

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SlaMultiplierTooLow.selector, 9999));
        vm.prank(genius);
        sc.commit(p);
    }

    function test_commit_slaMultiplierExactMinimum() public {
        SignalCommitment.CommitParams memory p = _defaultParams(201);
        p.slaMultiplierBps = 10_000;

        vm.prank(genius);
        sc.commit(p);

        assertTrue(sc.signalExists(201));
    }

    // ─── Tests: Revert on invalid max price
    // ──────────────────────────────

    function test_commit_revertOnMaxPriceZero() public {
        SignalCommitment.CommitParams memory p = _defaultParams(300);
        p.maxPriceBps = 0;

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.InvalidMaxPriceBps.selector, 0));
        vm.prank(genius);
        sc.commit(p);
    }

    function test_commit_revertOnMaxPriceTooHigh() public {
        SignalCommitment.CommitParams memory p = _defaultParams(301);
        p.maxPriceBps = 5001;

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.InvalidMaxPriceBps.selector, 5001));
        vm.prank(genius);
        sc.commit(p);
    }

    function test_commit_maxPriceExactMaximum() public {
        SignalCommitment.CommitParams memory p = _defaultParams(302);
        p.maxPriceBps = 5000;

        vm.prank(genius);
        sc.commit(p);

        assertTrue(sc.signalExists(302));
    }

    function test_commit_maxPriceExactMinimum() public {
        SignalCommitment.CommitParams memory p = _defaultParams(303);
        p.maxPriceBps = 1;

        vm.prank(genius);
        sc.commit(p);

        assertTrue(sc.signalExists(303));
    }

    // ─── Tests: Revert on expired signal
    // ─────────────────────────────────

    function test_commit_revertOnExpiredSignal() public {
        SignalCommitment.CommitParams memory p = _defaultParams(400);
        p.expiresAt = block.timestamp; // equal to current time, not future

        vm.expectRevert(
            abi.encodeWithSelector(SignalCommitment.ExpirationInPast.selector, p.expiresAt, block.timestamp)
        );
        vm.prank(genius);
        sc.commit(p);
    }

    function test_commit_revertOnPastExpiration() public {
        SignalCommitment.CommitParams memory p = _defaultParams(401);
        p.expiresAt = block.timestamp - 1;

        vm.expectRevert(
            abi.encodeWithSelector(SignalCommitment.ExpirationInPast.selector, p.expiresAt, block.timestamp)
        );
        vm.prank(genius);
        sc.commit(p);
    }

    // ─── Tests: Revert on empty encrypted blob
    // ──────────────────────────

    function test_commit_revertOnEmptyBlob() public {
        SignalCommitment.CommitParams memory p = _defaultParams(500);
        p.encryptedBlob = "";

        vm.expectRevert(SignalCommitment.EmptyEncryptedBlob.selector);
        vm.prank(genius);
        sc.commit(p);
    }

    // ─── Tests: Revert on zero commit hash
    // ───────────────────────────────

    function test_commit_revertOnZeroCommitHash() public {
        SignalCommitment.CommitParams memory p = _defaultParams(501);
        p.commitHash = bytes32(0);

        vm.expectRevert(SignalCommitment.ZeroCommitHash.selector);
        vm.prank(genius);
        sc.commit(p);
    }

    // ─── Tests: Void signal by genius
    // ────────────────────────────────────

    function test_voidSignal_success() public {
        _commitDefault(600);

        vm.prank(genius);
        sc.voidSignal(600);

        Signal memory sig = sc.getSignal(600);
        assertEq(uint8(sig.status), uint8(SignalStatus.Voided));
    }

    function test_voidSignal_emitsEvent() public {
        _commitDefault(601);

        vm.expectEmit(true, true, false, true);
        emit SignalCommitment.SignalVoided(601, genius);

        vm.prank(genius);
        sc.voidSignal(601);
    }

    // ─── Tests: Revert void by non-genius
    // ────────────────────────────────

    function test_voidSignal_revertByNonGenius() public {
        _commitDefault(700);

        address imposter = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.NotSignalGenius.selector, imposter, genius));
        vm.prank(imposter);
        sc.voidSignal(700);
    }

    // ─── Tests: Revert void on already purchased signal ──────────────────

    function test_voidSignal_revertOnPurchasedSignal() public {
        _commitDefault(800);

        // Set status to Purchased via authorized caller
        vm.prank(authorizedCaller);
        sc.updateStatus(800, SignalStatus.Purchased);

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalAlreadyPurchased.selector, 800));
        vm.prank(genius);
        sc.voidSignal(800);
    }

    function test_voidSignal_revertOnNonExistentSignal() public {
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalNotFound.selector, 999));
        vm.prank(genius);
        sc.voidSignal(999);
    }

    // ─── Tests: Update status by authorized caller
    // ───────────────────────

    function test_updateStatus_byAuthorizedCaller() public {
        _commitDefault(900);

        vm.prank(authorizedCaller);
        sc.updateStatus(900, SignalStatus.Purchased);

        Signal memory sig = sc.getSignal(900);
        assertEq(uint8(sig.status), uint8(SignalStatus.Purchased));
    }

    function test_updateStatus_emitsEvent() public {
        _commitDefault(901);

        vm.prank(authorizedCaller);
        sc.updateStatus(901, SignalStatus.Purchased);

        vm.expectEmit(true, false, false, true);
        emit SignalCommitment.SignalStatusUpdated(901, SignalStatus.Settled);

        vm.prank(authorizedCaller);
        sc.updateStatus(901, SignalStatus.Settled);
    }

    // ─── Tests: Revert update status by unauthorized caller ──────────────

    function test_updateStatus_revertByUnauthorizedCaller() public {
        _commitDefault(1000);

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.CallerNotAuthorized.selector, unauthorizedCaller));
        vm.prank(unauthorizedCaller);
        sc.updateStatus(1000, SignalStatus.Purchased);
    }

    function test_updateStatus_revertOnNonExistentSignal() public {
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalNotFound.selector, 1111));
        vm.prank(authorizedCaller);
        sc.updateStatus(1111, SignalStatus.Purchased);
    }

    // ─── Tests: View functions
    // ───────────────────────────────────────────

    function test_getSignal_revertsForNonExistent() public {
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalNotFound.selector, 2000));
        sc.getSignal(2000);
    }

    function test_getSignalGenius_returnsCorrectAddress() public {
        _commitDefault(2001);
        assertEq(sc.getSignalGenius(2001), genius);
    }

    function test_getSignalGenius_revertsForNonExistent() public {
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalNotFound.selector, 2002));
        sc.getSignalGenius(2002);
    }

    function test_isActive_trueForActiveSignal() public {
        _commitDefault(2003);
        assertTrue(sc.isActive(2003));
    }

    function test_isActive_falseForNonExistent() public {
        assertFalse(sc.isActive(2004));
    }

    function test_isActive_falseForVoidedSignal() public {
        _commitDefault(2005);
        vm.prank(genius);
        sc.voidSignal(2005);
        assertFalse(sc.isActive(2005));
    }

    function test_isActive_falseForExpiredSignal() public {
        _commitDefault(2006);
        // Warp time past expiration
        vm.warp(block.timestamp + 2 hours);
        assertFalse(sc.isActive(2006));
    }

    function test_signalExists_trueAfterCommit() public {
        _commitDefault(2007);
        assertTrue(sc.signalExists(2007));
    }

    function test_signalExists_falseBeforeCommit() public {
        assertFalse(sc.signalExists(2008));
    }

    // ─── Tests: setAuthorizedCaller
    // ──────────────────────────────────────

    function test_setAuthorizedCaller_onlyOwner() public {
        address newCaller = address(0xCAFE);
        sc.setAuthorizedCaller(newCaller, true);
        assertTrue(sc.authorizedCallers(newCaller));

        sc.setAuthorizedCaller(newCaller, false);
        assertFalse(sc.authorizedCallers(newCaller));
    }

    function test_setAuthorizedCaller_revertNonOwner() public {
        vm.prank(genius);
        vm.expectRevert();
        sc.setAuthorizedCaller(address(0xDEAD), true);
    }

    // ─── Tests: State transition coverage
    // ─────────────────────────────────

    function test_updateStatus_activeToPurchased() public {
        _commitDefault(3000);

        vm.prank(authorizedCaller);
        sc.updateStatus(3000, SignalStatus.Purchased);

        assertEq(uint8(sc.getSignal(3000).status), uint8(SignalStatus.Purchased));
    }

    function test_updateStatus_purchasedToSettled() public {
        _commitDefault(3001);

        vm.prank(authorizedCaller);
        sc.updateStatus(3001, SignalStatus.Purchased);

        vm.prank(authorizedCaller);
        sc.updateStatus(3001, SignalStatus.Settled);

        assertEq(uint8(sc.getSignal(3001).status), uint8(SignalStatus.Settled));
    }

    function test_updateStatus_activeToVoided() public {
        _commitDefault(3002);

        vm.prank(authorizedCaller);
        sc.updateStatus(3002, SignalStatus.Voided);

        assertEq(uint8(sc.getSignal(3002).status), uint8(SignalStatus.Voided));
    }

    function test_isActive_falseAfterPurchase() public {
        _commitDefault(3003);

        vm.prank(authorizedCaller);
        sc.updateStatus(3003, SignalStatus.Purchased);

        assertFalse(sc.isActive(3003));
    }

    function test_isActive_falseAfterSettled() public {
        _commitDefault(3004);

        vm.prank(authorizedCaller);
        sc.updateStatus(3004, SignalStatus.Purchased);
        vm.prank(authorizedCaller);
        sc.updateStatus(3004, SignalStatus.Settled);

        assertFalse(sc.isActive(3004));
    }

    function test_voidSignal_revertOnVoidedSignal() public {
        _commitDefault(3005);

        vm.prank(genius);
        sc.voidSignal(3005);

        // Voided signals are not Active, so voidSignal should revert
        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalAlreadyPurchased.selector, 3005));
        vm.prank(genius);
        sc.voidSignal(3005);
    }

    function test_voidSignal_revertOnSettledSignal() public {
        _commitDefault(3006);

        vm.prank(authorizedCaller);
        sc.updateStatus(3006, SignalStatus.Purchased);
        vm.prank(authorizedCaller);
        sc.updateStatus(3006, SignalStatus.Settled);

        vm.expectRevert(abi.encodeWithSelector(SignalCommitment.SignalAlreadyPurchased.selector, 3006));
        vm.prank(genius);
        sc.voidSignal(3006);
    }

    // ─── Tests: Invalid state transitions
    // ────────────────────────────────

    function test_updateStatus_revertActiveToSettled() public {
        _commitDefault(4000);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4000, SignalStatus.Active, SignalStatus.Settled
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4000, SignalStatus.Settled);
    }

    function test_updateStatus_revertSettledToActive() public {
        _commitDefault(4001);

        vm.prank(authorizedCaller);
        sc.updateStatus(4001, SignalStatus.Purchased);
        vm.prank(authorizedCaller);
        sc.updateStatus(4001, SignalStatus.Settled);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4001, SignalStatus.Settled, SignalStatus.Active
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4001, SignalStatus.Active);
    }

    function test_updateStatus_revertSettledToPurchased() public {
        _commitDefault(4002);

        vm.prank(authorizedCaller);
        sc.updateStatus(4002, SignalStatus.Purchased);
        vm.prank(authorizedCaller);
        sc.updateStatus(4002, SignalStatus.Settled);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4002, SignalStatus.Settled, SignalStatus.Purchased
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4002, SignalStatus.Purchased);
    }

    function test_updateStatus_revertVoidedToActive() public {
        _commitDefault(4003);

        vm.prank(authorizedCaller);
        sc.updateStatus(4003, SignalStatus.Voided);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4003, SignalStatus.Voided, SignalStatus.Active
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4003, SignalStatus.Active);
    }

    function test_updateStatus_revertVoidedToPurchased() public {
        _commitDefault(4004);

        vm.prank(authorizedCaller);
        sc.updateStatus(4004, SignalStatus.Voided);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4004, SignalStatus.Voided, SignalStatus.Purchased
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4004, SignalStatus.Purchased);
    }

    function test_updateStatus_revertPurchasedToActive() public {
        _commitDefault(4005);

        vm.prank(authorizedCaller);
        sc.updateStatus(4005, SignalStatus.Purchased);

        vm.expectRevert(
            abi.encodeWithSelector(
                SignalCommitment.InvalidStatusTransition.selector, 4005, SignalStatus.Purchased, SignalStatus.Active
            )
        );
        vm.prank(authorizedCaller);
        sc.updateStatus(4005, SignalStatus.Active);
    }

    function test_updateStatus_purchasedToVoided() public {
        _commitDefault(4006);

        vm.prank(authorizedCaller);
        sc.updateStatus(4006, SignalStatus.Purchased);
        vm.prank(authorizedCaller);
        sc.updateStatus(4006, SignalStatus.Voided);

        assertEq(uint8(sc.getSignal(4006).status), uint8(SignalStatus.Voided));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TrackRecord, VerifiedRecord} from "../src/TrackRecord.sol";

/// @notice Mock ZK verifier that can be configured to accept or reject proofs
contract MockZKVerifier {
    bool public shouldVerify;

    constructor(bool _shouldVerify) {
        shouldVerify = _shouldVerify;
    }

    function setShouldVerify(bool _val) external {
        shouldVerify = _val;
    }

    function verifyTrackRecordProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[106] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}

/// @title TrackRecordTest
/// @notice Tests for the TrackRecord on-chain proof storage contract
contract TrackRecordTest is Test {
    TrackRecord trackRecord;
    MockZKVerifier verifier;

    address owner;
    address genius1 = address(0xBEEF);
    address genius2 = address(0xCAFE);
    address nonOwner = address(0xDEAD);

    function setUp() public {
        owner = address(this);
        verifier = new MockZKVerifier(true);
        trackRecord = new TrackRecord(owner);
        trackRecord.setZKVerifier(address(verifier));
    }

    // ─── Helper: Build mock public signals ─────────────────────────────────

    function _buildPubSignals(
        uint256 signalCount,
        uint256 totalGain,
        uint256 totalLoss,
        uint256 favCount,
        uint256 unfavCount,
        uint256 voidCount
    ) internal pure returns (uint256[106] memory pubSignals) {
        pubSignals[100] = signalCount;
        pubSignals[101] = totalGain;
        pubSignals[102] = totalLoss;
        pubSignals[103] = favCount;
        pubSignals[104] = unfavCount;
        pubSignals[105] = voidCount;
    }

    function _defaultProof()
        internal
        pure
        returns (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC)
    {
        pA = [uint256(1), 2];
        pB = [[uint256(3), 4], [uint256(5), 6]];
        pC = [uint256(7), 8];
    }

    // ─── Admin Tests ───────────────────────────────────────────────────────

    function test_setZKVerifier_onlyOwner() public {
        address newVerifier = address(new MockZKVerifier(true));
        trackRecord.setZKVerifier(newVerifier);
        assertEq(address(trackRecord.zkVerifier()), newVerifier);
    }

    function test_setZKVerifier_reverts_nonOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        vm.prank(nonOwner);
        trackRecord.setZKVerifier(address(verifier));
    }

    function test_setZKVerifier_reverts_zeroAddress() public {
        vm.expectRevert(TrackRecord.ZeroAddress.selector);
        trackRecord.setZKVerifier(address(0));
    }

    function test_setZKVerifier_emitsEvent() public {
        address newVerifier = address(new MockZKVerifier(true));
        vm.expectEmit(true, false, false, false);
        emit TrackRecord.ZKVerifierUpdated(newVerifier);
        trackRecord.setZKVerifier(newVerifier);
    }

    // ─── Submit Tests ──────────────────────────────────────────────────────

    function test_submit_storesRecord() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 500e6, 200e6, 3, 1, 1);

        vm.prank(genius1);
        uint256 recordId = trackRecord.submit(pA, pB, pC, pubSignals);

        assertEq(recordId, 0);
        assertEq(trackRecord.recordCount(), 1);

        VerifiedRecord memory rec = trackRecord.getRecord(0);
        assertEq(rec.genius, genius1);
        assertEq(rec.signalCount, 5);
        assertEq(rec.totalGain, 500e6);
        assertEq(rec.totalLoss, 200e6);
        assertEq(rec.favCount, 3);
        assertEq(rec.unfavCount, 1);
        assertEq(rec.voidCount, 1);
        assertEq(rec.blockNumber, block.number);
        assertTrue(rec.proofHash != bytes32(0));
    }

    function test_submit_emitsEvent() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(10, 1000e6, 300e6, 7, 2, 1);

        vm.expectEmit(true, true, false, true);
        emit TrackRecord.TrackRecordSubmitted(
            0,
            genius1,
            10,
            1000e6,
            300e6,
            7,
            2,
            1,
            keccak256(abi.encodePacked(pA, pB, pC, pubSignals))
        );

        vm.prank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals);
    }

    function test_submit_multipleRecordsSameGenius() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals1 = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);
        uint256[106] memory pubSignals2 = _buildPubSignals(10, 500e6, 200e6, 7, 2, 1);

        vm.startPrank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals1);

        // Different signals = different proof hash
        trackRecord.submit(pA, pB, pC, pubSignals2);
        vm.stopPrank();

        assertEq(trackRecord.recordCount(), 2);
        assertEq(trackRecord.getRecordCount(genius1), 2);

        uint256[] memory ids = trackRecord.getRecordIds(genius1);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    function test_submit_multipleGeniuses() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals1 = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);
        uint256[106] memory pubSignals2 = _buildPubSignals(10, 500e6, 200e6, 7, 2, 1);

        vm.prank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals1);

        vm.prank(genius2);
        trackRecord.submit(pA, pB, pC, pubSignals2);

        assertEq(trackRecord.getRecordCount(genius1), 1);
        assertEq(trackRecord.getRecordCount(genius2), 1);

        VerifiedRecord memory rec1 = trackRecord.getRecord(0);
        VerifiedRecord memory rec2 = trackRecord.getRecord(1);
        assertEq(rec1.genius, genius1);
        assertEq(rec2.genius, genius2);
    }

    // ─── Revert Tests ──────────────────────────────────────────────────────

    function test_submit_reverts_verifierNotSet() public {
        TrackRecord fresh = new TrackRecord(owner);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);

        vm.expectRevert(TrackRecord.VerifierNotSet.selector);
        fresh.submit(pA, pB, pC, pubSignals);
    }

    function test_submit_reverts_proofFailed() public {
        verifier.setShouldVerify(false);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);

        vm.expectRevert(TrackRecord.ProofVerificationFailed.selector);
        trackRecord.submit(pA, pB, pC, pubSignals);
    }

    function test_submit_reverts_duplicateProof() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);

        vm.prank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals);

        vm.expectRevert(TrackRecord.DuplicateProof.selector);
        vm.prank(genius2); // Even different sender can't reuse same proof
        trackRecord.submit(pA, pB, pC, pubSignals);
    }

    // ─── View Tests ────────────────────────────────────────────────────────

    function test_getRecordCount_empty() public view {
        assertEq(trackRecord.getRecordCount(genius1), 0);
    }

    function test_getRecordIds_empty() public view {
        uint256[] memory ids = trackRecord.getRecordIds(genius1);
        assertEq(ids.length, 0);
    }

    function test_getRecord_nonexistent() public view {
        VerifiedRecord memory rec = trackRecord.getRecord(999);
        assertEq(rec.genius, address(0));
        assertEq(rec.signalCount, 0);
    }

    function test_usedProofHashes_tracked() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);
        bytes32 proofHash = keccak256(abi.encodePacked(pA, pB, pC, pubSignals));

        assertFalse(trackRecord.usedProofHashes(proofHash));

        vm.prank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals);

        assertTrue(trackRecord.usedProofHashes(proofHash));
    }

    // ─── Edge Cases ────────────────────────────────────────────────────────

    function test_submit_zeroStats() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(0, 0, 0, 0, 0, 0);

        vm.prank(genius1);
        uint256 recordId = trackRecord.submit(pA, pB, pC, pubSignals);

        VerifiedRecord memory rec = trackRecord.getRecord(recordId);
        assertEq(rec.signalCount, 0);
        assertEq(rec.totalGain, 0);
        assertEq(rec.totalLoss, 0);
    }

    function test_submit_maxSignals() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(20, 5000e6, 1000e6, 15, 3, 2);

        vm.prank(genius1);
        uint256 recordId = trackRecord.submit(pA, pB, pC, pubSignals);

        VerifiedRecord memory rec = trackRecord.getRecord(recordId);
        assertEq(rec.signalCount, 20);
        assertEq(rec.favCount, 15);
        assertEq(rec.unfavCount, 3);
        assertEq(rec.voidCount, 2);
    }

    function test_submit_incrementsRecordId() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();

        for (uint256 i = 0; i < 5; i++) {
            uint256[106] memory pubSignals = _buildPubSignals(i + 1, (i + 1) * 100e6, i * 50e6, i + 1, 0, 0);
            vm.prank(genius1);
            uint256 recordId = trackRecord.submit(pA, pB, pC, pubSignals);
            assertEq(recordId, i);
        }

        assertEq(trackRecord.recordCount(), 5);
    }

    function test_submit_recordsTimestamp() public {
        vm.warp(1700000000);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _defaultProof();
        uint256[106] memory pubSignals = _buildPubSignals(5, 100e6, 50e6, 3, 1, 1);

        vm.prank(genius1);
        trackRecord.submit(pA, pB, pC, pubSignals);

        VerifiedRecord memory rec = trackRecord.getRecord(0);
        assertEq(rec.submittedAt, 1700000000);
    }
}

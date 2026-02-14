// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {KeyRecovery} from "../src/KeyRecovery.sol";

contract KeyRecoveryTest is Test {
    KeyRecovery public kr;

    address public user1 = address(0xA1);
    address public user2 = address(0xA2);

    function setUp() public {
        kr = new KeyRecovery();
    }

    // ─── Tests: Store and retrieve recovery blob ─────────────────────────

    function test_storeAndRetrieve() public {
        bytes memory blob = hex"deadbeefcafebabe";

        vm.prank(user1);
        kr.storeRecoveryBlob(blob);

        bytes memory retrieved = kr.getRecoveryBlob(user1);
        assertEq(keccak256(retrieved), keccak256(blob));
    }

    function test_storeRecoveryBlob_emitsEvent() public {
        bytes memory blob = hex"1234";

        vm.expectEmit(true, false, false, true);
        emit KeyRecovery.RecoveryBlobStored(user1, block.timestamp);

        vm.prank(user1);
        kr.storeRecoveryBlob(blob);
    }

    function test_getRecoveryBlob_emptyForUnset() public view {
        bytes memory retrieved = kr.getRecoveryBlob(user1);
        assertEq(retrieved.length, 0);
    }

    // ─── Tests: Overwrite existing blob ──────────────────────────────────

    function test_overwriteExistingBlob() public {
        bytes memory blob1 = hex"aaaa";
        bytes memory blob2 = hex"bbbbbbbb";

        vm.prank(user1);
        kr.storeRecoveryBlob(blob1);

        vm.prank(user1);
        kr.storeRecoveryBlob(blob2);

        bytes memory retrieved = kr.getRecoveryBlob(user1);
        assertEq(keccak256(retrieved), keccak256(blob2));
        assertEq(retrieved.length, 4); // blob2 is 4 bytes
    }

    // ─── Tests: Different users have different blobs ─────────────────────

    function test_differentUsersHaveDifferentBlobs() public {
        bytes memory blob1 = hex"1111";
        bytes memory blob2 = hex"2222";

        vm.prank(user1);
        kr.storeRecoveryBlob(blob1);

        vm.prank(user2);
        kr.storeRecoveryBlob(blob2);

        bytes memory retrieved1 = kr.getRecoveryBlob(user1);
        bytes memory retrieved2 = kr.getRecoveryBlob(user2);

        assertEq(keccak256(retrieved1), keccak256(blob1));
        assertEq(keccak256(retrieved2), keccak256(blob2));
        assertTrue(keccak256(retrieved1) != keccak256(retrieved2));
    }

    // ─── Tests: Revert on empty blob ─────────────────────────────────────

    function test_storeRecoveryBlob_revertOnEmpty() public {
        vm.expectRevert(KeyRecovery.EmptyBlob.selector);
        vm.prank(user1);
        kr.storeRecoveryBlob("");
    }

    // ─── Tests: Large blob storage ───────────────────────────────────────

    function test_storeLargeBlob() public {
        // 1024 bytes blob
        bytes memory largeBlob = new bytes(1024);
        for (uint256 i = 0; i < 1024; i++) {
            largeBlob[i] = bytes1(uint8(i % 256));
        }

        vm.prank(user1);
        kr.storeRecoveryBlob(largeBlob);

        bytes memory retrieved = kr.getRecoveryBlob(user1);
        assertEq(retrieved.length, 1024);
        assertEq(keccak256(retrieved), keccak256(largeBlob));
    }
}

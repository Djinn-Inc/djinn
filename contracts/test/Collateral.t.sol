// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {Collateral} from "../src/Collateral.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract CollateralTest is Test {
    Collateral public col;
    MockUSDC public usdc;

    address public owner = address(this);
    address public genius = address(0xA1);
    address public authorizedCaller = address(0xA2);
    address public unauthorizedCaller = address(0xA3);
    address public recipient = address(0xA4);

    uint256 constant DEPOSIT_AMOUNT = 10_000e6; // 10,000 USDC

    function setUp() public {
        usdc = new MockUSDC();
        col = new Collateral(address(usdc), owner);
        col.setAuthorized(authorizedCaller, true);

        // Fund genius with USDC and approve collateral contract
        usdc.mint(genius, DEPOSIT_AMOUNT);
        vm.prank(genius);
        usdc.approve(address(col), type(uint256).max);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _depositAs(address depositor, uint256 amount) internal {
        vm.prank(depositor);
        col.deposit(amount);
    }

    // ─── Tests: Deposit and check balance ────────────────────────────────

    function test_deposit_success() public {
        _depositAs(genius, 5_000e6);

        assertEq(col.getDeposit(genius), 5_000e6);
        assertEq(col.getAvailable(genius), 5_000e6);
        assertEq(col.getLocked(genius), 0);
        assertEq(usdc.balanceOf(address(col)), 5_000e6);
    }

    function test_deposit_multipleDeposits() public {
        _depositAs(genius, 3_000e6);
        _depositAs(genius, 2_000e6);

        assertEq(col.getDeposit(genius), 5_000e6);
    }

    function test_deposit_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit Collateral.Deposited(genius, 5_000e6);

        _depositAs(genius, 5_000e6);
    }

    function test_deposit_revertOnZeroAmount() public {
        vm.expectRevert(Collateral.ZeroAmount.selector);
        _depositAs(genius, 0);
    }

    // ─── Tests: Withdraw free collateral ─────────────────────────────────

    function test_withdraw_freeCollateral() public {
        _depositAs(genius, 5_000e6);

        vm.prank(genius);
        col.withdraw(3_000e6);

        assertEq(col.getDeposit(genius), 2_000e6);
        assertEq(usdc.balanceOf(genius), 8_000e6); // 10k - 5k deposit + 3k withdraw = 8k
    }

    function test_withdraw_entireFreeBalance() public {
        _depositAs(genius, 5_000e6);

        vm.prank(genius);
        col.withdraw(5_000e6);

        assertEq(col.getDeposit(genius), 0);
        assertEq(usdc.balanceOf(genius), DEPOSIT_AMOUNT);
    }

    function test_withdraw_emitsEvent() public {
        _depositAs(genius, 5_000e6);

        vm.expectEmit(true, false, false, true);
        emit Collateral.Withdrawn(genius, 2_000e6);

        vm.prank(genius);
        col.withdraw(2_000e6);
    }

    function test_withdraw_revertOnZeroAmount() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(Collateral.ZeroAmount.selector);
        vm.prank(genius);
        col.withdraw(0);
    }

    // ─── Tests: Revert withdraw locked collateral ────────────────────────

    function test_withdraw_revertWhenLockedExceedsAvailable() public {
        _depositAs(genius, 5_000e6);

        // Lock 4k of the 5k deposit
        vm.prank(authorizedCaller);
        col.lock(1, genius, 4_000e6);

        // Available = 5k - 4k = 1k. Trying to withdraw 2k should fail.
        vm.expectRevert(
            abi.encodeWithSelector(Collateral.WithdrawalExceedsAvailable.selector, 1_000e6, 2_000e6)
        );
        vm.prank(genius);
        col.withdraw(2_000e6);
    }

    function test_withdraw_succeedsForFreePortionWhenPartiallyLocked() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 3_000e6);

        // Available = 5k - 3k = 2k, withdraw exactly 2k
        vm.prank(genius);
        col.withdraw(2_000e6);

        assertEq(col.getDeposit(genius), 3_000e6);
        assertEq(col.getLocked(genius), 3_000e6);
        assertEq(col.getAvailable(genius), 0);
    }

    // ─── Tests: Lock by authorized caller ────────────────────────────────

    function test_lock_byAuthorizedCaller() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);

        assertEq(col.getLocked(genius), 2_000e6);
        assertEq(col.getAvailable(genius), 3_000e6);
        assertEq(col.getSignalLock(genius, 1), 2_000e6);
    }

    function test_lock_emitsEvent() public {
        _depositAs(genius, 5_000e6);

        vm.expectEmit(true, true, false, true);
        emit Collateral.Locked(1, genius, 2_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);
    }

    function test_lock_multipleSignals() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 1_000e6);
        vm.prank(authorizedCaller);
        col.lock(2, genius, 1_500e6);

        assertEq(col.getLocked(genius), 2_500e6);
        assertEq(col.getAvailable(genius), 2_500e6);
        assertEq(col.getSignalLock(genius, 1), 1_000e6);
        assertEq(col.getSignalLock(genius, 2), 1_500e6);
    }

    // ─── Tests: Revert lock by unauthorized caller ───────────────────────

    function test_lock_revertByUnauthorizedCaller() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(Collateral.Unauthorized.selector);
        vm.prank(unauthorizedCaller);
        col.lock(1, genius, 1_000e6);
    }

    // ─── Tests: Revert lock exceeding available ──────────────────────────

    function test_lock_revertExceedingAvailable() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(
            abi.encodeWithSelector(Collateral.InsufficientFreeCollateral.selector, 5_000e6, 6_000e6)
        );
        vm.prank(authorizedCaller);
        col.lock(1, genius, 6_000e6);
    }

    function test_lock_revertOnZeroAmount() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(Collateral.ZeroAmount.selector);
        vm.prank(authorizedCaller);
        col.lock(1, genius, 0);
    }

    // ─── Tests: Release by authorized caller ─────────────────────────────

    function test_release_byAuthorizedCaller() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 3_000e6);

        vm.prank(authorizedCaller);
        col.release(1, genius, 2_000e6);

        assertEq(col.getLocked(genius), 1_000e6);
        assertEq(col.getAvailable(genius), 4_000e6);
        assertEq(col.getSignalLock(genius, 1), 1_000e6);
    }

    function test_release_fullAmount() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 3_000e6);

        vm.prank(authorizedCaller);
        col.release(1, genius, 3_000e6);

        assertEq(col.getLocked(genius), 0);
        assertEq(col.getAvailable(genius), 5_000e6);
        assertEq(col.getSignalLock(genius, 1), 0);
    }

    function test_release_emitsEvent() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 3_000e6);

        vm.expectEmit(true, true, false, true);
        emit Collateral.Released(1, genius, 1_000e6);

        vm.prank(authorizedCaller);
        col.release(1, genius, 1_000e6);
    }

    function test_release_revertExceedingSignalLock() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);

        vm.expectRevert(
            abi.encodeWithSelector(Collateral.InsufficientSignalLock.selector, 2_000e6, 3_000e6)
        );
        vm.prank(authorizedCaller);
        col.release(1, genius, 3_000e6);
    }

    function test_release_revertByUnauthorized() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);

        vm.expectRevert(Collateral.Unauthorized.selector);
        vm.prank(unauthorizedCaller);
        col.release(1, genius, 1_000e6);
    }

    function test_release_revertOnZeroAmount() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);

        vm.expectRevert(Collateral.ZeroAmount.selector);
        vm.prank(authorizedCaller);
        col.release(1, genius, 0);
    }

    // ─── Tests: Slash by authorized caller ───────────────────────────────

    function test_slash_partialSlash() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.slash(genius, 2_000e6, recipient);

        assertEq(col.getDeposit(genius), 3_000e6);
        assertEq(usdc.balanceOf(recipient), 2_000e6);
    }

    function test_slash_fullSlash() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.slash(genius, 5_000e6, recipient);

        assertEq(col.getDeposit(genius), 0);
        assertEq(usdc.balanceOf(recipient), 5_000e6);
    }

    function test_slash_exceedingDeposit_capsToAvailable() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.slash(genius, 8_000e6, recipient);

        // Should cap at 5k (all deposits)
        assertEq(col.getDeposit(genius), 0);
        assertEq(usdc.balanceOf(recipient), 5_000e6);
    }

    function test_slash_reducesLockedIfNecessary() public {
        _depositAs(genius, 5_000e6);

        // Lock 4k
        vm.prank(authorizedCaller);
        col.lock(1, genius, 4_000e6);

        // Slash 3k -> deposits become 2k, locked was 4k but should cap to deposits=2k
        vm.prank(authorizedCaller);
        col.slash(genius, 3_000e6, recipient);

        assertEq(col.getDeposit(genius), 2_000e6);
        assertEq(col.getLocked(genius), 2_000e6); // capped to deposits
        assertEq(usdc.balanceOf(recipient), 3_000e6);
    }

    function test_slash_emitsEvent() public {
        _depositAs(genius, 5_000e6);

        vm.expectEmit(true, false, true, true);
        emit Collateral.Slashed(genius, 2_000e6, recipient);

        vm.prank(authorizedCaller);
        col.slash(genius, 2_000e6, recipient);
    }

    function test_slash_revertByUnauthorized() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(Collateral.Unauthorized.selector);
        vm.prank(unauthorizedCaller);
        col.slash(genius, 1_000e6, recipient);
    }

    function test_slash_revertOnZeroAmount() public {
        _depositAs(genius, 5_000e6);

        vm.expectRevert(Collateral.ZeroAmount.selector);
        vm.prank(authorizedCaller);
        col.slash(genius, 0, recipient);
    }

    // ─── Tests: getAvailable returns correct value ───────────────────────

    function test_getAvailable_noLocks() public {
        _depositAs(genius, 5_000e6);
        assertEq(col.getAvailable(genius), 5_000e6);
    }

    function test_getAvailable_withLocks() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 2_000e6);

        assertEq(col.getAvailable(genius), 3_000e6);
    }

    function test_getAvailable_fullyLocked() public {
        _depositAs(genius, 5_000e6);

        vm.prank(authorizedCaller);
        col.lock(1, genius, 5_000e6);

        assertEq(col.getAvailable(genius), 0);
    }

    function test_getAvailable_zeroDeposit() public {
        assertEq(col.getAvailable(genius), 0);
    }

    // ─── Tests: setAuthorized ────────────────────────────────────────────

    function test_setAuthorized_onlyOwner() public {
        address newAuth = address(0xBEEF);
        col.setAuthorized(newAuth, true);
        assertTrue(col.authorized(newAuth));

        col.setAuthorized(newAuth, false);
        assertFalse(col.authorized(newAuth));
    }

    function test_setAuthorized_revertNonOwner() public {
        vm.prank(genius);
        vm.expectRevert();
        col.setAuthorized(address(0xDEAD), true);
    }
}

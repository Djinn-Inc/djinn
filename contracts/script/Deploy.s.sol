// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../test/MockUSDC.sol";
import {Account as DjinnAccount} from "../src/Account.sol";
import {CreditLedger} from "../src/CreditLedger.sol";
import {SignalCommitment} from "../src/SignalCommitment.sol";
import {ZKVerifier} from "../src/ZKVerifier.sol";
import {KeyRecovery} from "../src/KeyRecovery.sol";
import {Collateral} from "../src/Collateral.sol";
import {Escrow} from "../src/Escrow.sol";
import {Audit} from "../src/Audit.sol";
import {Groth16AuditVerifier} from "../src/Groth16AuditVerifier.sol";
import {Groth16TrackRecordVerifier} from "../src/Groth16TrackRecordVerifier.sol";
import {TrackRecord} from "../src/TrackRecord.sol";

/// @title Deploy
/// @notice Deploys the full Djinn Protocol to a testnet (Base Sepolia).
///         Deploys MockUSDC, all protocol contracts, wires permissions, and mints test USDC.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // ─── 1. Deploy MockUSDC
        // ─────────────────────────────────────────
        MockUSDC usdc_ = new MockUSDC();
        console.log("MockUSDC:", address(usdc_));

        // ─── 2. Deploy independent contracts
        // ────────────────────────────
        DjinnAccount acct_ = new DjinnAccount(deployer);
        console.log("Account:", address(acct_));

        CreditLedger cl_ = new CreditLedger(deployer);
        console.log("CreditLedger:", address(cl_));

        SignalCommitment sc_ = new SignalCommitment(deployer);
        console.log("SignalCommitment:", address(sc_));

        ZKVerifier zk_ = new ZKVerifier(deployer);
        console.log("ZKVerifier:", address(zk_));

        KeyRecovery kr_ = new KeyRecovery();
        console.log("KeyRecovery:", address(kr_));

        // ─── 3. Deploy USDC-dependent contracts
        // ─────────────────────────
        Collateral coll_ = new Collateral(address(usdc_), deployer);
        console.log("Collateral:", address(coll_));

        Escrow esc_ = new Escrow(address(usdc_), deployer);
        console.log("Escrow:", address(esc_));

        // ─── 4. Deploy Audit
        // ────────────────────────────────────────────
        Audit aud_ = new Audit(deployer);
        console.log("Audit:", address(aud_));

        // ─── 5. Deploy Groth16 verifiers
        // ────────────────────────────────
        Groth16AuditVerifier audVerifier_ = new Groth16AuditVerifier();
        console.log("Groth16AuditVerifier:", address(audVerifier_));

        Groth16TrackRecordVerifier trVerifier_ = new Groth16TrackRecordVerifier();
        console.log("Groth16TrackRecordVerifier:", address(trVerifier_));

        // ─── 6. Wire contracts
        // ──────────────────────────────────────────

        // Audit -> all protocol contracts + treasury
        aud_.setEscrow(address(esc_));
        aud_.setCollateral(address(coll_));
        aud_.setCreditLedger(address(cl_));
        aud_.setAccount(address(acct_));
        aud_.setSignalCommitment(address(sc_));
        aud_.setProtocolTreasury(deployer); // deployer receives protocol fees for testing

        // Escrow -> protocol contracts + audit
        esc_.setSignalCommitment(address(sc_));
        esc_.setCollateral(address(coll_));
        esc_.setCreditLedger(address(cl_));
        esc_.setAccount(address(acct_));
        esc_.setAuditContract(address(aud_));

        // Collateral: authorize Escrow + Audit to lock/release/slash
        coll_.setAuthorized(address(esc_), true);
        coll_.setAuthorized(address(aud_), true);

        // CreditLedger: authorize Escrow + Audit to mint/burn credits
        cl_.setAuthorizedCaller(address(esc_), true);
        cl_.setAuthorizedCaller(address(aud_), true);

        // Account: authorize Escrow + Audit to record purchases and settle
        acct_.setAuthorizedCaller(address(esc_), true);
        acct_.setAuthorizedCaller(address(aud_), true);

        // SignalCommitment: authorize Escrow to update signal status
        sc_.setAuthorizedCaller(address(esc_), true);

        // ZKVerifier: point to deployed Groth16 verifier contracts
        zk_.setAuditVerifier(address(audVerifier_));
        zk_.setTrackRecordVerifier(address(trVerifier_));

        // ─── 6b. Deploy and wire TrackRecord
        // ──────────────────────────────
        TrackRecord tr_ = new TrackRecord(deployer);
        tr_.setZKVerifier(address(zk_));
        console.log("TrackRecord:", address(tr_));

        // ─── 7. Mint test USDC to deployer
        // ──────────────────────────────
        usdc_.mint(deployer, 1_000_000 * 1e6); // 1M USDC
        console.log("Minted 1,000,000 USDC to deployer");

        vm.stopBroadcast();

        // ─── Summary
        // ────────────────────────────────────────────────────
        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("Copy these to your .env files:");
        console.log("");
        console.log("NEXT_PUBLIC_USDC_ADDRESS=", address(usdc_));
        console.log("NEXT_PUBLIC_SIGNAL_COMMITMENT_ADDRESS=", address(sc_));
        console.log("NEXT_PUBLIC_ESCROW_ADDRESS=", address(esc_));
        console.log("NEXT_PUBLIC_COLLATERAL_ADDRESS=", address(coll_));
        console.log("NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS=", address(cl_));
        console.log("NEXT_PUBLIC_ACCOUNT_ADDRESS=", address(acct_));
        console.log("AUDIT_ADDRESS=", address(aud_));
        console.log("ZK_VERIFIER_ADDRESS=", address(zk_));
        console.log("KEY_RECOVERY_ADDRESS=", address(kr_));
        console.log("NEXT_PUBLIC_TRACK_RECORD_ADDRESS=", address(tr_));
    }
}

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
/// @notice Deploys the full Djinn Protocol to Base (Sepolia testnet or mainnet).
///         On testnet, deploys MockUSDC and mints test tokens.
///         On mainnet, uses the real USDC contract at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
contract Deploy is Script {
    /// @dev Base mainnet USDC (Circle's official deployment)
    address constant BASE_MAINNET_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        bool isMainnet = block.chainid == 8453;

        vm.startBroadcast(deployerKey);

        // ─── 1. USDC: deploy mock on testnet, use real on mainnet
        // ─────────────────────────────────────────
        address usdcAddr;
        if (isMainnet) {
            usdcAddr = BASE_MAINNET_USDC;
            console.log("Using real USDC:", usdcAddr);
        } else {
            MockUSDC usdc_ = new MockUSDC();
            usdcAddr = address(usdc_);
            console.log("MockUSDC:", usdcAddr);
        }

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
        Collateral coll_ = new Collateral(usdcAddr, deployer);
        console.log("Collateral:", address(coll_));

        Escrow esc_ = new Escrow(usdcAddr, deployer);
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

        // ─── 7. Verify wiring
        // ──────────────────────────────────────────
        require(address(aud_.escrow()) == address(esc_), "Audit.escrow not wired");
        require(address(aud_.collateral()) == address(coll_), "Audit.collateral not wired");
        require(address(aud_.creditLedger()) == address(cl_), "Audit.creditLedger not wired");
        require(address(aud_.account()) == address(acct_), "Audit.account not wired");
        require(address(aud_.signalCommitment()) == address(sc_), "Audit.signalCommitment not wired");
        require(address(esc_.signalCommitment()) == address(sc_), "Escrow.signalCommitment not wired");
        require(address(esc_.collateral()) == address(coll_), "Escrow.collateral not wired");
        require(address(esc_.creditLedger()) == address(cl_), "Escrow.creditLedger not wired");
        require(address(esc_.account()) == address(acct_), "Escrow.account not wired");
        require(esc_.auditContract() == address(aud_), "Escrow.auditContract not wired");
        require(coll_.authorized(address(esc_)), "Collateral: Escrow not authorized");
        require(coll_.authorized(address(aud_)), "Collateral: Audit not authorized");
        require(cl_.authorizedCallers(address(esc_)), "CreditLedger: Escrow not authorized");
        require(cl_.authorizedCallers(address(aud_)), "CreditLedger: Audit not authorized");
        require(acct_.authorizedCallers(address(esc_)), "Account: Escrow not authorized");
        require(acct_.authorizedCallers(address(aud_)), "Account: Audit not authorized");
        require(zk_.auditVerifier() == address(audVerifier_), "ZKVerifier.auditVerifier not wired");
        require(zk_.trackRecordVerifier() == address(trVerifier_), "ZKVerifier.trackRecordVerifier not wired");
        console.log("All contract wiring verified");

        // ─── 8. Mint test USDC to deployer (testnet only)
        // ──────────────────────────────
        if (!isMainnet) {
            MockUSDC(usdcAddr).mint(deployer, 1_000_000 * 1e6); // 1M USDC
            console.log("Minted 1,000,000 USDC to deployer");
        } else {
            console.log("Mainnet: skipping USDC mint (use real USDC)");
        }

        vm.stopBroadcast();

        // ─── Summary
        // ────────────────────────────────────────────────────
        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("Copy these to your .env files:");
        console.log("");
        console.log("NEXT_PUBLIC_USDC_ADDRESS=", usdcAddr);
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

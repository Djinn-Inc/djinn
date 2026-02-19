import { test, expect } from "@playwright/test";
import { ethers } from "ethers";

/**
 * On-chain write smoke tests — full lifecycle tests that actually
 * send transactions on Base Sepolia. Requires funded wallets.
 *
 * These tests auto-skip if the test wallet has no ETH (run them
 * after funding 0x68fc8eeC9E5551d4c93a89b6d861f0a05e0A2A1d).
 */

const RPC_URL = "https://sepolia.base.org";

const ADDRESSES = {
  signalCommitment: "0x4675613f4aC6329D294605a56f2AAf04B0cc1f7d",
  escrow: "0x83DcE21BA5875433Bc46e5eAC91e2B15cfA5B002",
  collateral: "0x436b9246F5eE53835df6AA68CdEeaE02514C0De6",
  creditLedger: "0x1a3174C715D832b865269fD44beBd742922BC017",
  account: "0x8fF0e9aAAb1206eb2C6087deE264e5EFB3EaDB4B",
  usdc: "0xEd57eC96889cDd3Ad1a8488E3fE87D3B711190CB",
  trackRecord: "0xD1dA1E9258B042b8309A1278BaACe16B1D99C423",
  keyRecovery: "0xbc88df681d3d40b3977e3693385f643166b7f54a",
};

const E2E_PRIVATE_KEY =
  "0x7bdee6a417b39392bfc78a3cf75cc2e726d4d42c7de68f91cd40654740232471";

let provider: ethers.JsonRpcProvider;
let wallet: ethers.Wallet;
let hasFunds: boolean;

test.beforeAll(async () => {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(E2E_PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  hasFunds = balance > ethers.parseEther("0.001");

  if (!hasFunds) {
    console.log(
      `Skipping on-chain write tests: wallet ${wallet.address} has ${ethers.formatEther(balance)} ETH (need >0.001)`,
    );
  }
});

// ─────────────────────────────────────────────
// USDC mint & transfer
// ─────────────────────────────────────────────

test.describe("USDC operations", () => {
  test("mint USDC to test wallet", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const usdc = new ethers.Contract(
      ADDRESSES.usdc,
      [
        "function mint(address to, uint256 amount) external",
        "function balanceOf(address) view returns (uint256)",
      ],
      wallet,
    );

    const balanceBefore = await usdc.balanceOf(wallet.address);
    const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC

    const tx = await usdc.mint(wallet.address, mintAmount);
    await tx.wait();

    const balanceAfter = await usdc.balanceOf(wallet.address);
    expect(balanceAfter - balanceBefore).toBe(mintAmount);
  });

  test("approve USDC to Escrow", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const usdc = new ethers.Contract(
      ADDRESSES.usdc,
      [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ],
      wallet,
    );

    const amount = ethers.parseUnits("500", 6); // 500 USDC
    const tx = await usdc.approve(ADDRESSES.escrow, amount);
    await tx.wait();

    const allowance = await usdc.allowance(wallet.address, ADDRESSES.escrow);
    expect(allowance).toBeGreaterThanOrEqual(amount);
  });

  test("approve USDC to Collateral", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const usdc = new ethers.Contract(
      ADDRESSES.usdc,
      [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ],
      wallet,
    );

    const amount = ethers.parseUnits("500", 6);
    const tx = await usdc.approve(ADDRESSES.collateral, amount);
    await tx.wait();

    const allowance = await usdc.allowance(
      wallet.address,
      ADDRESSES.collateral,
    );
    expect(allowance).toBeGreaterThanOrEqual(amount);
  });
});

// ─────────────────────────────────────────────
// Escrow deposit/withdraw
// ─────────────────────────────────────────────

test.describe("Escrow deposit/withdraw", () => {
  test("deposit USDC into Escrow", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const escrow = new ethers.Contract(
      ADDRESSES.escrow,
      [
        "function deposit(uint256 amount) external",
        "function getBalance(address) view returns (uint256)",
      ],
      wallet,
    );

    const depositAmount = ethers.parseUnits("100", 6);
    const balanceBefore = await escrow.getBalance(wallet.address);

    const tx = await escrow.deposit(depositAmount);
    await tx.wait();

    const balanceAfter = await escrow.getBalance(wallet.address);
    expect(balanceAfter - balanceBefore).toBe(depositAmount);
  });

  test("withdraw USDC from Escrow", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const escrow = new ethers.Contract(
      ADDRESSES.escrow,
      [
        "function withdraw(uint256 amount) external",
        "function getBalance(address) view returns (uint256)",
      ],
      wallet,
    );

    const balance = await escrow.getBalance(wallet.address);
    test.skip(balance === 0n, "No escrow balance to withdraw");

    const withdrawAmount =
      balance > ethers.parseUnits("10", 6)
        ? ethers.parseUnits("10", 6)
        : balance;
    const tx = await escrow.withdraw(withdrawAmount);
    await tx.wait();

    const balanceAfter = await escrow.getBalance(wallet.address);
    expect(balance - balanceAfter).toBe(withdrawAmount);
  });
});

// ─────────────────────────────────────────────
// Collateral deposit/withdraw
// ─────────────────────────────────────────────

test.describe("Collateral deposit/withdraw", () => {
  test("deposit USDC as collateral", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const coll = new ethers.Contract(
      ADDRESSES.collateral,
      [
        "function deposit(uint256 amount) external",
        "function getDeposit(address) view returns (uint256)",
        "function getAvailable(address) view returns (uint256)",
      ],
      wallet,
    );

    const depositAmount = ethers.parseUnits("100", 6);
    const depositBefore = await coll.getDeposit(wallet.address);

    const tx = await coll.deposit(depositAmount);
    await tx.wait();

    const depositAfter = await coll.getDeposit(wallet.address);
    expect(depositAfter - depositBefore).toBe(depositAmount);

    // Available should equal deposit (nothing locked)
    const available = await coll.getAvailable(wallet.address);
    expect(available).toBe(depositAfter);
  });

  test("withdraw collateral", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const coll = new ethers.Contract(
      ADDRESSES.collateral,
      [
        "function withdraw(uint256 amount) external",
        "function getDeposit(address) view returns (uint256)",
        "function getAvailable(address) view returns (uint256)",
      ],
      wallet,
    );

    const available = await coll.getAvailable(wallet.address);
    test.skip(available === 0n, "No collateral to withdraw");

    const withdrawAmount =
      available > ethers.parseUnits("10", 6)
        ? ethers.parseUnits("10", 6)
        : available;
    const tx = await coll.withdraw(withdrawAmount);
    await tx.wait();

    const availableAfter = await coll.getAvailable(wallet.address);
    expect(available - availableAfter).toBe(withdrawAmount);
  });
});

// ─────────────────────────────────────────────
// Signal commitment
// ─────────────────────────────────────────────

test.describe("Signal commitment", () => {
  test("commit a test signal on-chain", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    // First ensure collateral is deposited
    const coll = new ethers.Contract(
      ADDRESSES.collateral,
      ["function getAvailable(address) view returns (uint256)"],
      wallet,
    );
    const available = await coll.getAvailable(wallet.address);
    test.skip(
      available < ethers.parseUnits("10", 6),
      "Insufficient collateral — deposit first",
    );

    const sc = new ethers.Contract(
      ADDRESSES.signalCommitment,
      [
        'function commit((uint256 signalId, bytes encryptedBlob, bytes32 commitHash, string sport, uint256 maxPriceBps, uint256 slaMultiplierBps, uint256 maxNotional, uint256 expiresAt, string[] decoyLines, string[] availableSportsbooks) p) external',
        "function signalExists(uint256) view returns (bool)",
        "function isActive(uint256) view returns (bool)",
      ],
      wallet,
    );

    // Generate random signal ID
    const signalId = BigInt(
      "0x" + ethers.hexlify(ethers.randomBytes(32)).slice(2),
    );

    // Create minimal encrypted blob
    const blob = ethers.toUtf8Bytes("test-encrypted-blob-e2e");
    const commitHash = ethers.keccak256(blob);

    // 10 decoy lines
    const decoyLines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        sport: "basketball_nba",
        event_id: `test-${i}`,
        home_team: "Team A",
        away_team: "Team B",
        market: "spreads",
        line: -3.5 + i * 0.5,
        side: "Team A",
      }),
    );

    const params = {
      signalId,
      encryptedBlob: blob,
      commitHash,
      sport: "basketball_nba",
      maxPriceBps: 100, // 1%
      slaMultiplierBps: 20000, // 200%
      maxNotional: ethers.parseUnits("5", 6), // $5 USDC
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400), // 24h
      decoyLines,
      availableSportsbooks: ["DraftKings", "FanDuel"],
    };

    const tx = await sc.commit(params);
    const receipt = await tx.wait();
    expect(receipt!.status).toBe(1);

    // Verify signal exists and is active
    const exists = await sc.signalExists(signalId);
    expect(exists).toBe(true);

    const active = await sc.isActive(signalId);
    expect(active).toBe(true);
  });
});

// ─────────────────────────────────────────────
// KeyRecovery store/retrieve
// ─────────────────────────────────────────────

test.describe("KeyRecovery", () => {
  test("store and retrieve recovery blob", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const kr = new ethers.Contract(
      ADDRESSES.keyRecovery,
      [
        "function storeRecoveryBlob(bytes blob) external",
        "function getRecoveryBlob(address) view returns (bytes)",
      ],
      wallet,
    );

    // Store a test blob
    const testBlob = ethers.toUtf8Bytes(
      JSON.stringify({
        version: 1,
        signals: [{ signalId: "e2e-test", preimage: "abc123" }],
      }),
    );

    const tx = await kr.storeRecoveryBlob(testBlob);
    await tx.wait();

    // Retrieve it
    const retrieved = await kr.getRecoveryBlob(wallet.address);
    const decoded = ethers.toUtf8String(retrieved);
    const parsed = JSON.parse(decoded);

    expect(parsed.version).toBe(1);
    expect(parsed.signals).toHaveLength(1);
    expect(parsed.signals[0].signalId).toBe("e2e-test");
  });

  test("overwriting recovery blob succeeds", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const kr = new ethers.Contract(
      ADDRESSES.keyRecovery,
      [
        "function storeRecoveryBlob(bytes blob) external",
        "function getRecoveryBlob(address) view returns (bytes)",
      ],
      wallet,
    );

    // Store updated blob
    const newBlob = ethers.toUtf8Bytes(
      JSON.stringify({
        version: 1,
        signals: [
          { signalId: "e2e-test-1", preimage: "abc" },
          { signalId: "e2e-test-2", preimage: "def" },
        ],
      }),
    );

    const tx = await kr.storeRecoveryBlob(newBlob);
    await tx.wait();

    const retrieved = await kr.getRecoveryBlob(wallet.address);
    const parsed = JSON.parse(ethers.toUtf8String(retrieved));
    expect(parsed.signals).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
// Edge cases — expected failures
// ─────────────────────────────────────────────

test.describe("Expected failure scenarios", () => {
  test("escrow withdraw more than balance reverts", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const escrow = new ethers.Contract(
      ADDRESSES.escrow,
      [
        "function withdraw(uint256 amount) external",
        "function getBalance(address) view returns (uint256)",
      ],
      wallet,
    );

    const balance = await escrow.getBalance(wallet.address);
    const tooMuch = balance + ethers.parseUnits("1000000", 6);

    await expect(escrow.withdraw(tooMuch)).rejects.toThrow();
  });

  test("collateral withdraw more than available reverts", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    const coll = new ethers.Contract(
      ADDRESSES.collateral,
      ["function withdraw(uint256 amount) external"],
      wallet,
    );

    const tooMuch = ethers.parseUnits("999999999", 6);
    await expect(coll.withdraw(tooMuch)).rejects.toThrow();
  });

  test("deposit without USDC approval reverts", async () => {
    test.skip(!hasFunds, "No ETH — fund E2E wallet first");

    // Create a fresh wallet with no approvals
    const freshWallet = ethers.Wallet.createRandom().connect(provider);

    const escrow = new ethers.Contract(
      ADDRESSES.escrow,
      ["function deposit(uint256 amount) external"],
      freshWallet,
    );

    // This should fail (no USDC balance or approval)
    await expect(
      escrow.deposit(ethers.parseUnits("1", 6)),
    ).rejects.toThrow();
  });
});

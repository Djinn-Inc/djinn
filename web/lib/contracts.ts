import { ethers } from "ethers";

// Contract addresses — populated from env vars or placeholder zeros
export const ADDRESSES = {
  signalCommitment:
    process.env.NEXT_PUBLIC_SIGNAL_COMMITMENT_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  escrow:
    process.env.NEXT_PUBLIC_ESCROW_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  collateral:
    process.env.NEXT_PUBLIC_COLLATERAL_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  creditLedger:
    process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  account:
    process.env.NEXT_PUBLIC_ACCOUNT_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  usdc:
    process.env.NEXT_PUBLIC_USDC_ADDRESS ??
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

// Minimal ABIs — only the functions used by the client

export const SIGNAL_COMMITMENT_ABI = [
  "function commit((uint256 signalId, bytes encryptedBlob, bytes32 commitHash, string sport, uint256 maxPriceBps, uint256 slaMultiplierBps, uint256 expiresAt, string[] decoyLines, string[] availableSportsbooks) p) external",
  "function voidSignal(uint256 signalId) external",
  "function getSignal(uint256 signalId) external view returns (tuple(address genius, bytes encryptedBlob, bytes32 commitHash, string sport, uint256 maxPriceBps, uint256 slaMultiplierBps, uint256 expiresAt, string[] decoyLines, string[] availableSportsbooks, bytes walletRecoveryBlob, uint8 status, uint256 createdAt))",
  "function isActive(uint256 signalId) external view returns (bool)",
  "function signalExists(uint256 signalId) external view returns (bool)",
  "event SignalCommitted(uint256 indexed signalId, address indexed genius, string sport, uint256 maxPriceBps, uint256 slaMultiplierBps, uint256 expiresAt)",
  "event SignalVoided(uint256 indexed signalId, address indexed genius)",
] as const;

export const ESCROW_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function purchase(uint256 signalId, uint256 notional, uint256 odds) external returns (uint256 purchaseId)",
  "function getBalance(address user) external view returns (uint256)",
  "function getPurchase(uint256 purchaseId) external view returns (tuple(address idiot, uint256 signalId, uint256 notional, uint256 feePaid, uint256 creditUsed, uint256 usdcPaid, uint256 odds, uint8 outcome, uint256 purchasedAt))",
  "function getPurchasesBySignal(uint256 signalId) external view returns (uint256[])",
  "event Deposited(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event SignalPurchased(uint256 indexed signalId, address indexed buyer, uint256 notional, uint256 feePaid, uint256 creditUsed, uint256 usdcPaid)",
] as const;

export const COLLATERAL_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function getDeposit(address genius) external view returns (uint256)",
  "function getLocked(address genius) external view returns (uint256)",
  "function getAvailable(address genius) external view returns (uint256)",
  "event Deposited(address indexed genius, uint256 amount)",
  "event Withdrawn(address indexed genius, uint256 amount)",
] as const;

export const CREDIT_LEDGER_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
] as const;

export const ACCOUNT_ABI = [
  "function getAccount(address genius, address idiot) external view returns (tuple(uint256 currentCycle, uint256 signalCount, int256 qualityScore, uint256[] purchaseIds, bool settled))",
  "function getCurrentCycle(address genius, address idiot) external view returns (uint256)",
  "function isAuditReady(address genius, address idiot) external view returns (bool)",
  "function getSignalCount(address genius, address idiot) external view returns (uint256)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
] as const;

// Contract factory helpers

export function getSignalCommitmentContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.signalCommitment,
    SIGNAL_COMMITMENT_ABI,
    signerOrProvider
  );
}

export function getEscrowContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.escrow,
    ESCROW_ABI,
    signerOrProvider
  );
}

export function getCollateralContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.collateral,
    COLLATERAL_ABI,
    signerOrProvider
  );
}

export function getCreditLedgerContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.creditLedger,
    CREDIT_LEDGER_ABI,
    signerOrProvider
  );
}

export function getAccountContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.account,
    ACCOUNT_ABI,
    signerOrProvider
  );
}

export function getUsdcContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    ADDRESSES.usdc,
    ERC20_ABI,
    signerOrProvider
  );
}

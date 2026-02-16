# Djinn Protocol Smart Contracts

Solidity contracts for the Djinn Protocol, deployed on Base chain. Built with [Foundry](https://book.getfoundry.sh/).

## Contracts

| Contract | Description |
|----------|-------------|
| `SignalCommitment` | Signal registration with encrypted blob and decoy lines |
| `Escrow` | USDC escrow for signal purchases with SLA tracking |
| `Collateral` | Genius collateral deposits with lock/release mechanics |
| `CreditLedger` | Protocol credits (mint/burn by authorized contracts) |
| `Account` | Purchase history and settlement records |
| `Audit` | On-chain settlement with quality score deltas |
| `TrackRecord` | ZK-verified track record proof storage |
| `ZKVerifier` | Routes Groth16 proofs to circuit-specific verifiers |
| `KeyRecovery` | Wallet recovery blob storage |
| `Groth16AuditVerifier` | Generated Groth16 verifier for audit proofs |
| `Groth16TrackRecordVerifier` | Generated Groth16 verifier for track record proofs |

## Setup

```shell
# Install dependencies
forge install

# Build
forge build

# Run tests (277 tests across 12 suites)
forge test -vvv

# Format
forge fmt

# Gas report
forge test --gas-report
```

## Deployment

```shell
# Set environment variables (see .env.example)
cp .env.example .env

# Deploy to Base Sepolia
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY

# Or use the deployment wrapper script
../scripts/deploy_base.sh
```

## Testing

Tests include unit tests, integration tests, and fuzz tests (1000 runs per fuzz test). All financial math has dedicated fuzz coverage.

```shell
# Run all tests
forge test

# Run specific test file
forge test --match-path test/TrackRecord.t.sol

# Run with gas reporting
forge test --gas-report

# Run fuzz tests with more runs
FOUNDRY_FUZZ_RUNS=10000 forge test --match-test testFuzz
```

## Architecture

All contracts use OpenZeppelin's `Ownable` for admin functions and `Pausable` for emergency stops. The deployment script (`Deploy.s.sol`) handles all cross-contract wiring and permission setup.

Key relationships:
- `Audit` is the settlement hub, authorized to call into Escrow, Collateral, CreditLedger, Account, and SignalCommitment
- `Escrow` manages USDC flow and is authorized to call Collateral, CreditLedger, Account, and SignalCommitment
- `ZKVerifier` routes proofs to the appropriate Groth16 verifier (audit or track record)
- `TrackRecord` verifies and stores ZK track record proofs via ZKVerifier

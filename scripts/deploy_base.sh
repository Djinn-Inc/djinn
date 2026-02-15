#!/usr/bin/env bash
set -euo pipefail

# Deploy Djinn Protocol contracts to Base (Sepolia testnet or mainnet).
#
# Prerequisites:
#   - DEPLOYER_KEY env var set (private key with ETH for gas)
#   - forge installed (Foundry)
#
# Usage:
#   DEPLOYER_KEY=0x... ./scripts/deploy_base.sh sepolia
#   DEPLOYER_KEY=0x... ./scripts/deploy_base.sh mainnet

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/contracts"

NETWORK="${1:-sepolia}"

case "$NETWORK" in
    sepolia)
        RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
        CHAIN_ID=84532
        ETHERSCAN_URL="https://api-sepolia.basescan.org/api"
        echo "=== Deploying to Base Sepolia ==="
        ;;
    mainnet)
        RPC_URL="${BASE_RPC_URL:-https://mainnet.base.org}"
        CHAIN_ID=8453
        ETHERSCAN_URL="https://api.basescan.org/api"
        echo "=== Deploying to Base Mainnet ==="
        echo ""
        echo "WARNING: This is a mainnet deployment. Contracts are immutable."
        read -p "Continue? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
        ;;
    *)
        echo "Usage: $0 [sepolia|mainnet]"
        exit 1
        ;;
esac

if [ -z "${DEPLOYER_KEY:-}" ]; then
    echo "ERROR: DEPLOYER_KEY not set"
    echo "Export your deployer private key: export DEPLOYER_KEY=0x..."
    exit 1
fi

DEPLOYER=$(cast wallet address "$DEPLOYER_KEY")
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL" --ether)
echo "Deployer: $DEPLOYER"
echo "Balance:  $BALANCE ETH"
echo "RPC:      $RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo ""

# Deploy
cd "$CONTRACTS_DIR"

FORGE_ARGS=(
    script/Deploy.s.sol:Deploy
    --rpc-url "$RPC_URL"
    --broadcast
    --verify
)

# Add etherscan API key if available
if [ -n "${BASESCAN_API_KEY:-}" ]; then
    FORGE_ARGS+=(--etherscan-api-key "$BASESCAN_API_KEY")
fi

DEPLOYER_KEY="$DEPLOYER_KEY" forge script "${FORGE_ARGS[@]}" 2>&1 | tee /tmp/djinn-deploy-output.txt

echo ""
echo "=== Deployment complete ==="
echo "Output saved to /tmp/djinn-deploy-output.txt"
echo ""
echo "Next steps:"
echo "  1. Copy contract addresses to .env files"
echo "  2. Update the subgraph deployment (subgraph/subgraph.yaml)"
echo "  3. Push updated configs to the repo"

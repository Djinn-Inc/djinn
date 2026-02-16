<div align="center">

# **Djinn Protocol** <!-- omit in toc -->

### Intelligence × Execution

Buy intelligence you can trust.
Sell analysis you can prove.
Signals stay secret forever — even from us.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/Djinn-Inc/djinn/actions/workflows/ci.yml/badge.svg)](https://github.com/Djinn-Inc/djinn/actions/workflows/ci.yml)

---

Bittensor Subnet 103 · Base Chain · USDC

[Whitepaper](docs/whitepaper.md) · [djinn.gg](https://djinn.gg)
</div>

---

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Running a Validator](#running-a-validator)
- [Running a Miner](#running-a-miner)
- [Development](#development)
- [License](#license)

---

## Overview

Djinn unbundles information from execution. Analysts (**Geniuses**) sell encrypted predictions. Buyers (**Idiots**) purchase access. Signals stay secret forever. Track records are verifiable forever. The protocol runs itself.

Read the full [Whitepaper](docs/whitepaper.md) for complete protocol details.

### Two Core Guarantees

1. **Signals stay secret forever.** No entity, including Djinn, ever views signal content.
2. **Track records are verifiable forever.** Cryptographic proof confirms ROI and performance without revealing individual picks.

---

## How It Works

- **Geniuses** post encrypted signals with collateral-backed SLA guarantees
- **Idiots** purchase signals based on verifiable track records
- **Miners** verify real-time betting line availability via TLSNotary proofs
- **Validators** hold Shamir key shares, coordinate MPC, and attest game outcomes
- **Smart contracts** on Base handle escrow, collateral, and ZK-verified audit settlement

---

## Architecture

| Component | Location |
|-----------|----------|
| Smart contracts | Base chain (Escrow, Collateral, Audits, ZK Verification) |
| Signal commitments | Base chain (immutable, timestamped, encrypted) |
| Data indexing | The Graph (open-source subgraph) |
| Key shares | Bittensor validators (Shamir + MPC) |
| Line verification | Bittensor miners (TLSNotary-attested) |
| Outcome attestation | Bittensor validators (2/3+ consensus) |
| ZK proof generation | Client-side only (snarkjs, Groth16) |
| Frontend | Next.js 14 (app router) |

---

## Repository Structure

```
djinn/
├── contracts/           # Solidity smart contracts (Foundry)
│   ├── src/             # Contract source (Escrow, Collateral, Audit, etc.)
│   ├── test/            # Foundry tests (unit, fuzz, integration)
│   └── script/          # Deployment scripts (Deploy.s.sol)
├── circuits/            # circom 2 ZK circuits + snarkjs
│   ├── src/             # Circuit source (audit_proof, track_record)
│   └── test/            # Proof generation/verification tests
├── web/                 # Next.js 14 client application
│   ├── app/             # App router pages
│   ├── components/      # React components + tests
│   └── lib/             # Crypto, contracts, API, hooks
├── validator/           # Bittensor validator (Python)
│   ├── djinn_validator/ # Core package (API, MPC, scoring, chain)
│   └── tests/           # pytest suite (771+ tests)
├── miner/               # Bittensor miner (Python)
│   ├── djinn_miner/     # Core package (API, checker, TLSNotary)
│   └── tests/           # pytest suite (311+ tests)
├── subgraph/            # The Graph subgraph (AssemblyScript)
│   ├── src/             # Event handlers
│   └── abis/            # Contract ABIs
├── docs/                # Whitepaper and specs
├── scripts/             # Deployment and operational scripts
└── DEVIATIONS.md        # Whitepaper deviation log
```

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) 20+ with [pnpm](https://pnpm.io/)
- [Python](https://www.python.org/) 3.11+ with [uv](https://docs.astral.sh/uv/)
- [circom](https://docs.circom.io/getting-started/installation/) 2 (for ZK circuits)

### Local Development

```bash
# Clone
git clone https://github.com/Djinn-Inc/djinn.git
cd djinn

# Start local stack (Anvil + Validator + Miner + Web)
cp validator/.env.example validator/.env
cp miner/.env.example miner/.env
cp web/.env.example web/.env
docker compose up
```

Or run components individually:

```bash
# Smart contracts
cd contracts && forge build && forge test -vvv

# Validator
cd validator && pip install -e ".[dev]" && pytest

# Miner
cd miner && pip install -e ".[dev]" && pytest

# Web client
cd web && pnpm install && pnpm dev

# ZK circuits
cd circuits && npm install && npm test
```

---

## Running a Validator

Validators hold Shamir key shares, coordinate MPC for executability checks, and attest game outcomes.

```bash
cd validator
cp .env.example .env
# Edit .env with your Bittensor wallet, RPC URL, etc.
pip install -e .
djinn-validator
```

See [Validator Documentation](./docs/validator.md) for detailed setup.

---

## Running a Miner

Miners verify real-time betting line availability and generate TLSNotary proofs.

```bash
cd miner
cp .env.example .env
# Edit .env with your Bittensor wallet, API keys, etc.
pip install -e .
djinn-miner
```

See [Miner Documentation](./docs/miner.md) for detailed setup.

---

## Development

### Testing

```bash
# All contract tests (unit + fuzz + integration)
cd contracts && forge test -vvv

# Validator tests with coverage
cd validator && pytest --cov=djinn_validator --cov-fail-under=80

# Miner tests with coverage
cd miner && pytest --cov=djinn_miner --cov-fail-under=80

# Web unit + component tests
cd web && pnpm vitest run

# Web E2E tests
cd web && pnpm test:e2e

# ZK circuit tests
cd circuits && npm test
```

### Docker

```bash
# Full local stack
docker compose up

# Integration tests
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
```

### Deployment

```bash
# Deploy contracts to Base Sepolia
DEPLOYER_KEY=0x... ./scripts/deploy_base.sh sepolia

# Update subgraph addresses
./scripts/update_subgraph.sh --signal 0x... --escrow 0x... [...]
```

---

## License

This repository is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<div align="center">

# **Djinn Protocol** <!-- omit in toc -->

### Intelligence × Execution

Buy intelligence you can trust.
Sell analysis you can prove.
Signals stay secret forever — even from us.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

Bittensor Subnet 103 · Base Chain · USDC

[Whitepaper](docs/whitepaper.md) · [djinn.gg](https://djinn.gg)
</div>

---

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Installation](#installation)
- [Running a Miner](#running-a-miner)
- [Running a Validator](#running-a-validator)
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
| ZK proof generation | Client-side only |
| Frontend | Static (GitHub Pages) |

---

## Installation

### Requirements

See [`min_compute.yml`](min_compute.yml) for minimum hardware requirements.

### Install

```bash
git clone https://github.com/Djinn-Inc/djinn.git
cd djinn
pip install -e .
```

### Running Locally

Follow the instructions in [Running Subnet Locally](./docs/running_on_staging.md).

### Running on Testnet

Follow the instructions in [Running on the Test Network](./docs/running_on_testnet.md).

### Running on Mainnet

Follow the instructions in [Running on the Main Network](./docs/running_on_mainnet.md).

---

## Running a Miner

Miners verify real-time betting line availability and generate TLSNotary proofs.

```bash
python neurons/miner.py --netuid 103 --wallet.name <your-wallet> --wallet.hotkey <your-hotkey>
```

See [Miner Documentation](./docs/miner.md) for detailed setup.

---

## Running a Validator

Validators hold Shamir key shares, coordinate MPC for executability checks, and attest game outcomes.

```bash
python neurons/validator.py --netuid 103 --wallet.name <your-wallet> --wallet.hotkey <your-hotkey>
```

See [Validator Documentation](./docs/validator.md) for detailed setup.

---

## Repository Structure

```
djinn/
├── neurons/              # Entry points for miner and validator
│   ├── miner.py
│   └── validator.py
├── djinn_subnet/         # Core subnet package
│   ├── protocol.py       # Synapse/wire-protocol definitions
│   ├── base/             # Base neuron classes
│   ├── validator/        # Validator logic (forward, reward)
│   ├── api/              # Subnet API
│   └── utils/            # Shared utilities
├── docs/                 # Documentation and whitepaper
├── tests/                # Test suite
├── scripts/              # Operational scripts
├── min_compute.yml       # Hardware requirements
├── requirements.txt      # Dependencies
└── setup.py              # Package metadata
```

---

## License

This repository is licensed under the MIT License. See [LICENSE](LICENSE) for details.

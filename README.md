# AegisCart

**Policy-first agentic commerce for Razorpay test mode.** AegisCart makes a merchant *transactable by an autonomous AI buyer end to end* — and does it so that **every money action is explainable, bounded and gated**, with a live audit trail and graceful failure recovery.

## Table of Contents
- [Overview](#overview)
- [Key Concepts](#key-concepts)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [DevOps and Deployment](#devops-and-deployment)
- [Feature Flags](#feature-flags)
- [Monitoring and Observability](#monitoring-and-observability)
- [Backup and Recovery](#backup-and-recovery)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview
AegisCart implements agentic commerce primitives that are protocol-agnostic, sharing common ground with ACP, AP2, x402, and NPCI UAP. The core idea is deterministic money math: the LLM only handles language, never numbers that affect money.

## Key Concepts
- **Deterministic Money Math**: Pricing, discounts, mandates, and offer signatures are computed by plain, testable code.
- **Policy Engine**: Enforces merchant-defined bounds (discount caps, margin floors, quantity limits, etc.).
- **Spend Mandates**: AP2-style bounded authorization giving autonomous agents a controlled budget.
- **Signed Offers**: HMAC-SHA256 signed, TTL-bound price quotes that prevent tampering and replay.
- **Human-in-the-Loop**: Risky or high-value actions require explicit merchant approval.
- **Append-Only Ledger**: Immutable audit trail with reason codes for every action.
- **Graceful Failure Handling**: Documented failure modes with retriable flags and fallbacks.

## Architecture
See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deep dive into the codebase structure, data flow, and design decisions.

## API Reference
The API is self-documented via the agent manifest at `/.well-known/agent`. For a detailed endpoint reference, see [API_REFERENCE.md](docs/API_REFERENCE.md).

## Quickstart
```bash
# Install dependencies
npm install

# Set up environment (copy development template)
cp .env.example .env

# Start the development server
npm run dev
```
The application will be available at http://localhost:4000.

## Configuration
Environment variables are loaded from `.env`. See [CONFIGURATION.md](docs/CONFIGURATION.md) for a complete reference.

## DevOps and Deployment
Guidelines for building, containerizing, and deploying AegisCart are in [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Feature Flags
Learn about the feature flag system in [FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md).

## Monitoring and Observability
Details on health checks, metrics, and logging are in [MONITORING.md](docs/MONITORING.md).

## Backup and Recovery
Procedures for backing up and restoring the SQLite database are in [BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md).

## Security
Security best practices and known considerations are in [SECURITY.md](docs/SECURITY.md).

## Testing
Run the test suite with `npm test`. See [TESTING.md](docs/TESTING.md) for more information.

## Troubleshooting
Common issues and their solutions are documented in [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Contributing
We welcome contributions! Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details on our code of conduct, pull request process, and development setup.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

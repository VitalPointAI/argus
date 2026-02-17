# Argus

**Strategic Intelligence Platform** — AI-powered briefings, verified sources, and decentralized intelligence.

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![Built on NEAR](https://img.shields.io/badge/Built%20on-NEAR-00C08B)](https://near.org)

> Own your intelligence. Verify your sources. Protect your analysts.

---

## The Problem

**We're drowning in information but starving for intelligence.**

Every day, analysts and researchers face the same challenge: hundreds of sources to monitor, contradicting reports to reconcile, and critical signals buried in noise. The tools we have aren't built for this reality:

- **Information overload** — RSS feeds, newsletters, social media, reports. No human can process it all, and most never gets read.

- **Trust crisis** — How do you know what's true? Misinformation spreads faster than corrections. Source reliability is a black box.

- **Privacy nightmare** — Every search, every read, every interest becomes data for Big Tech. Your research patterns reveal your intentions. Intelligence work requires confidentiality that centralized platforms can't provide.

- **AI that extracts, not empowers** — Today's AI tools harvest your data to train models you don't control. They optimize for engagement, not insight. The AI works for the platform, not for you.

- **Source protection failure** — Human intelligence is invaluable, but sources risk exposure. One leak can be fatal. Current systems force a terrible choice: share intel and risk your source, or protect them and stay silent.

- **Gatekept intelligence** — The best analysis is locked behind institutional walls. Independent researchers can't monetize their expertise. Good intelligence stays siloed.

- **No verification trail** — Claims get repeated until they feel true. There's no systematic way to trace how information was verified or who vouched for it.

The intelligence community has expensive solutions. Everyone else gets Google Alerts and surveillance capitalism.

**There has to be a better way.**

---

## The Solution

**Argus is strategic intelligence infrastructure for the AI age — built on NEAR.**

We built Argus to solve these problems with a fundamentally different approach, and **NEAR Protocol is essential to making it work**:

| Problem | Argus Solution | Why NEAR? |
|---------|----------------|-----------|
| **Information overload** | AI synthesizes hundreds of sources into actionable briefings with confidence scores | NEAR AI provides private inference in TEEs — your queries never leave secure enclaves |
| **Privacy nightmare** | Your data stays yours. No surveillance. No profiling. | Decentralized architecture means no central server logging your every move |
| **AI that extracts** | AI that works *for you*, not platforms. User-owned, user-controlled. | NEAR AI runs in Trusted Execution Environments — even the operators can't see your data |
| **Trust crisis** | Every claim links to sources. Cross-reference verification shows what's corroborated. | On-chain verification trails provide immutable audit history |
| **Source protection** | Zero-knowledge proofs let sources build reputation without revealing identity | NEAR's account model + ZK proofs enable privacy-preserving credentials |
| **Gatekept intelligence** | NFT marketplace lets anyone monetize curated source lists and analysis | NEAR smart contracts enable direct creator payments, no middlemen |
| **No verification trail** | Full audit trail for every verification. Portable reputation that follows analysts. | Blockchain provides tamper-proof provenance that follows you across platforms |

### Why This Needs NEAR

Argus couldn't exist on traditional infrastructure:

- **🔒 Privacy-Preserving AI** — NEAR AI runs in TEEs (Trusted Execution Environments). Your intelligence queries are processed privately — not logged, not trained on, not sold.
- **🪪 Self-Sovereign Identity** — Sources control their own credentials. Reputation is portable. No platform can deplatform your professional history.
- **💸 Trustless Payments** — Near Intents enable payments in any token. Zcash integration adds shielded transactions for sensitive HUMINT work.
- **📜 Immutable Verification** — On-chain trails mean verification history can't be altered. Trust is cryptographic, not institutional.

The result: **Intelligence you can trust, AI that works for you, and privacy by default.**

---

## What is Argus?

Argus is a strategic intelligence platform that helps analysts, researchers, and decision-makers cut through information noise. It combines:

- **AI-Powered Briefings** — Daily strategic scans synthesized by NEAR AI
- **Source Verification** — Confidence scoring and cross-reference validation
- **Anonymous HUMINT** — Zero-knowledge proofs protect human sources
- **NFT Marketplace** — Monetize curated source lists with Access Passes
- **Decentralized Architecture** — User-owned data, no central gatekeepers

## Features

### 📊 Strategic Intelligence Dashboard
- Real-time feed from curated sources across multiple domains
- AI-generated briefings with confidence scores
- Deep verification with cross-reference analysis
- Full-text search across all ingested content

### 🎭 Human Intelligence (HUMINT)
- Anonymous source registration via passkeys
- Zero-knowledge reputation proofs
- Zcash payments for verified intel
- Protected identity, portable reputation

### 🛒 Source List Marketplace
- Sell access to curated source collections
- NFT Access Passes on NEAR blockchain
- Direct payments to creators via smart contract
- Pay with any token via Near Intents

### 🔐 Privacy & Verification
- ZK proofs for claims without revealing sources
- Location proofs, reputation proofs, identity rotation
- Source reliability tracking with anti-gaming
- Verification trails for every claim

## Tech Stack

| Layer | Technology |
|-------|------------|
| **AI** | NEAR AI (DeepSeek V3.1 via TEE) |
| **Blockchain** | NEAR Protocol |
| **ZK Proofs** | Circom + snarkjs (Groth16) |
| **Payments** | Zcash (shielded), Near Intents (multi-token) |
| **Backend** | Hono + Node.js + PostgreSQL |
| **Frontend** | Next.js 14 + Tailwind CSS |
| **Auth** | Passkeys (WebAuthn) + JWT |

## Open Source Contributions

### 📦 @vitalpoint/near-phantom-auth

As part of building Argus, we developed and published a reusable authentication library for the NEAR ecosystem:

**[`@vitalpoint/near-phantom-auth`](https://www.npmjs.com/package/@vitalpoint/near-phantom-auth)** — Passwordless authentication for NEAR using passkeys and MPC accounts.

```bash
npm install @vitalpoint/near-phantom-auth
```

**Features:**
- 🔐 **Passkey Authentication** — WebAuthn-based login with no passwords
- 🪪 **Implicit Accounts** — Auto-create NEAR accounts from passkey credentials  
- 🔑 **MPC Key Derivation** — Derive NEAR keys from passkey signatures via NEAR's MPC network
- 💰 **Treasury Funding** — Optional auto-funding for new accounts via registry contract
- 🌐 **Mainnet Ready** — Works with `funding-registry.credz.near` treasury

This package powers Argus's HUMINT registration flow, enabling anonymous sources to create accounts with just a biometric scan — no email, no phone, no identity trail.

**Why we open-sourced it:** Passkey auth on NEAR shouldn't require reinventing the wheel. We built what we needed and shared it so other builders can ship faster.

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL 15+
- Docker (optional)

### Installation

```bash
# Clone the repo
git clone https://github.com/VitalPointAI/argus.git
cd argus

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
cd apps/api && npm run db:migrate

# Start development servers
npm run dev
```

### Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# API runs on :3001, Web on :3002
```

## Configuration

Key environment variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/argus

# Authentication
JWT_SECRET=your-secret-key

# NEAR AI
NEAR_AI_API_KEY=your-near-ai-key

# Pinata (IPFS)
PINATA_JWT=your-pinata-jwt

# Zcash (HUMINT payments)
ZCASH_RPC_URL=http://localhost:8232
```

See `.env.example` for full configuration options.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                   (Next.js + React)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      API Layer                               │
│                  (Hono + Node.js)                            │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│  Briefings  │   Sources   │  Marketplace │    HUMINT        │
│  (NEAR AI)  │ (RSS/Web)   │  (NFT/Intents)│  (ZK/Zcash)     │
└─────────────┴─────────────┴─────────────┴───────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Data Layer                                │
│         PostgreSQL + IPFS + NEAR Blockchain                  │
└─────────────────────────────────────────────────────────────┘
```

## Documentation

Full documentation available at **[docs.argus.vitalpoint.ai](https://docs.argus.vitalpoint.ai)**

- [API Reference](https://docs.argus.vitalpoint.ai/api)
- [Source Integration](https://docs.argus.vitalpoint.ai/sources)
- [HUMINT Guide](https://docs.argus.vitalpoint.ai/humint)
- [ZK Proofs](https://docs.argus.vitalpoint.ai/features/zk-proofs)
- [Marketplace](https://docs.argus.vitalpoint.ai/marketplace)

## Roadmap

- [x] **Phase 1**: Core platform (RSS ingestion, AI briefings)
- [x] **Phase 2**: Source reputation system
- [x] **Phase 3**: HUMINT with Zcash payments
- [x] **Phase 4**: Verification engine
- [x] **Phase 5**: NFT Marketplace
- [x] **Phase 6**: OAuth + Passkey auth overhaul
- [x] **Phase 7**: Mobile apps

### Under Consideration
- Real-time alerts & notifications
- API for third-party integrations
- Multi-language source support
- Prediction markets / forecasting
- Geospatial intelligence mapping
- Agent-assisted research
- TEE content gating via NEAR Shade Agents (implementation ready, awaiting mainnet)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the **Business Source License 1.1** (BSL 1.1).

- ✅ Self-hosting allowed
- ✅ Modifications allowed
- ✅ Contributions welcome
- ❌ Competing SaaS not permitted
- 🔄 Converts to Apache 2.0 on February 16, 2030

See [LICENSE](LICENSE) for full terms.

## Links

- **Live**: [argus.vitalpoint.ai](https://argus.vitalpoint.ai)
- **Docs**: [docs.argus.vitalpoint.ai](https://docs.argus.vitalpoint.ai)
- **Twitter**: [@ArgusIntel](https://twitter.com/ArgusIntel)

---

Built with ❤️ by [VitalPoint AI](https://vitalpoint.ai)

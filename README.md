# Argus

**Strategic Intelligence Platform** — AI-powered briefings, verified sources, and decentralized intelligence.

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![Built on NEAR](https://img.shields.io/badge/Built%20on-NEAR-00C08B)](https://near.org)

> Own your intelligence. Verify your sources. Protect your analysts.

## What is Argus?

Argus is a strategic intelligence platform that helps analysts, researchers, and decision-makers cut through information noise. It combines:

- **AI-Powered Briefings** — Daily strategic scans synthesized by NEAR AI
- **Source Verification** — Confidence scoring and cross-reference validation
- **Anonymous HUMINT** — Zero-knowledge proofs protect human sources
- **NFT Marketplace** — Monetize curated source lists with Access Passes
- **Decentralized Architecture** — User-owned data, no central gatekeepers

## Features

### 📊 Strategic Intelligence Dashboard
- Real-time feed from 100+ curated sources across 20+ domains
- AI-generated briefings with confidence scores
- Deep verification with cross-reference analysis
- Full-text search across 27,000+ articles

### 🎭 Human Intelligence (HUMINT)
- Anonymous source registration via passkeys
- Zero-knowledge reputation proofs
- Zcash payments for verified intel
- Protected identity, portable reputation

### 🛒 Source List Marketplace
- Sell access to curated source collections
- NFT Access Passes on NEAR blockchain
- 95% to creators, 5% platform fee
- Pay with any token via 1Click

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
| **Payments** | Zcash (shielded), 1Click (multi-token) |
| **Backend** | Hono + Node.js + PostgreSQL |
| **Frontend** | Next.js 14 + Tailwind CSS |
| **Auth** | Passkeys (WebAuthn) + JWT |

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
│  (NEAR AI)  │ (RSS/Web)   │  (NFT/1Click)│  (ZK/Zcash)      │
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
- [ ] **Phase 6**: OAuth + Passkey auth overhaul
- [ ] **Phase 7**: Mobile apps
- [ ] **Phase 8**: Collaborative verification

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

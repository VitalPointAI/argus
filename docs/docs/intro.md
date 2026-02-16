---
slug: /
sidebar_position: 1
---

# Introduction

**Argus** is a strategic intelligence platform that combines automated source monitoring with privacy-first human intelligence (HUMINT) to deliver verified, actionable briefings.

## What is Argus?

Argus operates on two intelligence tracks:

### 📡 Automated Intelligence (OSINT)
Monitor RSS feeds, news sites, and social media across domains you care about. AI-powered verification filters signal from noise, and LLM-generated briefings synthesize developments into actionable insights.

### 🎭 Human Intelligence (HUMINT)
Crowdsourced intelligence from anonymous sources. Sources register with cryptographic identities, submit intel that gets crowd-verified, and receive payments through privacy-preserving channels (including Zcash shielded transactions).

## Key Features

### Source Monitoring
- **📡 Multi-Source Aggregation** - Curated sources across multiple domains (RSS, web, YouTube)
- **🔍 AI Verification** - Cross-reference claims, bias detection, confidence scoring
- **📋 Executive Briefings** - LLM-generated summaries clustered by domain
- **🔔 Scheduled Delivery** - Automatic briefings via Telegram/email
- **🎯 Source Lists** - Create filtered views, share with community
- **🔎 Full-Text Search** - Search across your entire article archive

### Human Intelligence (HUMINT)
- **🎭 Anonymous Sources** - Cryptographic registration, no KYC
- **🔐 Privacy-First Payments** - Zcash shielded (z-address) escrow
- **📋 Intel Bounties** - Post bounties for specific information
- **⭐ Reputation System** - Crowd-verified submissions build source reputation
- **💰 Subscriptions** - Subscribe directly to high-reputation sources

### Platform
- **🔌 REST API** - Full API access with key authentication
- **🌐 Cross-Chain Payments** - Pay sources on any chain via NEAR Intents
- **📱 Mobile Responsive** - Full functionality on any device

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE SOURCES                     │
├─────────────────────────────┬───────────────────────────────┤
│      OSINT (Automated)      │      HUMINT (Human)           │
│  ┌─────────────────────┐    │    ┌─────────────────────┐    │
│  │ RSS / Web / YouTube │    │    │ Anonymous Sources   │    │
│  └──────────┬──────────┘    │    └──────────┬──────────┘    │
│             │               │               │               │
│             ▼               │               ▼               │
│  ┌─────────────────────┐    │    ┌─────────────────────┐    │
│  │     Ingestion       │    │    │  Signed Submissions │    │
│  └──────────┬──────────┘    │    └──────────┬──────────┘    │
└─────────────┼───────────────┴───────────────┼───────────────┘
              │                               │
              ▼                               ▼
       ┌─────────────────────────────────────────────┐
       │              VERIFICATION LAYER              │
       │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
       │  │Cross-Ref│  │  Bias   │  │Crowd Verify │  │
       │  │ Engine  │  │Detection│  │  (HUMINT)   │  │
       │  └─────────┘  └─────────┘  └─────────────┘  │
       └──────────────────┬──────────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────────┐
       │              DELIVERY LAYER                  │
       │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
       │  │Briefings│  │Dashboard│  │  REST API   │  │
       │  └────┬────┘  └─────────┘  └─────────────┘  │
       │       │                                      │
       │       ▼                                      │
       │  ┌─────────┐  ┌─────────┐                   │
       │  │Telegram │  │  Email  │                   │
       │  └─────────┘  └─────────┘                   │
       └─────────────────────────────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────────┐
       │              PAYMENT LAYER                   │
       │  ┌─────────────┐  ┌─────────────────────┐   │
       │  │ NEAR Intents│  │  Zcash Shielded     │   │
       │  │  (Intents)  │  │     Escrow          │   │
       │  └─────────────┘  └─────────────────────┘   │
       └─────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone the repo
git clone https://github.com/VitalPointAI/argus.git
cd argus

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm run dev
```

## Live Demo

Visit [argus.vitalpoint.ai](https://argus.vitalpoint.ai) to see Argus in action.

## Use Cases

- **Journalists** - Monitor breaking news across beats, verify claims
- **Researchers** - Track developments in specific domains
- **Security Teams** - Monitor threat intelligence, receive alerts
- **Investors** - Track market-moving news across sectors
- **Organizations** - Build internal intelligence capabilities
- **HUMINT Sources** - Securely monetize on-the-ground information

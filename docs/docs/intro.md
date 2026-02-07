---
slug: /
sidebar_position: 1
---

# Introduction

**Argus** is a strategic intelligence platform that aggregates, verifies, and synthesizes news from multiple sources into actionable briefings.

## What is Argus?

Argus monitors RSS feeds across domains you care about, applies AI-powered verification to filter signal from noise, and generates concise briefings delivered on your schedule.

### Key Features

- **📡 Multi-Source Aggregation** - Monitor 80+ sources across 20+ domains
- **🔍 AI Verification** - Confidence scoring and fact-checking
- **📋 Smart Briefings** - LLM-generated summaries tailored to your interests
- **🔔 Scheduled Delivery** - Automatic briefings via Telegram at times you choose
- **🎯 Source Lists** - Create filtered views for different topics
- **🔎 Full-Text Search** - Find any article across your entire archive
- **🔌 API Access** - Integrate with your existing tools

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

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RSS Feeds  │────▶│   Ingester  │────▶│  PostgreSQL │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌─────────────┐            │
                    │   Near AI   │◀───────────┤
                    │    (LLM)    │            │
                    └─────────────┘            │
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Briefings  │     │  Dashboard  │
                    └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Telegram   │
                    └─────────────┘
```

## Live Demo

Visit [argus.vitalpoint.ai](https://argus.vitalpoint.ai) to see Argus in action.

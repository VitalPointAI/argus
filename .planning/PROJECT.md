# Argus

> Strategic intelligence that cuts through noise — verified, scored, actionable.

## Vision

An open-source intelligence platform that transforms the overwhelming firehose of global information into concise, verified briefings. Users define their strategic domains, curate source lists (with AI assistance), and receive confidence-scored intelligence with full verification transparency.

## Core Value

**The ONE thing that must work:** A concise, relevant summary that makes the user smarter on their strategic environment — highlighting changes visually, setting probability forecasts, with every claim backed by a confidence score users can drill into.

## Target Users

1. **Primary (V1):** Aaron + internal use, feeding Bastion OSINT pipeline
2. **Future:** Analysts, researchers, executives, security professionals who need verified strategic intelligence

## Current Milestone: v1.0 MVP

**Goal:** Internal-ready platform with core intelligence loop, verification engine, and Bastion API

**Target features:**
- Source ingestion (RSS, web, social)
- AI-assisted source list creation
- Verification engine with confidence scoring
- Multi-format delivery (Telegram, Email, Web)
- Configurable briefing cadence
- 20 starter domains (including Cyber, Crypto)
- Bastion API integration

## Architecture Principles

1. **SaaS-ready from day one** — Auth, multi-tenancy, billing hooks even if not used yet
2. **Source-agnostic ingestion** — Plugin architecture for adding new source types
3. **Verification transparency** — Every confidence score traceable to evidence
4. **API-first** — Web/Telegram/Email are just clients; Bastion gets the same API
5. **Economical infrastructure** — Self-hosted where possible, scale later

## Tech Constraints

- Self-funded — optimize for cost
- Must integrate with OpenClaw (Telegram delivery)
- Must expose API for Bastion
- Should leverage existing LLM access (Anthropic, OpenAI, Near AI)

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-06 | Name: Argus | Hundred-eyed giant — all-seeing, memorable, mythological fit with Bastion |
| 2026-02-06 | Build own verification engine | More robust than existing fact-check APIs, competitive advantage |
| 2026-02-06 | Internal-first, SaaS-ready | Dogfood before monetizing, but don't paint ourselves into corners |

---

*Last updated: 2026-02-06*

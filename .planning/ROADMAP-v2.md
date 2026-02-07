# Argus Roadmap v2
_Updated: 2026-02-07_

## Vision
Strategic intelligence platform with **NFT-based source list marketplace** - users create, clone, rate, and trade curated source lists as subscribable NFTs.

---

## Current Status (as of Feb 7, 2026)

### ✅ COMPLETED
- **Infrastructure**: Hetzner server, PostgreSQL, PM2, SSL, domain
- **Ingestion**: RSS (93 sources), YouTube (8 channels), 12,500+ articles
- **Domains**: 20 strategic domains with sources
- **Verification**: Confidence scoring (50-90% range)
- **Briefings**: LLM-powered synthesis via Near AI (DeepSeek V3.1)
- **Delivery**: Telegram (auto 5am/6pm EST), Web dashboard
- **API v1**: REST endpoints for content, briefings, sources
- **AI Features**: Source suggestions, LLM briefings with article content

### 🔧 IN PROGRESS (agents working)
- Auth fix (login not persisting state)
- Admin account creation (a.luhning@vitalpoint.ai)
- Favicon
- Briefing improvements (URLs, executive summary, key themes)

### ❌ NOT STARTED
- Source management UI
- NFT marketplace
- Email delivery
- Full verification engine

---

## Phase 1: Platform Polish (Current Sprint)
_Goal: Make existing features actually work properly_

| Task | Priority | Status |
|------|----------|--------|
| Fix auth (login/register flow) | P0 | 🔧 Agent working |
| Admin account + admin area | P0 | 🔧 Agent working |
| Favicon | P1 | 🔧 Agent working |
| Email validation on register | P1 | ❌ |
| Source management UI (add/delete/rate) | P0 | ❌ |
| Domain management (user add, admin delete) | P1 | ❌ |

---

## Phase 2: Source Reputation System
_Goal: Anti-gaming, trust-based source scoring_

| Task | Priority | Status |
|------|----------|--------|
| Source reliability tracking over time | P0 | ❌ |
| User ratings for sources | P0 | ❌ |
| Anti-gaming measures (rate limiting, verification) | P0 | ❌ |
| Reputation decay for stale sources | P1 | ❌ |
| Cross-reference accuracy tracking | P1 | ❌ |

---

## Phase 3: Source List Marketplace (NFT)
_Goal: Tradable, subscribable NFT source lists_

| Task | Priority | Status |
|------|----------|--------|
| Create source lists (named collections) | P0 | ❌ |
| Clone source lists (copy with attribution) | P0 | ❌ |
| Rate source lists (1-5 stars + reviews) | P0 | ❌ |
| NFT minting for source lists | P0 | ❌ |
| Subscription model (pay to access list updates) | P1 | ❌ |
| Revenue share for creators | P1 | ❌ |
| Marketplace discovery/search | P1 | ❌ |
| Leaderboard of top curators | P2 | ❌ |

---

## Phase 4: Enhanced Verification
_Goal: Bulletproof authenticity, bias detection_

| Task | Priority | Status |
|------|----------|--------|
| Cross-reference claims across 3+ sources | P0 | ❌ |
| Fact-check API integration (ClaimBuster, etc.) | P1 | ❌ |
| Bias detection and labeling | P0 | ❌ |
| Misinformation pattern detection | P1 | ❌ |
| Verification trail UI (why this score?) | P1 | ❌ |
| Wire services (AP, Reuters) as ground truth | P0 | Partial |

---

## Phase 5: Delivery & Alerts
_Goal: Multi-channel, real-time intelligence_

| Task | Priority | Status |
|------|----------|--------|
| Email delivery (Resend) | P0 | ❌ Blocked (need API key) |
| Real-time breaking news alerts | P1 | ❌ |
| Custom alert rules (keywords, confidence threshold) | P2 | ❌ |
| Briefing format preferences (detailed vs headlines) | P2 | ❌ |
| Signal channel delivery | P2 | ❌ (need 2nd phone) |

---

## Phase 6: Additional Ingestion
_Goal: More source types_

| Task | Priority | Status |
|------|----------|--------|
| Twitter/X API ingestion | P1 | ❌ |
| Telegram channel monitoring | P2 | ❌ |
| Podcast transcripts | P2 | ❌ |
| Government/official feeds | P1 | ❌ |
| Full article scraping (not just RSS snippets) | P0 | ❌ |

---

## Phase 7: API & Integration
_Goal: Bastion integration, external access_

| Task | Priority | Status |
|------|----------|--------|
| API authentication (API keys) | P0 | ❌ |
| Rate limiting | P1 | ❌ |
| Webhooks for new briefings | P1 | ❌ |
| Bastion integration | P1 | ❌ |
| OpenAPI docs auto-generation | P2 | ❌ |

---

## Discussed Features (From Conversations)

### From Initial Vision
- Morning + nightly strategic scan
- Bulletproof authentic, perspective balanced, bias-free (or acknowledged)
- Wire services (AP, Reuters) as primary sources
- Cross-reference across spectrum

### From Feb 7 Feedback
- Login/register not working → auth fix needed
- No favicon → adding
- No source add/delete/rate UI → Phase 1
- Source ratings can't be gamed → Phase 2
- Domain management (user add, admin delete) → Phase 1
- Admin area needed → Phase 1
- NFT source lists: create, clone, rate, trade, subscribe → Phase 3

---

## Technical Debt
- [ ] Foreign Affairs RSS only has snippets, not full content
- [ ] URLs missing in some briefings
- [ ] Test coverage minimal
- [ ] No CI/CD pipeline
- [ ] Error handling inconsistent

---

## Dependencies
- **Resend API key**: Needed for email delivery
- **Second phone number**: Needed for Signal channel
- **NEAR wallet integration**: Needed for NFT marketplace
- **Twitter API access**: Needed for X ingestion

# Argus Roadmap v2
_Updated: 2026-02-08_

## Vision
Strategic intelligence platform with:
- **NFT-based source list marketplace** - users create, clone, rate, and trade curated source lists as subscribable NFTs
- **HUMINT network** - anonymous human intelligence sources with crowd verification and privacy-first payments
- **User-owned data** - encrypted on IPFS, anchored to NEAR, never in our database

---

## Current Status (as of Feb 8, 2026)

### ✅ COMPLETED
- **Infrastructure**: Hetzner server, PostgreSQL, PM2, SSL, domain, zcashd node
- **Ingestion**: RSS (113 sources), YouTube (8 channels), 27,534+ articles
- **Domains**: 20 strategic domains with sources
- **Verification**: Full pipeline (cross-reference, bias detection, verification trail)
- **Briefings**: LLM-powered synthesis via Near AI (DeepSeek V3.1), executive briefings
- **Delivery**: Telegram (auto 5am/6pm EST), Web dashboard, scheduled user-preference delivery
- **API v1**: REST endpoints for content, briefings, sources, verification, HUMINT
- **AI Features**: Source suggestions, LLM briefings with article content, AI Source Assistant
- **Auth**: Fixed, admin dashboard live, API key authentication with rate limiting
- **Docs**: Full documentation site at docs.argus.vitalpoint.ai
- **HUMINT System**: Anonymous sources, crowd verification, privacy payments (ZEC shielded)
- **Payment Infrastructure**: 1Click cross-chain (13 chains), ZEC shielded escrow

### 🔧 IN PROGRESS
- Zcash node syncing (~0.5%)
- Bastion auth integration (waiting for Aaron to push code)

### ⏳ BLOCKED
- Signal channel delivery (need 2nd phone number)

---

## Phase 1: Platform Polish ✅ COMPLETE
_Goal: Make existing features actually work properly_

| Task | Priority | Status |
|------|----------|--------|
| Fix auth (login/register flow) | P0 | ✅ |
| Admin account + admin area | P0 | ✅ |
| Favicon | P1 | ✅ |
| Source management UI (add/delete/rate) | P0 | ✅ |
| Domain management (user add, admin delete) | P1 | ✅ |
| Settings page | P1 | ✅ |
| API key authentication | P1 | ✅ |
| Health endpoint | P2 | ✅ |
| Mobile responsive | P1 | ✅ |

---

## Phase 2: Source Reputation System ✅ COMPLETE
_Goal: Anti-gaming, trust-based source scoring_

| Task | Priority | Status |
|------|----------|--------|
| Source reliability tracking over time | P0 | ✅ |
| User ratings for sources | P0 | ✅ |
| Anti-gaming measures (rate limiting, verification) | P0 | ✅ |
| Reputation decay for stale sources | P1 | ✅ |
| Cross-reference accuracy tracking | P1 | ✅ |

---

## Phase 3: Source List Marketplace (NFT)
_Goal: Tradable, subscribable NFT source lists_

| Task | Priority | Status |
|------|----------|--------|
| Create source lists (named collections) | P0 | ✅ |
| Clone source lists (copy with attribution) | P0 | ✅ |
| Rate source lists (1-5 stars + reviews) | P0 | ✅ |
| NFT minting for source lists | P0 | ❌ |
| Subscription model (pay to access list updates) | P1 | ❌ |
| Revenue share for creators | P1 | ❌ |
| Marketplace discovery/search | P1 | ❌ |
| Leaderboard of top curators | P2 | ❌ |

---

## Phase 4: Enhanced Verification ✅ COMPLETE
_Goal: Bulletproof authenticity, bias detection_

| Task | Priority | Status |
|------|----------|--------|
| Cross-reference claims across 3+ sources | P0 | ✅ |
| Bias detection and labeling | P0 | ✅ |
| Verification trail UI (why this score?) | P1 | ✅ |
| Wire services (AP, Reuters) as ground truth | P0 | ✅ |
| Deep verification endpoint (full pipeline) | P0 | ✅ |
| Full-text fetch on verify | P0 | ✅ |
| Improved scoring (neutral ≠ penalty) | P0 | ✅ |
| Fact-check API integration (ClaimBuster, etc.) | P2 | ❌ |
| Misinformation pattern detection | P2 | ❌ |

---

## Phase 5: Delivery & Alerts ✅ MOSTLY COMPLETE
_Goal: Multi-channel, real-time intelligence_

| Task | Priority | Status |
|------|----------|--------|
| Email delivery (AWS SES) | P0 | ✅ |
| Scheduled briefing delivery (user preferences) | P0 | ✅ |
| Executive briefing format | P0 | ✅ |
| TTS audio briefings | P1 | ✅ (XTTS integrated) |
| Real-time breaking news alerts | P1 | ❌ |
| Custom alert rules (keywords, confidence threshold) | P2 | ❌ |
| Signal channel delivery | P2 | ❌ (need 2nd phone) |

---

## Phase 6: HUMINT System ✅ COMPLETE
_Goal: Anonymous human intelligence network_

| Task | Priority | Status |
|------|----------|--------|
| Anonymous source registration (wallet-only) | P0 | ✅ |
| Codename generation | P0 | ✅ |
| Source profiles with reputation | P0 | ✅ |
| Intel submission with signatures | P0 | ✅ |
| Crowd verification (rate submissions) | P0 | ✅ |
| Source subscriptions | P1 | ✅ |
| OPSEC onboarding guides | P0 | ✅ |
| Privacy-level payment options | P0 | ✅ |
| Bastion wallet auth integration | P0 | ⏳ Waiting for Aaron's code |

---

## Phase 7: Payment Infrastructure ✅ COMPLETE
_Goal: Privacy-first cross-chain payments_

| Task | Priority | Status |
|------|----------|--------|
| 1Click cross-chain integration (13 chains) | P0 | ✅ |
| Address validation per chain | P0 | ✅ |
| Payment quotes API | P0 | ✅ |
| Zcash node setup | P0 | ✅ |
| ZEC shielded escrow (t→z→z) | P0 | ✅ |
| Privacy level documentation | P1 | ✅ |
| Intel bounty escrow flow | P0 | ✅ |
| Donation mode for critical-risk sources | P1 | ✅ |

---

## Phase 8: User-Owned Data Architecture
_Goal: IPFS + NEAR for user data sovereignty_

| Task | Priority | Status |
|------|----------|--------|
| IPFS storage service (Pinata) | P1 | ✅ |
| Post-quantum encryption | P2 | ✅ |
| User data store schema | P1 | ✅ |
| NEAR data registry contract | P1 | ✅ (designed) |
| Source list NFT contract | P1 | ✅ (designed) |
| Contract deployment | P1 | ❌ |
| Migration tool | P2 | ❌ |

---

## Phase 9: Additional Ingestion
_Goal: More source types_

| Task | Priority | Status |
|------|----------|--------|
| Web ingestion (any URL) | P0 | ✅ |
| Full article scraping (not just RSS snippets) | P0 | ✅ |
| Twitter/X API ingestion | P1 | ❌ |
| Telegram channel monitoring | P2 | ❌ |
| Podcast transcripts | P2 | ❌ |
| Government/official feeds | P1 | ❌ |

---

## Technical Improvements Made
- [x] Full schema sync on deploy (prevents column mismatch)
- [x] Password hashes via Node.js (shell escaping fix)
- [x] PM2 directory fix (correct cwd)
- [x] Route order fix (specific before parameterized)
- [x] Suspense boundaries for Next.js static gen
- [x] 2-minute timeout for executive briefings
- [x] Cache busting for Next.js

---

## Remaining Technical Debt
- [ ] Test coverage minimal
- [ ] No CI/CD pipeline (manual deploy)
- [ ] Error handling could be more consistent
- [ ] Rate limiting per-user (currently global)

---

## Dependencies
- **Second phone number**: Needed for Signal channel

### ✅ Resolved
- AWS SES credentials - configured
- XTTS server - integrated (http://3.99.226.201:5002)
- ONE_CLICK_JWT - configured
- Phantom auth - implemented (replaces Bastion)

---

## Completed Documentation
- Introduction and overview
- Getting started guides (installation, configuration, first briefing)
- API reference (articles, briefings, search, sources, verification)
- Feature guides (briefings, verification, sources, source lists, HUMINT, intel bounties)
- Self-hosting guides (deployment, database, environment)
- Integration guides (Telegram, Bastion, Zcash escrow)

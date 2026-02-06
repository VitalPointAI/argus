# Argus Roadmap

## v1.0 MVP — 7 Phases

### Phase 1: Foundation
**Goal:** Core platform infrastructure — database, auth, basic architecture

**Requirements:**
- PLT-01: User authentication
- PLT-02: User profile/preferences
- PLT-03: Multi-tenant architecture
- PLT-04: Billing-ready schema
- SRC-08: Unified content schema

**Success Criteria:**
1. User can register and login
2. User data isolated per tenant
3. Database schema documented
4. Content schema handles all source types
5. Local dev environment works

---

### Phase 2: Source Ingestion
**Goal:** Ingest content from multiple source types

**Requirements:**
- SRC-01: RSS feeds
- SRC-02: Web scraping
- SRC-03: Twitter/X API
- SRC-04: Telegram channels
- SRC-05: YouTube transcripts
- SRC-06: Podcast transcripts
- SRC-07: Government feeds

**Success Criteria:**
1. Can ingest from 5+ RSS feeds
2. Can scrape 3+ news sites
3. Twitter ingestion working (or mocked if API expensive)
4. Telegram channel monitoring works
5. YouTube transcript extraction works
6. All content normalized to unified schema

---

### Phase 3: Source Management
**Goal:** Users can create and manage source lists with AI assistance

**Requirements:**
- MGT-01: Create source lists
- MGT-02: Add/remove sources
- MGT-03: AI source suggestions
- MGT-04: Domain categorization
- MGT-05: 20 domain templates
- MGT-06: Clone architecture (hooks only)
- MGT-07: Rating architecture (hooks only)

**Success Criteria:**
1. User can create named source list
2. User can add sources by URL/handle
3. AI suggests sources when given a topic
4. Sources tagged by domain
5. Pre-built templates for 20 domains
6. Clone/rating DB fields exist (not exposed in UI yet)

---

### Phase 4: Verification Engine
**Goal:** Confidence scoring with full transparency

**Requirements:**
- VER-01: Confidence scoring (0-100)
- VER-02: Cross-reference claims
- VER-03: Misinfo/disinfo detection
- VER-04: Fact-checking
- VER-05: Source reliability tracking
- VER-06: Verification trail UI
- VER-07: Confidence filtering

**Success Criteria:**
1. Every article gets a confidence score
2. Claims cross-referenced across 3+ sources
3. Known disinfo patterns flagged
4. Fact-check against reference databases
5. Source reliability updates over time
6. User can click to see why score is X
7. User can set "only show me >70% confidence"

---

### Phase 5: Intelligence Synthesis
**Goal:** Transform raw content into strategic intelligence

**Requirements:**
- INT-01: Strategic summaries
- INT-02: Change highlighting
- INT-03: Probability forecasts
- INT-04: Trend detection
- INT-05: Priority ranking

**Success Criteria:**
1. Daily briefing is <500 words but comprehensive
2. Changes since last briefing visually marked
3. "70% chance of X in next 30 days" style forecasts
4. Emerging trends surfaced automatically
5. High-confidence, high-impact items first

---

### Phase 6: Delivery Channels
**Goal:** Multi-channel briefing delivery with user preferences

**Requirements:**
- DEL-01: Telegram delivery
- DEL-02: Email delivery
- DEL-03: Web dashboard
- DEL-04: Schedule configuration
- DEL-05: Real-time alerts
- DEL-06: Format preferences

**Success Criteria:**
1. Briefing arrives in Telegram on schedule
2. Email digest formatted properly
3. Web dashboard shows current + historical briefings
4. User can set morning (6am) and evening (6pm) times
5. Breaking news triggers immediate alert
6. User can choose "detailed" vs "headlines only"

---

### Phase 7: Domains + API
**Goal:** Domain presets and Bastion integration

**Requirements:**
- DOM-01: Domain selection UI
- DOM-02: 20 starter domains
- DOM-03: Cyber domain
- DOM-04: Crypto domain
- DOM-05: Custom domains
- API-01: REST API
- API-02: Auth + rate limiting
- API-03: Webhooks
- API-04: Bastion integration
- API-05: OpenAPI docs
- PLT-05: Admin dashboard

**Success Criteria:**
1. User can toggle domains on/off
2. All 20 domains have curated starter sources
3. Cyber domain includes threat intel feeds
4. Crypto domain includes on-chain data sources
5. User can create "My Custom Domain"
6. All data accessible via REST API
7. Bastion successfully ingests Argus feed
8. API docs auto-generated at /docs

---

## Estimated Timeline

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Foundation | 1-2 weeks |
| 2 | Source Ingestion | 2-3 weeks |
| 3 | Source Management | 1-2 weeks |
| 4 | Verification Engine | 2-3 weeks |
| 5 | Intelligence Synthesis | 1-2 weeks |
| 6 | Delivery Channels | 1-2 weeks |
| 7 | Domains + API | 1-2 weeks |

**Total: ~10-16 weeks to MVP**

---

## Traceability Matrix

| Requirement | Phase |
|-------------|-------|
| PLT-01 through PLT-04 | 1 |
| SRC-01 through SRC-08 | 1, 2 |
| MGT-01 through MGT-07 | 3 |
| VER-01 through VER-07 | 4 |
| INT-01 through INT-05 | 5 |
| DEL-01 through DEL-06 | 6 |
| DOM-01 through DOM-05 | 7 |
| API-01 through API-05 | 7 |
| PLT-05 | 7 |

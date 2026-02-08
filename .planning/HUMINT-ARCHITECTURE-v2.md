# Argus HUMINT Architecture v2
## Zero-Knowledge Crowdsourced Intelligence Network

---

## Core Principles

1. **Platform Blindness**: We cannot know anonymous source identities - by design
2. **Crowd Verification**: Consumers rate intel, not internal analysts
3. **Zero-Trust**: Every claim is verifiable, nothing taken on faith
4. **Privacy by Default**: Anonymous until source chooses otherwise
5. **Cryptographic Guarantees**: ZK proofs over trust-me promises

---

## 1. Identity Architecture

### Two User Classes

```
┌─────────────────────────────────────────────────────────────┐
│                     IDENTITY TYPES                          │
├─────────────────────────────┬───────────────────────────────┤
│     STANDARD USER           │     ANONYMOUS SOURCE          │
├─────────────────────────────┼───────────────────────────────┤
│  OAuth (Google/Twitter)     │  Wallet signature only        │
│  Email stored               │  No email, no PII             │
│  NEAR account linked        │  Implicit NEAR account        │
│  Full profile visible       │  Codename only                │
│  Can consume + rate intel   │  Can submit + earn            │
│  Identity recoverable       │  Identity = private key       │
└─────────────────────────────┴───────────────────────────────┘
```

### Anonymous Source Registration

```
┌──────────────────────────────────────────────────────────────┐
│                  ANONYMOUS REGISTRATION                       │
│                                                              │
│  Client (Browser/App)           Platform                     │
│         │                           │                        │
│         │  1. Generate Ed25519 keypair (LOCAL ONLY)          │
│         │     privateKey → stored locally/exported           │
│         │     publicKey  → sent to platform                  │
│         │                           │                        │
│         │  2. Sign challenge ──────>│                        │
│         │     sig = sign(nonce, privateKey)                  │
│         │                           │                        │
│         │                           │  3. Verify signature   │
│         │                           │     Generate codename  │
│         │                           │     Create record:     │
│         │                           │     {                  │
│         │                           │       codename,        │
│         │                           │       publicKey,       │
│         │                           │       createdAt        │
│         │                           │     }                  │
│         │                           │                        │
│         │  4. <── Return codename ──│                        │
│         │                           │                        │
│  ✓ Platform has: publicKey, codename                        │
│  ✗ Platform doesn't have: privateKey, identity, IP, email   │
└──────────────────────────────────────────────────────────────┘
```

### What We Store (Anonymous Source)

```sql
CREATE TABLE humint_sources (
  -- Identity (minimal)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT UNIQUE NOT NULL,        -- "ALPINE-7"
  public_key TEXT UNIQUE NOT NULL,      -- For signature verification
  
  -- Coverage
  domains TEXT[],                       -- ["china", "military"]
  regions TEXT[],                       -- ["tehran", "isfahan"]
  event_types TEXT[],                   -- ["protests", "elections"]
  
  -- Reputation (crowd-sourced)
  reputation_score INTEGER DEFAULT 50,
  total_submissions INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  
  -- Monetization
  subscription_price_usdc DECIMAL(10,2),
  is_accepting_subscribers BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  
  -- NO: email, ip_address, real_name, oauth_id, user_agent
);

-- Payment addresses stored separately, unlinkable
CREATE TABLE source_payment_addresses (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES humint_sources(id),
  address TEXT NOT NULL,                -- NEAR account
  added_at TIMESTAMPTZ DEFAULT NOW(),
  -- Multiple addresses allowed, source picks per payout
  -- No way to link address to codename externally
);
```

---

## 2. HUMINT Submissions

### Submission Flow

```
Source (ALPINE-7)                    Platform                    Consumers
      │                                 │                            │
      │  1. Create submission           │                            │
      │     - Sign with private key     │                            │
      │     - Strip media metadata      │                            │
      │                                 │                            │
      │  2. POST /api/humint/submit ───>│                            │
      │     {                           │                            │
      │       content,                  │                            │
      │       signature,                │                            │
      │       publicKey                 │                            │
      │     }                           │                            │
      │                                 │  3. Verify signature       │
      │                                 │     Store submission       │
      │                                 │     Notify subscribers     │
      │                                 │                            │
      │                                 │  4. ──────────────────────>│
      │                                 │     New intel available    │
      │                                 │                            │
      │                                 │  5. <── Rate submission ───│
      │                                 │     ✓/✗/🤷                 │
      │                                 │                            │
      │  6. <── Reputation updated ─────│                            │
```

### Submission Schema

```sql
CREATE TABLE humint_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id),
  
  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_urls TEXT[],                    -- Platform-hosted, EXIF-stripped
  
  -- Context
  location_region TEXT,                 -- "Tehran" (source chooses granularity)
  location_country TEXT,
  event_tag TEXT,                       -- "2026-iran-protests"
  occurred_at TIMESTAMPTZ,              -- When event happened
  
  -- Cryptographic proof
  content_hash TEXT NOT NULL,           -- SHA-256 of content
  signature TEXT NOT NULL,              -- Source's signature
  
  -- Verification (crowd-sourced)
  verification_status TEXT DEFAULT 'unverified',
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  
  -- Metadata
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  is_time_sensitive BOOLEAN DEFAULT false,
  
  -- NO: source IP, user agent, precise coordinates
);

-- Ratings from consumers
CREATE TABLE submission_ratings (
  id UUID PRIMARY KEY,
  submission_id UUID REFERENCES humint_submissions(id),
  user_id UUID REFERENCES users(id),
  rating TEXT NOT NULL,                 -- 'verified', 'contradicted', 'neutral'
  evidence_url TEXT,                    -- Optional: link supporting rating
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(submission_id, user_id)        -- One rating per user per submission
);
```

---

## 3. Zero-Knowledge Proofs

### Where ZK Makes Sense

| Use Case | ZK Proof | What It Proves |
|----------|----------|----------------|
| **Reputation threshold** | zk-SNARK | "My score is > 70" without revealing exact score |
| **Location attestation** | zk-location | "I was in Tehran" without revealing coordinates |
| **Identity continuity** | zk-identity | "New codename is same person as old" for reputation transfer |
| **Payment verification** | zk-payment | "I received payment" without revealing amount/address |
| **Subscriber count** | zk-count | "I have > 100 subscribers" without revealing exact number |

### ZK Reputation Proof

```typescript
// Source proves they meet reputation threshold without revealing score
interface ReputationProof {
  // Public inputs
  threshold: number;              // e.g., 70
  publicKey: string;              // Source's key
  
  // Proof
  proof: string;                  // zk-SNARK proof
  
  // Verification
  verify(): boolean;              // Anyone can verify
}

// Use case: Bounty requires reputation > 70
// Source submits proof instead of revealing "my score is 84"
```

### ZK Location Attestation

```typescript
// Source proves presence in region without exact coordinates
interface LocationProof {
  // Public inputs
  region: string;                 // "Tehran"
  timestamp: number;              // When
  
  // Private inputs (not revealed)
  // exactCoordinates: [lat, lng]
  // deviceSignature: string
  
  // Proof
  proof: string;                  // zk proof of location
}

// How it works:
// 1. Source's device signs location data locally
// 2. ZK circuit proves coordinates are within region bounds
// 3. Proof submitted without revealing exact location
```

### ZK Identity Continuity (Codename Rotation)

```typescript
// Source rotates codename while preserving reputation
interface IdentityContinuityProof {
  // Public inputs
  oldCodename: string;            // "ALPINE-7"
  newCodename: string;            // "SIERRA-3"
  reputationScore: number;        // Transfers to new identity
  
  // Private inputs (not revealed)
  // privateKey: string           // Same key controls both
  
  // Proof
  proof: string;                  // Proves same owner
}

// Platform verifies proof, transfers reputation
// No one can link old and new codenames except source
```

---

## 4. NFT Source Lists

### Source List as NFT

```
┌─────────────────────────────────────────────────────────────┐
│                   SOURCE LIST NFT                            │
├─────────────────────────────────────────────────────────────┤
│  Token ID: 1234                                             │
│  Owner: alice.near                                          │
│                                                             │
│  Metadata:                                                  │
│    name: "Iran Ground Truth"                                │
│    description: "Verified on-ground sources in Iran"        │
│    sources: ["ALPINE-7", "ECHO-12", "ZEPHYR-3"]            │
│    source_count: 3                                          │
│                                                             │
│  Access Control:                                            │
│    is_public: false                                         │
│    subscription_price: 10 USDC/month                        │
│    subscribers: ["bob.near", "carol.near"]                  │
│                                                             │
│  Revenue:                                                   │
│    creator_royalty: 85%                                     │
│    platform_fee: 10%                                        │
│    source_share: 5% (split among sources)                   │
└─────────────────────────────────────────────────────────────┘
```

### Smart Contract

```rust
// source-list-nft contract
#[near_bindgen]
impl SourceListNFT {
    // Mint new list
    pub fn mint(&mut self, metadata: ListMetadata) -> TokenId {
        let token_id = self.next_token_id;
        self.tokens.insert(&token_id, &Token {
            owner: env::predecessor_account_id(),
            metadata,
            access: AccessControl::default(),
        });
        token_id
    }
    
    // Subscribe to list
    #[payable]
    pub fn subscribe(&mut self, token_id: TokenId, months: u32) {
        let token = self.tokens.get(&token_id).expect("Not found");
        let cost = token.access.subscription_price * months;
        
        // Verify USDC payment
        assert!(self.verify_usdc_payment(cost));
        
        // Add subscriber
        self.subscriptions.insert(&(token_id, env::predecessor_account_id()), &Subscription {
            starts_at: env::block_timestamp(),
            expires_at: env::block_timestamp() + (months * 30 * 24 * 60 * 60 * 1_000_000_000),
        });
        
        // Distribute revenue
        self.distribute_revenue(token_id, cost);
    }
    
    // Check access
    pub fn has_access(&self, token_id: TokenId, account: AccountId) -> bool {
        let token = self.tokens.get(&token_id).expect("Not found");
        
        // Public lists - everyone has access
        if token.access.is_public {
            return true;
        }
        
        // Owner always has access
        if token.owner == account {
            return true;
        }
        
        // Check subscription
        if let Some(sub) = self.subscriptions.get(&(token_id, account)) {
            return sub.expires_at > env::block_timestamp();
        }
        
        false
    }
}
```

---

## 5. Payment Architecture

### Payment Flow (USDC via NEAR)

```
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT FLOWS                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUBSCRIPTION PAYMENT                                       │
│  ───────────────────                                        │
│  Subscriber ──USDC──> Source List Contract                  │
│                           │                                 │
│                           ├── 85% ──> List Creator          │
│                           ├── 10% ──> Platform Treasury     │
│                           └──  5% ──> Sources (split)       │
│                                                             │
│  DIRECT TIP                                                 │
│  ──────────                                                 │
│  Consumer ──USDC──> Source's Payment Address                │
│                     (platform never touches funds)          │
│                                                             │
│  BOUNTY PAYOUT                                              │
│  ─────────────                                              │
│  Bounty Creator ──USDC──> Escrow Contract                   │
│                               │                             │
│                    (submission fulfills bounty)             │
│                               │                             │
│                           Source's Payment Address          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Privacy-Preserving Payments

```typescript
// Source sets up payment address (separate from codename account)
async function setupPaymentAddress(source: HumintSource): Promise<string> {
  // Source creates a NEW NEAR account just for payments
  // This account has no link to their codename on-chain
  
  // Option 1: Implicit account (hash of new keypair)
  const paymentKeypair = generateKeypair();
  const paymentAddress = toImplicitAccountId(paymentKeypair.publicKey);
  
  // Option 2: Named account (still unlinkable)
  const paymentAddress = `pay-${randomHex(8)}.near`;
  
  // Source registers this address with platform
  // Platform stores mapping (encrypted, only source can update)
  await registerPaymentAddress(source.codename, paymentAddress);
  
  return paymentAddress;
}

// Payment has no identifying information
interface PaymentRecord {
  // What we store
  payment_id: string;
  amount_usdc: number;
  destination: string;          // Payment address
  tx_hash: string;
  paid_at: Date;
  
  // What we DON'T store
  // source_codename - not linked to payment
  // submission_id - not linked to payment
  // We only know: "X USDC went to address Y"
}
```

---

## 6. Crowd Verification System

### Rating Flow

```
Consumer views submission
        │
        ▼
┌─────────────────────────────────┐
│  Rate this intel:               │
│                                 │
│  [✓ Verified]  - I can confirm  │
│  [✗ Contradicted] - This is wrong│
│  [🤷 Neutral]  - Can't verify   │
│                                 │
│  Evidence URL: [____________]   │
│  (optional)                     │
└─────────────────────────────────┘
        │
        ▼
Platform updates:
  - Submission verification status
  - Source reputation score
```

### Reputation Algorithm

```typescript
function updateReputation(source: HumintSource): number {
  const {
    total_submissions,
    verified_count,
    contradicted_count,
    account_age_days,
  } = source;
  
  // Base score
  let score = 50;
  
  // Verification ratio (up to +35)
  if (total_submissions > 0) {
    const verifyRatio = verified_count / total_submissions;
    score += verifyRatio * 35;
  }
  
  // Contradiction penalty (-10 each, max -30)
  const contradictionPenalty = Math.min(contradicted_count * 10, 30);
  score -= contradictionPenalty;
  
  // Longevity bonus (up to +10)
  const longevityBonus = Math.min(account_age_days / 36.5, 10);
  score += longevityBonus;
  
  // Activity bonus (up to +5)
  if (total_submissions >= 10) score += 2;
  if (total_submissions >= 50) score += 3;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}
```

### Anti-Gaming Measures

```typescript
// Prevent reputation manipulation
const antiGaming = {
  // Rater requirements
  raterMinAge: 7,                    // Days since registration
  raterMinActivity: 5,               // Previous ratings given
  
  // Rate limiting
  maxRatingsPerDay: 50,              // Per user
  maxRatingsPerSubmission: 1,        // One rating per user per submission
  
  // Sybil resistance
  ratingsRequireStake: true,         // Small NEAR stake to rate
  stakeAmount: 0.1,                  // 0.1 NEAR
  slashOnAbuse: true,                // Lose stake if caught gaming
  
  // Anomaly detection
  detectRatingRings: true,           // AI detects coordinated rating
  detectSelfRating: true,            // Prevent rating own submissions (diff accounts)
};
```

---

## 7. Source Discovery

### Profile Page

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────┐  ALPINE-7                          ⭐ 87/100      │
│  │ 🎭  │  ════════════════════════════════════════════     │
│  └─────┘  On-ground source in Iran                         │
│                                                             │
│  📍 Regions: Tehran, Isfahan, Shiraz                        │
│  📂 Domains: Civil Unrest, Politics, Military              │
│  📡 Events: Protests, Elections, Security                  │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  📊 Stats                                                   │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │ 142      │ 89%      │ 3%       │ 2 years  │             │
│  │ posts    │ verified │ disputed │ active   │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
│                                                             │
│  💰 Subscription: 5 USDC/month                              │
│                                                             │
│  [+ Add to Source List]  [📋 Subscribe]  [💵 Tip]          │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  Recent Posts                                               │
│                                                             │
│  📌 Security forces gathering near Azadi Square            │
│     2 hours ago · Tehran · ✓ 12 verified                   │
│                                                             │
│  📌 Internet disruptions reported in Isfahan               │
│     5 hours ago · Isfahan · ✓ 8 verified                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Search & Filter

```typescript
// API: GET /api/humint/sources
interface SourceSearchParams {
  // Coverage filters
  regions?: string[];           // ["iran", "tehran"]
  domains?: string[];           // ["civil-unrest", "military"]
  event_types?: string[];       // ["protests"]
  
  // Reputation filters
  min_reputation?: number;      // 70
  min_posts?: number;           // 10
  min_verified_ratio?: number;  // 0.8
  
  // Availability
  accepting_subscribers?: boolean;
  has_recent_activity?: boolean;  // Active in last 7 days
  
  // Sort
  sort_by?: 'reputation' | 'recent_activity' | 'subscriber_count';
}
```

---

## 8. Database Schema (Complete)

```sql
-- Anonymous HUMINT sources
CREATE TABLE humint_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT UNIQUE NOT NULL,
  public_key TEXT UNIQUE NOT NULL,
  
  -- Profile
  bio TEXT,
  domains TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  event_types TEXT[] DEFAULT '{}',
  
  -- Reputation
  reputation_score INTEGER DEFAULT 50,
  total_submissions INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  
  -- Monetization
  subscription_price_usdc DECIMAL(10,2),
  is_accepting_subscribers BOOLEAN DEFAULT false,
  total_earnings_usdc DECIMAL(20,6) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

-- Payment addresses (unlinkable to codename externally)
CREATE TABLE source_payment_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions
CREATE TABLE humint_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id),
  
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  
  location_region TEXT,
  location_country TEXT,
  event_tag TEXT,
  occurred_at TIMESTAMPTZ,
  is_time_sensitive BOOLEAN DEFAULT false,
  
  content_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  
  verification_status TEXT DEFAULT 'unverified',
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings
CREATE TABLE submission_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES humint_submissions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  rating TEXT NOT NULL CHECK (rating IN ('verified', 'contradicted', 'neutral')),
  evidence_url TEXT,
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, user_id)
);

-- Source subscriptions (direct to source)
CREATE TABLE source_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id),
  subscriber_id UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  amount_paid_usdc DECIMAL(10,2),
  payment_tx_hash TEXT,
  UNIQUE(source_id, subscriber_id)
);

-- NFT source lists
CREATE TABLE source_list_nfts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id BIGINT UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id),
  list_id UUID REFERENCES source_lists(id),
  
  is_public BOOLEAN DEFAULT false,
  subscription_price_usdc DECIMAL(10,2),
  subscription_duration_days INTEGER DEFAULT 30,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- List subscriptions
CREATE TABLE list_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_token_id BIGINT NOT NULL,
  subscriber_id UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  amount_paid_usdc DECIMAL(10,2),
  payment_tx_hash TEXT
);

-- Bounties
CREATE TABLE intel_bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id),
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  domains TEXT[],
  regions TEXT[],
  
  reward_usdc DECIMAL(10,2) NOT NULL,
  min_source_reputation INTEGER DEFAULT 50,
  
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'paid', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  
  fulfilled_by UUID REFERENCES humint_sources(id),
  fulfillment_submission_id UUID REFERENCES humint_submissions(id),
  payment_tx_hash TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ZK proofs (for audit/verification)
CREATE TABLE zk_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_type TEXT NOT NULL,  -- 'reputation', 'location', 'identity_continuity'
  public_inputs JSONB NOT NULL,
  proof_data TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_humint_sources_reputation ON humint_sources(reputation_score DESC);
CREATE INDEX idx_humint_sources_regions ON humint_sources USING GIN(regions);
CREATE INDEX idx_humint_sources_domains ON humint_sources USING GIN(domains);
CREATE INDEX idx_humint_submissions_source ON humint_submissions(source_id);
CREATE INDEX idx_humint_submissions_event ON humint_submissions(event_tag);
CREATE INDEX idx_submission_ratings_submission ON submission_ratings(submission_id);
```

---

## 9. API Endpoints

### Anonymous Source Endpoints

```
POST   /api/humint/register          # Anonymous registration
POST   /api/humint/submit            # Submit intel (signed)
GET    /api/humint/sources           # List/search sources
GET    /api/humint/sources/:codename # Source profile
GET    /api/humint/submissions       # List submissions (filterable)
GET    /api/humint/submissions/:id   # Single submission
POST   /api/humint/rate/:id          # Rate submission
```

### Subscription Endpoints

```
POST   /api/humint/subscribe/:codename   # Subscribe to source
GET    /api/humint/subscriptions         # My subscriptions
DELETE /api/humint/subscriptions/:id     # Unsubscribe
```

### NFT Source List Endpoints

```
POST   /api/sources/lists/:id/mint       # Mint list as NFT
POST   /api/sources/lists/:id/subscribe  # Subscribe to NFT list
GET    /api/sources/lists/:id/access     # Check access
```

### Bounty Endpoints

```
POST   /api/bounties                 # Create bounty
GET    /api/bounties                 # List bounties
POST   /api/bounties/:id/claim       # Claim with submission
```

### ZK Proof Endpoints

```
POST   /api/zk/reputation/prove      # Generate reputation proof
POST   /api/zk/reputation/verify     # Verify reputation proof
POST   /api/zk/location/prove        # Generate location proof
POST   /api/zk/identity/rotate       # Rotate codename with proof
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Database schema migration
- [ ] Anonymous registration flow
- [ ] Basic submission/rating API
- [ ] Source profile pages

### Phase 2: Monetization (Week 2)
- [ ] NFT source list contract
- [ ] Subscription payments (USDC)
- [ ] Direct tipping
- [ ] Revenue distribution

### Phase 3: Discovery & Reputation (Week 2-3)
- [ ] Source search/filter
- [ ] Reputation algorithm
- [ ] Anti-gaming measures
- [ ] Bounty system

### Phase 4: ZK Proofs (Week 3-4)
- [ ] Reputation threshold proofs
- [ ] Location attestation
- [ ] Identity rotation
- [ ] Payment verification

### Phase 5: Privacy Hardening (Week 4)
- [ ] Tor-friendly access
- [ ] Payment address rotation
- [ ] Audit logging
- [ ] Security review

---

## 11. Security Model

### What Platform Knows

| Data | Standard User | Anonymous Source |
|------|--------------|------------------|
| Email | ✓ | ✗ |
| Real name | ✓ (if provided) | ✗ |
| IP address | ✓ | ✗ (Tor supported) |
| Public key | ✓ | ✓ |
| Codename | N/A | ✓ |
| Submissions | N/A | ✓ (by codename) |
| Payment address | ✓ | ✓ (unlinkable to codename) |

### What Platform Cannot Know

- Real identity of anonymous sources
- Link between codename and payment address (externally)
- Link between old and new codenames (after rotation)
- Exact reputation score (only ZK proofs)
- Exact location (only region-level)

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Platform subpoenaed | No PII stored for anonymous sources |
| Database breach | Payment addresses unlinkable to codenames |
| Rogue admin | No identity mapping exists to leak |
| Source coercion | Codename rotation with ZK proof |
| Payment tracing | Separate payment accounts, optional rotation |
| Sybil attacks | Stake requirement, rating limits |

---

*This architecture enables a crowdsourced intelligence network where sources can remain truly anonymous while building verifiable reputation and earning payments - with the platform designed to be unable to compromise their identity.*

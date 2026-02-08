# HUMINT Architecture: Privacy-First Informant Network

## Vision

Transform Argus from a passive intelligence aggregator into an active intelligence network where human sources can anonymously contribute information, build reputation, and earn payments - all while maintaining zero-trust privacy guarantees.

---

## 1. NFT Source Lists (Subscription Model)

### Smart Contract: `source-list-nft`

```
┌─────────────────────────────────────────────────┐
│              Source List NFT                     │
├─────────────────────────────────────────────────┤
│ token_id: u64                                   │
│ owner: AccountId                                │
│ metadata: {                                     │
│   name: string                                  │
│   description: string                           │
│   source_count: u32                             │
│   cid: string (IPFS - encrypted source list)   │
│ }                                               │
│ access_control: {                               │
│   is_public: bool                               │
│   subscribers: Set<AccountId>                   │
│   subscription_price: U128 (USDC)               │
│   subscription_duration_days: u32               │
│ }                                               │
│ royalties: {                                    │
│   creator_share: u16 (basis points)             │
│   platform_share: u16                           │
│ }                                               │
└─────────────────────────────────────────────────┘
```

### Subscription Flow

```
User                    Contract                 Creator
  │                        │                        │
  │── subscribe(token_id, duration) ───────────────>│
  │        │                                        │
  │        │── transfer USDC ──────────────────────>│
  │        │                                        │
  │<─ access_token (time-limited) ─│                │
  │                                                 │
  │── fetch_sources(access_token) ─>│               │
  │<─ decrypted source list ───────│               │
```

### Database Extensions

```sql
-- NFT metadata cache (mirrors on-chain data)
CREATE TABLE source_list_nfts (
  id UUID PRIMARY KEY,
  token_id BIGINT UNIQUE NOT NULL,
  owner_account_id TEXT NOT NULL,
  list_id UUID REFERENCES source_lists(id),
  is_public BOOLEAN DEFAULT false,
  subscription_price_usdc DECIMAL(20, 6),
  subscription_duration_days INTEGER,
  ipfs_cid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription records
CREATE TABLE list_subscriptions (
  id UUID PRIMARY KEY,
  nft_token_id BIGINT NOT NULL,
  subscriber_account_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  payment_tx_hash TEXT,
  payment_amount_usdc DECIMAL(20, 6),
  status TEXT DEFAULT 'active', -- active, expired, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. HUMINT Source Type

### New Source Category

```typescript
type SourceType = 
  | 'rss' 
  | 'youtube' 
  | 'web' 
  | 'twitter' 
  | 'telegram' 
  | 'podcast' 
  | 'government'
  | 'humint';  // NEW

interface HumintSource {
  id: string;
  type: 'humint';
  
  // Pseudonymous identity
  codename: string;           // "ALPINE-7", "WINTER-ECHO"
  publicKey: string;          // For encrypted comms
  
  // Reputation
  trustScore: number;         // 0-100, algorithm-computed
  totalSubmissions: number;
  verifiedSubmissions: number;
  contradictedSubmissions: number;
  
  // Privacy
  isAnonymous: boolean;
  linkedAccountId?: string;   // Only if NOT anonymous
  
  // Domains of expertise
  domainIds: string[];
  
  // Payment
  paymentAddress?: string;    // NEAR account for USDC
  totalEarnings: number;
}
```

### Database Schema

```sql
-- HUMINT sources (informants)
CREATE TABLE humint_sources (
  id UUID PRIMARY KEY,
  codename TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,           -- For encrypted submissions
  
  -- Identity (nullable for anonymous)
  user_id UUID REFERENCES users(id),
  near_account_id TEXT,
  is_anonymous BOOLEAN DEFAULT true,
  
  -- Reputation
  trust_score INTEGER DEFAULT 50,
  total_submissions INTEGER DEFAULT 0,
  verified_submissions INTEGER DEFAULT 0,
  contradicted_submissions INTEGER DEFAULT 0,
  
  -- Payment
  payment_address TEXT,               -- NEAR account for USDC
  total_earnings_usdc DECIMAL(20, 6) DEFAULT 0,
  
  -- Metadata
  domain_ids UUID[],
  bio_encrypted TEXT,                 -- Encrypted with platform key
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

-- HUMINT submissions
CREATE TABLE humint_submissions (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES humint_sources(id),
  
  -- Content (encrypted at rest)
  title TEXT NOT NULL,
  content_encrypted TEXT NOT NULL,    -- AES-256-GCM encrypted
  content_hash TEXT NOT NULL,         -- For verification
  
  -- Classification
  domain_id UUID,
  priority TEXT DEFAULT 'routine',    -- routine, priority, flash
  confidence_self_reported INTEGER,   -- Source's own confidence
  
  -- Verification
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID[],                 -- Analyst user IDs
  cross_references UUID[],            -- Matching articles
  final_confidence INTEGER,
  
  -- Payment
  bounty_amount_usdc DECIMAL(20, 6),
  payment_status TEXT DEFAULT 'pending',
  payment_tx_hash TEXT,
  
  -- Metadata
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ              -- Time-sensitive intel
);

-- Bounties for specific intelligence
CREATE TABLE intel_bounties (
  id UUID PRIMARY KEY,
  created_by UUID REFERENCES users(id),
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  domain_id UUID,
  
  -- Reward
  reward_usdc DECIMAL(20, 6) NOT NULL,
  reward_pool_address TEXT,           -- Escrow account
  
  -- Requirements
  min_source_trust_score INTEGER DEFAULT 30,
  requires_verification BOOLEAN DEFAULT true,
  
  -- Status
  status TEXT DEFAULT 'open',         -- open, claimed, paid, expired
  expires_at TIMESTAMPTZ,
  
  -- Fulfillment
  fulfilled_by UUID REFERENCES humint_sources(id),
  fulfillment_submission_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Authentication Architecture

### Dual Auth Paths

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Layer                      │
├────────────────────────────┬────────────────────────────────┤
│      Standard OAuth        │       Anonymous Wallet          │
├────────────────────────────┼────────────────────────────────┤
│  Email/Google/Twitter      │  NEAR Wallet Only              │
│         ↓                  │         ↓                      │
│  Privy/Bastion Auth        │  Wallet Signature Challenge    │
│         ↓                  │         ↓                      │
│  NEAR Account Created      │  Implicit Account (MPC)        │
│         ↓                  │         ↓                      │
│  Full Identity             │  Pseudonymous Only             │
│  (can be HUMINT source)    │  (HUMINT source possible)      │
│         ↓                  │         ↓                      │
│  DID: did:near:alice.near  │  DID: did:near:anon-abc123     │
└────────────────────────────┴────────────────────────────────┘
```

### Anonymous Signup Flow

```typescript
// 1. Generate keypair client-side (never leaves browser)
const keyPair = await generateEd25519KeyPair();

// 2. Create implicit NEAR account
const implicitAccountId = Buffer.from(keyPair.publicKey).toString('hex');

// 3. Register with backend (no email, no OAuth)
const response = await fetch('/api/auth/anonymous', {
  method: 'POST',
  body: JSON.stringify({
    publicKey: keyPair.publicKey,
    signature: await sign(challenge, keyPair.privateKey),
  }),
});

// 4. Store private key in browser (user's responsibility)
// Option: Encrypt with password and store in localStorage
// Option: Export as file for cold storage
```

### Session Management

```typescript
interface UserSession {
  // Common
  sessionId: string;
  did: string;
  nearAccountId: string;
  
  // Auth type
  authType: 'oauth' | 'anonymous';
  
  // OAuth-specific
  email?: string;
  oauthProvider?: 'google' | 'twitter' | 'email';
  
  // Anonymous-specific
  isAnonymous: boolean;
  codename?: string;  // For HUMINT sources
  
  // Capabilities
  canSubmitHumint: boolean;
  canReceivePayments: boolean;
  trustScore?: number;
}
```

---

## 4. Zero-Trust Privacy Architecture

### Encryption Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Classification                       │
├─────────────────────────────────────────────────────────────┤
│  PUBLIC          │ On-chain, unencrypted                    │
│  (articles,      │ - Article titles, URLs                   │
│   domains)       │ - Domain metadata                        │
│                  │ - Public source lists                    │
├──────────────────┼──────────────────────────────────────────┤
│  PROTECTED       │ Encrypted at rest (AES-256-GCM)          │
│  (user prefs,    │ - User preferences                       │
│   subscriptions) │ - Subscription records                   │
│                  │ - Private source lists                   │
├──────────────────┼──────────────────────────────────────────┤
│  CONFIDENTIAL    │ End-to-end encrypted                     │
│  (HUMINT)        │ - Informant identities                   │
│                  │ - Raw submissions                        │
│                  │ - Payment addresses                      │
├──────────────────┼──────────────────────────────────────────┤
│  SECRET          │ TEE-only (Phala Network)                 │
│  (key material)  │ - Decryption keys                        │
│                  │ - MPC key shares                         │
│                  │ - Identity mappings                      │
└──────────────────┴──────────────────────────────────────────┘
```

### HUMINT Submission Privacy

```
Informant                    Backend                      Analysts
    │                           │                            │
    │── Generate submission ───>│                            │
    │   (encrypted with         │                            │
    │    platform public key)   │                            │
    │                           │                            │
    │                           │── Store encrypted ─────────│
    │                           │   (codename only visible)  │
    │                           │                            │
    │                           │── Notify analysts ────────>│
    │                           │   (domain match)           │
    │                           │                            │
    │                           │<─ Request decryption ──────│
    │                           │   (requires 2+ analysts)   │
    │                           │                            │
    │                           │── TEE decryption ─────────>│
    │                           │   (audit logged)           │
    │                           │                            │
    │<── Reputation update ─────│                            │
    │    (anonymous)            │                            │
```

### Access Control (ABAC)

```typescript
interface AccessPolicy {
  resource: 'humint_submission' | 'source_list' | 'payment_record';
  
  conditions: {
    // Who can access
    roles: ('analyst' | 'admin' | 'subscriber' | 'owner')[];
    
    // Context requirements
    minTrustScore?: number;
    requiresMFA?: boolean;
    requiresMultiParty?: number;  // N-of-M approval
    
    // Time constraints
    validFrom?: Date;
    validUntil?: Date;
    
    // Audit
    logAccess: boolean;
    alertOnAccess?: boolean;
  };
}
```

---

## 5. Payment Architecture (NEAR Intents + Chain Signatures)

### Payment Flow for HUMINT

```
┌─────────────────────────────────────────────────────────────┐
│                    Payment Flow                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Submission verified by analysts                         │
│         ↓                                                   │
│  2. Backend creates payment intent                          │
│     {                                                       │
│       recipient: informant.paymentAddress,                  │
│       amount: bounty.rewardUsdc,                           │
│       token: "usdc.near",                                  │
│       memo: hash(submissionId)  // No identifying info     │
│     }                                                       │
│         ↓                                                   │
│  3. Intent submitted to NEAR                                │
│     (signed by platform treasury via Chain Signatures)      │
│         ↓                                                   │
│  4. USDC transferred to informant                           │
│         ↓                                                   │
│  5. Receipt stored (encrypted, audit trail)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Smart Contract: `argus-treasury`

```rust
// Treasury for HUMINT payments
pub struct ArgusTreasury {
    owner: AccountId,
    
    // Balances
    usdc_balance: Balance,
    
    // Payment tracking (hashes only, no recipient info)
    payment_hashes: UnorderedSet<CryptoHash>,
    
    // Rate limits
    daily_limit_usdc: Balance,
    daily_spent: Balance,
    last_reset: Timestamp,
    
    // Multi-sig for large payments
    signers: Vec<AccountId>,
    required_signatures: u8,
}

impl ArgusTreasury {
    // Pay informant (called by backend with MPC signature)
    pub fn pay_informant(
        &mut self,
        payment_hash: CryptoHash,  // hash(submission_id + recipient)
        amount: Balance,
        recipient: AccountId,      // Informant's payment address
    ) -> Promise {
        // Verify not already paid
        assert!(!self.payment_hashes.contains(&payment_hash));
        
        // Rate limit check
        self.check_rate_limit(amount);
        
        // Record payment
        self.payment_hashes.insert(&payment_hash);
        
        // Transfer USDC
        ext_usdc::ft_transfer(
            recipient,
            amount.into(),
            None,
            usdc_contract(),
            1,
            GAS_FOR_TRANSFER,
        )
    }
}
```

### Subscription Payments

```typescript
// Subscribe to source list
async function subscribeToList(
  tokenId: string,
  durationDays: number
): Promise<SubscriptionResult> {
  const nft = await fetchNFTMetadata(tokenId);
  const totalCost = nft.subscriptionPrice * durationDays;
  
  // 1. Approve USDC spend
  await usdcContract.ft_transfer_call({
    receiver_id: 'argus-subscriptions.near',
    amount: totalCost.toString(),
    msg: JSON.stringify({
      action: 'subscribe',
      token_id: tokenId,
      duration_days: durationDays,
    }),
  });
  
  // 2. Contract handles:
  //    - Payment to list owner (minus platform fee)
  //    - Subscription record creation
  //    - Access token generation
  
  return {
    expiresAt: new Date(Date.now() + durationDays * 86400000),
    accessToken: await generateAccessToken(tokenId),
  };
}
```

---

## 6. Reputation System

### Trust Score Algorithm

```typescript
function calculateTrustScore(source: HumintSource): number {
  const {
    totalSubmissions,
    verifiedSubmissions,
    contradictedSubmissions,
    accountAge,
    paymentHistory,
  } = source;
  
  // Base score from verification ratio
  const verificationRatio = totalSubmissions > 0
    ? verifiedSubmissions / totalSubmissions
    : 0;
  
  // Penalty for contradictions
  const contradictionPenalty = contradictedSubmissions * 5;
  
  // Bonus for longevity
  const ageBonus = Math.min(accountAge / 365, 10); // Max 10 points for 1 year
  
  // Bonus for payment history (shows commitment)
  const paymentBonus = paymentHistory.length > 0 ? 5 : 0;
  
  // Calculate final score
  let score = 50; // Base
  score += verificationRatio * 30;  // Up to +30 for 100% verified
  score -= contradictionPenalty;     // -5 per contradiction
  score += ageBonus;                 // Up to +10 for tenure
  score += paymentBonus;             // +5 for receiving payments
  
  return Math.max(0, Math.min(100, Math.round(score)));
}
```

### Reputation Decay

```sql
-- Daily job to decay inactive sources
UPDATE humint_sources
SET trust_score = GREATEST(30, trust_score - 1)
WHERE last_active_at < NOW() - INTERVAL '30 days'
  AND trust_score > 30;
```

---

## 7. Implementation Phases

### Phase 1: NFT Source Lists (Week 1)
- [ ] Deploy `source-list-nft` contract to testnet
- [ ] Add subscription database tables
- [ ] Build subscription API endpoints
- [ ] Integrate USDC payments

### Phase 2: Anonymous Auth (Week 1-2)
- [ ] Wallet-only signup flow
- [ ] Signature challenge auth
- [ ] Session management for anonymous users
- [ ] Codename generation

### Phase 3: HUMINT Source Type (Week 2)
- [ ] Database schema for HUMINT
- [ ] Encrypted submission flow
- [ ] Analyst verification interface
- [ ] Reputation tracking

### Phase 4: Payments (Week 2-3)
- [ ] Deploy `argus-treasury` contract
- [ ] Chain Signatures integration
- [ ] Payment intent system
- [ ] Bounty marketplace

### Phase 5: Privacy Hardening (Week 3)
- [ ] TEE integration for key management
- [ ] Multi-party decryption
- [ ] Audit logging
- [ ] Access control policies

---

## 8. Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Informant identity leak | E2E encryption, no PII stored |
| Payment tracing | Separate payment addresses, no on-chain metadata |
| Sybil attacks (fake sources) | Stake requirement, verification threshold |
| Analyst compromise | Multi-party decryption, audit logs |
| Backend compromise | Keys in TEE, encrypted at rest |
| Bribery/coercion | Anonymous submissions, plausible deniability |

### Anonymity Set

- All HUMINT submissions from anonymous sources use shared transaction patterns
- Payment timing randomized (not immediate after verification)
- Codenames rotatable with reputation transfer

---

## Next Steps

1. Get Aaron's feedback on architecture
2. Prioritize phases based on hackathon timeline
3. Start with Bastion auth integration (when code is pushed)
4. Build NFT contract for source lists

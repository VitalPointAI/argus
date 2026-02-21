---
sidebar_position: 5
---

# HUMINT Sources

Human Intelligence (HUMINT) sources are anonymous individuals who provide on-the-ground intelligence. Unlike traditional sources (RSS feeds, news sites), HUMINT sources are people with direct access to events, locations, or information.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     HUMINT Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Source (Anonymous)           Platform           Consumers  │
│         │                        │                    │     │
│         │── Register ───────────>│                    │     │
│         │   (codename only)      │                    │     │
│         │                        │                    │     │
│         │── Create Packages ────>│                    │     │
│         │   (custom pricing)     │                    │     │
│         │                        │                    │     │
│         │── Post Intel ─────────>│── Feed ──────────>│     │
│         │   (encrypted+ZK)       │                    │     │
│         │                        │                    │     │
│         │                        │<── Subscribe ─────│     │
│         │                        │   (pay any token) │     │
│         │                        │                    │     │
│         │<── Payment (USDC) ─────│                    │     │
│         │                        │                    │     │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 🔒 End-to-End Encryption

- **All premium content encrypted**: Only subscribers can decrypt
- **Epoch-based keys**: Scalable key management (not per-post)
- **On-chain access control**: NFT-gated content access
- **IPFS storage**: Content stored off-chain, hash anchored on-chain

### 🛡️ Zero-Knowledge Proofs

Sources can attach ZK proofs to verify claims without revealing sensitive data:

- **Location Proof**: "I'm within 50km of Kyiv" (without revealing exact coordinates)
- **Reputation Proof**: "My reputation is ≥70" (without revealing exact score)
- **Identity Proof**: Prove continuity when rotating codename

### 💰 Flexible Subscription Packages

Sources create their own packages:

| Example Package | Price (USDC) | Duration |
|-----------------|--------------|----------|
| Weekly Briefing | $5 | 7 days |
| Monthly Intel | $20 | 30 days |
| Annual VIP | $150 | 365 days |
| One-time Report | $10 | 30 days |

**Payment**: Subscribers pay with any token via NEAR Intents 1Click. Sources receive USDC.

### 📱 X/Twitter-Style Feed

- Real-time intel feed from subscribed sources
- Locked posts show preview (subscribe to unlock)
- ZK proof badges (📍 Verified, ⭐ Trusted)
- Tier-based content access

---

## For Sources: How to Participate

### Step 1: Become a Source

1. Navigate to `/humint/sources/new`
2. Choose your **codename** (permanent, choose wisely)
3. Write a brief bio
4. Create subscription packages (optional - you can post free content only)

```
Codename: ALPINE-7
Bio: On-ground observer in Eastern Europe
Packages:
  - Weekly Brief: $5/7 days
  - Full Access: $20/30 days
```

### Step 2: Post Intel

From `/humint/compose`:

1. Write your intel (up to 5,000 characters)
2. Choose visibility: **Free** (everyone) or **Paid** (subscribers only)
3. Optionally attach **ZK proofs** to verify claims:
   - Click the shield icon (🛡️)
   - Generate location proof (uses browser GPS)
   - Generate reputation proof (proves score ≥ threshold)
4. Post

Your content is encrypted and stored on IPFS. Only the content hash is anchored on NEAR.

### Step 3: Manage Subscribers

View your subscribers and earnings in your source dashboard. Payments are direct - no platform holding funds.

### Attaching ZK Proofs

ZK proofs add credibility without compromising privacy:

**Location Proof:**
```
"Prove I'm within 50km of target coordinates"
→ Browser gets your GPS
→ ZK circuit computes distance
→ Proof attached: "📍 Verified Location"
→ Your exact location is NEVER revealed
```

**Reputation Proof:**
```
"Prove my reputation ≥ 70"
→ System checks your score (e.g., 85)
→ ZK circuit generates proof
→ Proof attached: "⭐ Trusted Source"
→ Your exact score is NOT revealed
```

---

## For Consumers: How to Subscribe

### Browsing the Feed

Visit `/humint/feed` to see:

- Posts from sources you follow
- Free posts from all sources
- Locked posts (subscribe to unlock)
- ZK proof badges on verified posts

### Subscribing to a Source

1. Find a source you want to follow
2. Click "Subscribe"
3. Choose a package (e.g., "$20 / 30 days")
4. Pay with any token:
   - ETH, SOL, NEAR, USDC, etc.
   - 1Click converts to USDC
   - Source receives payment directly

### Viewing Encrypted Content

Once subscribed:
- Locked posts automatically unlock
- Content decrypted in your browser
- No server ever sees plaintext

---

## Technical Details

### Encryption Flow

```
Source posts:
  plaintext → AES-256-GCM encrypt → IPFS
  content_hash → NEAR contract (anchor)

Subscriber views:
  IPFS fetch → epoch_key derive → AES decrypt → plaintext
```

### Key Derivation

```
subscriber_key = X25519(subscriber_privkey, source_pubkey)
epoch_key = SHA256(subscriber_key || epoch || tier)
```

Keys are derived from DH exchange - never stored.

### On-Chain Data

The NEAR contract (`humint.argus-intel.near`) stores:
- Source registrations (codename_hash, public_key)
- Post anchors (post_id, content_hash, content_cid, tier, epoch)
- Access pass NFTs (subscriber → source, tier, expiry)
- Per-post exclusions (revoked access)

Actual content is on IPFS (encrypted).

---

## Security Model

### What the Platform Knows

| Data | Stored? |
|------|---------|
| Your real identity | ❌ Never |
| Your email | ❌ Never (codename only) |
| Your exact location | ❌ Never (ZK proofs only) |
| Your codename hash | ✅ On-chain reference |
| Your encrypted posts | ✅ On IPFS (unreadable without key) |
| Your public key | ✅ For key derivation |

### ZK Proof Security

Proofs use Groth16 ZK-SNARKs with:
- `reputation.circom` - 489 constraints
- `location.circom` - 331 constraints
- `identity-rotation.circom` - 945 constraints

Verification keys are public. Anyone can verify proofs.

---

## FAQ

### What tokens can I pay with?

Any token supported by NEAR Intents 1Click: ETH, USDC, SOL, NEAR, MATIC, ARB, etc. It's auto-converted to USDC for the source.

### Can sources see who subscribes?

Sources see that *someone* subscribed (anonymous ID). They don't see your identity, email, or wallet address.

### What if a source goes inactive?

Your subscription still expires normally. No refunds for inactive sources.

### How do location proofs work without GPS spoofing?

Currently uses browser GPS (honor system). Future: trusted attestation from hardware security modules.

### Can I rotate my codename?

Yes, using a ZK identity proof. Your reputation transfers without linking old/new codenames.

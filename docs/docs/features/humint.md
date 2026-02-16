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
│         │   (wallet only)        │                    │     │
│         │                        │                    │     │
│         │── Submit Intel ───────>│                    │     │
│         │   (signed)             │                    │     │
│         │                        │── Notify ────────>│     │
│         │                        │                    │     │
│         │                        │<── Rate ──────────│     │
│         │                        │   (verify/dispute) │     │
│         │                        │                    │     │
│         │<── Reputation Update ──│                    │     │
│         │                        │                    │     │
│         │<── Payment ────────────│                    │     │
│         │   (USDC via NEAR)      │                    │     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 🔒 True Anonymity

- **No identity stored**: Platform never knows who you are
- **Wallet-only login**: No email, no OAuth, no tracking
- **Codename system**: You're known only as "ALPINE-7" or "ECHO-12"
- **Separate payment address**: Earnings go to an unlinkable wallet

### ⭐ Crowd-Verified Reputation

- Consumers rate your intel: verified, contradicted, or neutral
- Your reputation score (0-100) builds over time
- Higher reputation = more subscribers = more earnings
- No single authority decides your credibility

### 💰 Privacy-First Payments

- **Zcash Shielded (z-address)**: Maximum privacy - sender, receiver, amount all hidden
- **Cross-Chain via NEAR Intents**: Receive on any chain (ETH, SOL, BTC, etc.)
- Subscription revenue from followers
- Bounty rewards from intel bounties
- Shielded escrow for high-risk payouts

---

## For Sources: How to Participate

### Step 1: Anonymous Registration

To become a HUMINT source, you must use **anonymous wallet login**:

1. Generate a keypair in your browser (private key never leaves your device)
2. Sign a challenge to prove you control the key
3. Receive your codename (e.g., "ZEPHYR-9")

:::warning Important
If you log in with email, Google, or Twitter, you **cannot** register as a HUMINT source. This is by design - those login methods attach identity, breaking anonymity.
:::

### Step 2: Set Up Your Profile

Configure your source profile:

- **Regions**: Where you can report from (e.g., Tehran, Kyiv, Lagos)
- **Domains**: Topics you cover (e.g., Military, Politics, Civil Unrest)
- **Event Types**: What you report on (e.g., Protests, Elections, Conflicts)
- **Bio**: Brief description (keep it vague for safety)

### Step 3: Submit Intelligence

When you have intel to share:

1. Write your report (title + body)
2. Add context (location, event tag, when it happened)
3. Optionally attach media (EXIF data is stripped automatically)
4. Sign the submission with your private key
5. Submit

Your submission is cryptographically signed, proving it came from you without revealing who you are.

### Step 4: Build Reputation

Your reputation score is calculated from:

| Factor | Impact |
|--------|--------|
| Verified submissions | +35 points max |
| Contradicted submissions | -10 points each |
| Account age | +10 points max (1 year) |
| Activity level | +5 points for consistent posting |

Tips for building reputation:
- Start with easily verifiable intel
- Provide sources/evidence when possible
- Be accurate - contradictions hurt more than silence
- Stay active in your claimed regions/domains

### Step 5: Earn Payments

Three ways to earn:

1. **Subscriptions**: Set a monthly price, followers pay for your feed
2. **Tips**: One-time payments from appreciative consumers
3. **Bounties**: Fulfill intel requests from the job board

#### Payment Options (by privacy level)

| Method | Privacy | Description |
|--------|---------|-------------|
| 🛡️ ZEC Shielded | Maximum | z-address payments hide sender, receiver, AND amount |
| 🔒 Cross-chain | Medium | Any chain via NEAR Intents (transparent but convenient) |

**For high-risk sources**: Use a Zcash z-address (starts with `zs1`). Payments go through our shielded escrow - there's no on-chain link between Argus and you.

**For convenience**: Receive on any chain - ETH, SOL, BTC, ARB, etc. Payments converted via Near Intents.

---

## For Consumers: How to Use HUMINT

### Finding Sources

Browse HUMINT sources by:
- **Region**: Find sources covering specific locations
- **Domain**: Filter by topic expertise
- **Reputation**: Set minimum reputation threshold
- **Activity**: See who's been active recently

### Evaluating Intel

When viewing submissions, consider:

- **Source reputation**: Higher = more historically accurate
- **Verification status**: Has the crowd confirmed this?
- **Evidence**: Did they provide supporting information?
- **Timing**: Is this fresh or stale?

### Rating Submissions

Help build the verification layer:

- **✓ Verified**: You can confirm this intel (ideally with evidence)
- **✗ Contradicted**: This conflicts with known facts
- **🤷 Neutral**: Can't confirm or deny

Your ratings improve the system for everyone.

### Subscribing to Sources

If you find valuable sources:

1. Subscribe for ongoing access (monthly USDC)
2. Add them to your source lists (mix with RSS, etc.)
3. Get their intel in your briefings

### Posting Bounties

Need specific intel? Post a bounty:

1. Describe what you need
2. Set regions/domains
3. Offer a reward (USDC)
4. Wait for sources to fulfill

See [Intel Job Board](/features/intel-bounties) for details.

---

## Security Model

### What the Platform Knows

| Data | Stored? |
|------|---------|
| Your real identity | ❌ Never |
| Your email | ❌ Never (wallet login only) |
| Your IP address | ❌ Not logged for anonymous sessions |
| Your public key | ✅ For signature verification |
| Your codename | ✅ Your pseudonym |
| Your submissions | ✅ Attributed to codename |
| Your payment address | ✅ Unlinkable to codename |

### What the Platform Cannot Do

- Reveal your identity (we don't have it)
- Link your payment address to your codename (separate systems)
- Fake your submissions (cryptographically signed)
- Modify your reputation (crowd-controlled)

### Your Responsibilities

- **Protect your private key**: It's your identity. Lose it = lose access.
- **Use a separate payment wallet**: Don't link to personal accounts
- **Consider your OPSEC**: Don't reveal identifying details in submissions
- **Use Tor/VPN if needed**: For additional network privacy

---

## Codename Examples

Codenames are randomly generated in the format `ADJECTIVE-NUMBER`:

- ALPINE-7
- ECHO-12
- PHANTOM-88
- RAVEN-23
- SIERRA-5
- THUNDER-41
- WINTER-3
- ZEPHYR-99

You can request a codename rotation while preserving your reputation (ZK proof required).

---

## FAQ

### Can I be both a regular user and a HUMINT source?

No. If you log in with email/OAuth, you cannot register as a source. You'd need a completely separate wallet-only session.

### What if I lose my private key?

You lose access to that source identity. There's no recovery - that's the privacy tradeoff. Start fresh with a new codename (reputation starts over).

### Can I withdraw my earnings to a bank?

For maximum privacy, use Zcash shielded (z-address). You receive ZEC directly - convert to fiat via P2P or privacy-preserving methods.

For convenience, you can receive on any chain and use an exchange. Note: exchanges have KYC requirements that may compromise anonymity.

### How do I prove I was in a location?

Currently honor system + crowd verification. ZK location proofs are on the roadmap.

### Can I report on sensitive topics safely?

We provide technical anonymity. Operational security (what you say, when you post, patterns) is your responsibility. Consider delay-posting for sensitive intel.

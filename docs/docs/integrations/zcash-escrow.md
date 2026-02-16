---
sidebar_position: 4
---

# Zcash Shielded Escrow

Argus uses Zcash shielded transactions for maximum-privacy HUMINT payments. This document covers the escrow system architecture.

## Overview

For high-risk sources, transparent blockchain payments create a dangerous paper trail. Even if we don't know who the source is, an adversary can see "someone received payment from Argus" and investigate further.

Zcash shielded transactions (z-addresses) solve this by hiding:
- **Sender** (Argus escrow pool)
- **Receiver** (source's z-address)
- **Amount** (payment size)

## Architecture

```
Consumer pays (USDC/NEAR/etc)
         ↓
    Near Intents
         ↓
Transparent ZEC → Argus t-address
         ↓
    Shield operation (t→z)
         ↓
    Shielded escrow pool (z-address)
         ↓
    z→z payout to source
```

### Flow Details

1. **Consumer Payment**: Consumer pays for bounty/subscription in any supported currency
2. **Near Intents Conversion**: Converts to ZEC, deposited to our transparent address
3. **Shielding**: We move ZEC from t-address to our z-address (shielded pool)
4. **Escrow Hold**: Funds held in shielded pool until release conditions met
5. **Shielded Payout**: z→z transfer to source's z-address - completely private

## Addresses

| Type | Address | Purpose |
|------|---------|---------|
| Transparent (t-addr) | `t1L5D4HtBGFgkKQGL7AMH8613sUPd4Mt6ek` | Receiving Near Intents deposits |
| Shielded (z-addr) | `zs1e0jxyugqem4sg...` | Escrow pool for payouts |

## Bounty Escrow

When a bounty is posted:

1. Creator deposits funds (converted to ZEC via Near Intents)
2. ZEC is shielded into escrow pool
3. Bounty status: `open` → funds locked

When bounty is fulfilled:

1. Source submits intel that satisfies bounty
2. Creator (or crowd) verifies submission
3. If accepted: escrow releases z→z to source
4. If rejected: escrow returns to creator

```typescript
// Example bounty payout
const result = await processBountyPayout(bountyId);
// Returns: { success: true, operationId: 'opid-xxx' }
```

## Subscription Escrow

For recurring subscriptions:

1. Subscriber pays monthly fee
2. Converted to ZEC and shielded
3. Released to source at end of billing period
4. Automatic renewal or cancellation

## Privacy Levels

| Method | Privacy | Use Case |
|--------|---------|----------|
| z→z (shielded) | Maximum | High-risk sources |
| t→z (shielding) | High | Incoming deposits |
| t→t (transparent) | Low | Not used |

## Operational Security

### For Sources

- **Always use z-addresses** (start with `zs1`)
- **Never reuse addresses** - generate new for each source
- **Create offline** if in hostile environment
- **Don't mix** with personal wallet activity

### For Argus

- Shield incoming funds promptly
- Batch shield operations when possible
- Monitor escrow balance
- Rotate addresses periodically

## API Endpoints

```bash
# Get escrow status
GET /api/escrow/status

# Shield incoming ZEC (admin)
POST /api/escrow/shield

# Process bounty payout (admin)
POST /api/escrow/bounty/:id/release
```

## Configuration

Required environment variables:

```bash
ZCASH_RPC_URL=http://127.0.0.1:8232
ZCASH_RPC_USER=argus_zcash
ZCASH_RPC_PASS=<secret>
ZCASH_T_ADDRESS=t1L5D4HtBGFgkKQGL7AMH8613sUPd4Mt6ek
ZCASH_Z_ADDRESS=zs1e0jxyugqem4sg...
```

## Node Requirements

- zcashd v6.x or later
- ~30GB disk for blockchain
- 4GB RAM recommended
- Sapling parameters downloaded

## Recovery

The wallet recovery phrase is stored securely. In case of server loss:

1. Install zcashd on new server
2. Restore from 24-word phrase
3. Rescan blockchain
4. Resume operations

⚠️ **Never share the recovery phrase**. It controls all escrow funds.

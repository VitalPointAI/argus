---
sidebar_position: 6
---

# Access Passes

Access Passes are the subscription mechanism for source lists on Argus. When you subscribe to a source list, you receive an Access Pass that grants you entry to the content.

## How It Works

```
Subscribe → Payment → Access Pass Minted → Content Unlocked
```

1. **Browse** the marketplace for source lists
2. **Choose a package** (Free, Monthly, Yearly, Lifetime)
3. **Subscribe** with any supported token via Near Intents
4. **Receive** your Access Pass automatically
5. **Access** the source list content instantly

## On-Chain Verification

All Access Pass ownership is verified on-chain via the NEAR blockchain. This means:

- **Trustless** - No database can be manipulated
- **Transparent** - Anyone can verify your access
- **Portable** - Your pass works across any interface
- **Permanent** - Lifetime passes never expire

### Verification Flow

```
1. User requests content
2. API queries NEAR contract: has_access(account, listId)
3. Contract returns true/false
4. Content delivered if authorized
```

## Free Tier

Creators can offer free Access Passes to build their audience:

- **No payment required** - Users only pay minimal gas fees
- **Full tracking** - Analytics show all subscribers
- **Community building** - Identify your audience
- **Future monetization** - Upgrade free users to paid tiers later

## Package Types

| Type | Duration | Use Case |
|------|----------|----------|
| Free | Lifetime | Audience building, samples |
| Monthly | 30 days | Regular updates, testing |
| Quarterly | 90 days | Committed subscribers |
| Annual | 365 days | Discounted long-term |
| Lifetime | Forever | One-time purchase |

## For Creators

### Setting Up Packages

1. Go to **Sources → My Lists → [Your List] → Packages**
2. Click **Create Package**
3. Set name, price, duration, and benefits
4. Toggle **Free Tier** for $0 packages
5. Save and your package appears in the marketplace

### Revenue

- Payments sent directly to you via smart contract
- No middlemen, no custodial holding

## API Reference

### Verify Access

```bash
GET /api/access/verify/:listId
```

Returns:
```json
{
  "success": true,
  "hasAccess": true,
  "tokenId": "list:abc123:user.near",
  "expiresAt": "2027-02-13T00:00:00Z",
  "verifiedOnChain": true
}
```

### Get Content (Gated)

```bash
GET /api/access/content/:listId
```

Returns content CID only if user holds valid Access Pass.

### My Passes

```bash
GET /api/access/my-passes
```

Returns all Access Passes owned by the authenticated user.

## Smart Contract

**Contract:** `source-lists.argus-intel.near`

**Token Standard:** NEP-171 (NFT)

**Key Methods:**
- `has_access(account_id, token_id)` - Check ownership
- `nft_tokens_for_owner(account_id)` - List owned passes
- `get_list_metadata(token_id)` - Get list details

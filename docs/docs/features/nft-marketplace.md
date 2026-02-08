---
sidebar_position: 7
---

# NFT Source List Marketplace

Trade curated intelligence source lists as NFTs on NEAR Protocol.

## Overview

The marketplace enables:
- **Curators** to monetize their research by minting source lists as NFTs
- **Analysts** to purchase access to expertly curated source collections
- **Creators** to earn ongoing royalties from secondary sales

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    NFT Lifecycle                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CREATE           2. MINT              3. TRADE          │
│  ┌─────────┐        ┌─────────┐         ┌─────────┐        │
│  │ Curate  │   →    │ Encrypt │   →     │ List on │        │
│  │ sources │        │ + IPFS  │         │ market  │        │
│  └─────────┘        └─────────┘         └─────────┘        │
│       │                  │                   │              │
│       ↓                  ↓                   ↓              │
│  Source list        NFT minted          Buyers can         │
│  in dashboard       on NEAR             purchase           │
│                                                             │
│  4. ACCESS                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Owner → Decrypt CID → Fetch from IPFS → View list   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Smart Contracts

### Source List NFT (NEP-171)

Each NFT represents ownership of a source list:

```rust
pub struct SourceListMetadata {
    pub cid: String,           // IPFS CID of encrypted data
    pub source_count: u32,     // Number of sources
    pub domain: String,        // Category/domain
    pub creator: AccountId,    // Original creator
    pub is_active: bool,       // Actively maintained?
    pub price: Option<U128>,   // Sale price (if listed)
    pub royalty_percent: u8,   // Creator royalty (0-100%)
}
```

### Data Registry

Maps NEAR accounts to their encrypted data on IPFS:

```rust
pub struct DataEntry {
    pub cid: String,           // IPFS CID
    pub version: u64,          // Version number
    pub data_hash: String,     // For verification
    pub public_key: String,    // For encryption
}
```

## Minting a Source List

### Prerequisites

1. A source list created in your dashboard
2. A NEAR wallet (Bastion, MyNearWallet, etc.)
3. Small amount of NEAR for storage (~0.1 NEAR)

### Steps

1. **Go to your source list** in the dashboard
2. Click **"Mint as NFT"**
3. Set your parameters:
   - **Price**: How much to sell for (in NEAR)
   - **Royalty %**: Your cut on resales (default 10%)
4. **Sign the transaction** with your NEAR wallet
5. Wait for confirmation

### What Happens

1. Your source list data is encrypted with your public key
2. Encrypted data is uploaded to IPFS
3. NFT is minted on NEAR with the IPFS CID
4. You now own the NFT and can list it for sale

## Buying a Source List

1. Browse the **Marketplace** page
2. Find a list that interests you
3. Click **"Buy"** and confirm the price
4. Sign the transaction with your NEAR wallet
5. NFT transfers to your account
6. You can now decrypt and access the sources

### Royalties

When you resell an NFT:
- Original creator receives their royalty %
- You receive the rest

Example: 10% royalty, sell for 5 NEAR:
- Creator gets 0.5 NEAR
- You get 4.5 NEAR

## Updating a List

As the owner, you can update the source list:

1. Make changes to sources (add/remove)
2. Click **"Update NFT"**
3. New data is encrypted and uploaded
4. NFT metadata is updated with new CID
5. Version number increments

Previous owners cannot see updates - only the current owner.

## API Reference

### Get Marketplace Listings

```bash
GET /api/nft/marketplace
```

Returns all NFTs currently listed for sale.

### Get Owned NFTs

```bash
GET /api/nft/owned/:accountId
```

Returns NFTs owned by a specific NEAR account.

### Prepare Mint Transaction

```bash
POST /api/nft/prepare-mint
Content-Type: application/json

{
  "listId": "uuid-of-source-list",
  "price": "5",
  "royaltyPercent": 10
}
```

Returns unsigned transaction for frontend to sign.

### Check Access

```bash
GET /api/nft/access/:tokenId/:accountId
```

Verifies if an account owns a specific NFT.

## Security

### Encryption

- Source data is encrypted **before** upload to IPFS
- Only the NFT owner can decrypt
- Transfer = new owner generates new encryption key
- Old owner loses access automatically

### On-Chain Verification

- Ownership is verifiable on NEAR
- Transaction history is transparent
- Royalty enforcement is automatic

## Best Practices

### For Curators

1. **Build quality lists** - High-quality sources command higher prices
2. **Describe well** - Clear descriptions help buyers understand value
3. **Set fair royalties** - 5-15% is typical
4. **Keep lists updated** - Active maintenance adds value

### For Buyers

1. **Check source count** - More isn't always better
2. **Verify creator reputation** - Look at their track record
3. **Consider the domain** - Ensure it matches your needs
4. **Review ratings** - If available, check community feedback

## Contract Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Testnet | NFT | `argus-nft.testnet` |
| Testnet | Registry | `argus-data.testnet` |
| Mainnet | NFT | TBD |
| Mainnet | Registry | TBD |

## FAQ

### Can I preview a list before buying?

You can see the source count, domain, and description. The actual sources are only visible after purchase.

### What if the creator stops maintaining the list?

The `is_active` flag shows maintenance status. Inactive lists may still be valuable but won't receive updates.

### Can I clone someone else's list?

Not directly - the data is encrypted. You'd need to purchase it first, then create your own based on it.

### What happens if I lose my private key?

You lose access to decrypt the source data. The NFT still shows ownership, but you can't view the sources.

### Are there gas fees?

Yes, NEAR transactions require small fees (fractions of a cent). Minting costs more due to storage deposits.

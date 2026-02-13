---
sidebar_position: 5
---

# Source List Marketplace

Subscribe to curated intelligence source lists from expert analysts.

## Overview

The marketplace enables:
- **Creators** to monetize their research by selling access to curated source lists
- **Analysts** to subscribe to expertly curated source collections
- **Everyone** to benefit from transparent, on-chain access verification

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Subscription Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. BROWSE          2. SUBSCRIBE         3. ACCESS          │
│  ┌─────────┐        ┌─────────┐         ┌─────────┐        │
│  │ Find    │   →    │ Choose  │   →     │ Get     │        │
│  │ lists   │        │ package │         │ pass    │        │
│  └─────────┘        └─────────┘         └─────────┘        │
│       │                  │                   │              │
│       ↓                  ↓                   ↓              │
│  Marketplace        Pay with any        Access Pass        │
│  /marketplace       token via 1Click    minted on NEAR     │
│                                                             │
│  4. VERIFY (On-Chain)                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Request → Check contract → Return content if valid  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Packages

Creators can offer multiple subscription tiers:

| Package Type | Description |
|--------------|-------------|
| **Free** | Build audience, users get pass for analytics |
| **Monthly** | 30-day access, recurring |
| **Quarterly** | 90-day access |
| **Annual** | 365-day access, usually discounted |
| **Lifetime** | One-time purchase, forever access |

## Pricing

- **Direct payments** - 95% goes to creator, 5% platform fee
- **Any token** - Pay with NEAR, USDC, or other tokens via 1Click
- **No custodial holding** - Funds go directly to creator wallet

## For Creators

### Creating a Listing

1. **Build your source list** at `/sources/manage`
2. **Add sources** via RSS, web scraping, or manual entry
3. **Enable marketplace** listing in list settings
4. **Create packages** with pricing at `/sources/lists/[id]/packages`
5. **Publish** and appear in the marketplace

### Best Practices

- Write clear descriptions of what's included
- List specific benefits for each package tier
- Offer a free tier to build initial audience
- Keep sources actively maintained
- Respond to subscriber questions

## For Subscribers

### Finding Lists

1. **Browse** the marketplace at `/marketplace/source-lists`
2. **Filter** by domain, price, or rating
3. **Sort** by popularity, newest, or price
4. **Preview** list details and creator info

### Subscribing

1. **Select a package** that fits your needs
2. **Click Subscribe** to open payment
3. **Pay** with any supported token
4. **Access** content immediately after payment

### Managing Subscriptions

View your subscriptions at `/marketplace/my-subscriptions`:
- Active passes with expiration dates
- Renewal options
- Access history

## Smart Contract

**Contract Address:** `source-lists.argus-intel.near`

**Token Standard:** NEP-171 (Non-Fungible Token)

**Key Features:**
- On-chain access verification
- Automatic expiration handling
- Creator royalties on secondary sales
- Transparent ownership records

## API Reference

See [Access Passes](./access-passes) for API endpoints.

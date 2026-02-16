---
sidebar_position: 6
---

# Intel Job Board (Bounties)

The Intel Job Board allows anyone to post requests for specific intelligence, offering rewards to HUMINT sources who can fulfill them.

## How Bounties Work

```
┌─────────────────────────────────────────────────────────────┐
│                    Bounty Lifecycle                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Requester              Platform              Source        │
│      │                     │                     │          │
│      │── Create Bounty ───>│                     │          │
│      │   + Escrow USDC     │                     │          │
│      │                     │                     │          │
│      │                     │── List Bounty ─────>│          │
│      │                     │                     │          │
│      │                     │<── Claim + Submit ──│          │
│      │                     │                     │          │
│      │<── Review ──────────│                     │          │
│      │                     │                     │          │
│      │── Approve ─────────>│                     │          │
│      │                     │── Release USDC ───>│          │
│      │                     │                     │          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Creating a Bounty

### What You Need

1. **Title**: Clear, specific request
2. **Description**: Detailed requirements
3. **Regions** (optional): Geographic focus
4. **Domains** (optional): Topic areas
5. **Reward**: USDC amount you're offering
6. **Minimum Reputation**: Required source reputation (default: 50)
7. **Expiration**: When the bounty closes

### Good Bounty Examples

✅ **Specific and Actionable:**
> **Title:** Current status of Route 7 bridge near Kharkiv
> 
> **Description:** Need confirmation whether the bridge is intact, damaged, or destroyed. Photo evidence preferred. Any info on military presence in the area.
> 
> **Region:** Kharkiv, Ukraine
> **Domain:** Military, Infrastructure
> **Reward:** 50 USDC
> **Min Reputation:** 70

✅ **Event-Based:**
> **Title:** Eyewitness account of March 15 protests in Tehran
> 
> **Description:** Looking for first-hand accounts of the protests near Azadi Square. Crowd size estimates, police response, any notable incidents.
> 
> **Region:** Tehran, Iran
> **Domain:** Civil Unrest
> **Reward:** 30 USDC

### Bad Bounty Examples

❌ **Too vague:**
> "Tell me what's happening in China"

❌ **Illegal/harmful:**
> "Location of specific individual" (doxxing)

❌ **Unrealistic expectations:**
> "Full military base layout with guard schedules" for 5 USDC

## Anonymous Bounty Posting

You can post bounties anonymously using wallet login:

- Your identity is never attached to the bounty
- Payment comes from an escrow address
- Sources can't see who posted the request

This is useful when:
- You don't want sources to know who needs the intel
- The request might be sensitive
- You prefer operational separation

## For Sources: Claiming Bounties

### Finding Bounties

Browse the job board filtered by:
- Your regions of coverage
- Your domain expertise
- Reward amount
- Expiration date

### Before Claiming

Check:
- Do you meet the minimum reputation requirement?
- Can you actually fulfill this request?
- Is the reward worth the effort/risk?
- Is the request ethical and legal?

### Claiming Process

1. **Claim the Bounty**: Indicates you're working on it
2. **Gather Intel**: Do your work
3. **Submit Fulfillment**: Post your intel as a submission, linked to the bounty
4. **Wait for Review**: Requester evaluates your submission
5. **Receive Payment**: If approved, USDC is released from escrow

### Partial Fulfillment

If you can only partially fulfill a request:
- Submit what you have
- Clearly note what's missing
- Requester may approve partial payment
- Or reject and keep bounty open

## Escrow System

### How It Works

1. Requester deposits funds when creating bounty
2. Funds converted to ZEC via Near Intents
3. ZEC is **shielded** into our escrow pool (t→z transfer)
4. Funds remain in shielded escrow until:
   - Bounty fulfilled → Shielded payout (z→z) to source's z-address
   - Bounty expires → Refund to requester
   - Requester cancels (if unclaimed) → Refund

### Privacy Guarantee

```
Requester pays USDC → Near Intents → Transparent ZEC → Shield → Escrow Pool
                                                              ↓
Source receives ←────────── Shielded ZEC (z→z) ←─────────────┘
```

**Result**: No on-chain link between requester payment and source payout. Adversaries see "someone paid Argus" and "Argus holds shielded ZEC" but cannot trace to individual sources.

### Dispute Resolution

If source and requester disagree:
- Submission goes to community review
- If crowd verifies the intel, source gets paid
- If crowd disputes, funds return to requester
- Platform takes no side - crowd decides

## Bounty Pricing Guide

| Intel Type | Typical Range |
|------------|---------------|
| Public event confirmation | 5-20 USDC |
| Local situation report | 15-50 USDC |
| Photo/video evidence | 25-100 USDC |
| Detailed regional analysis | 50-200 USDC |
| High-risk area coverage | 100-500 USDC |
| Exclusive/breaking intel | 200+ USDC |

Factors affecting price:
- **Risk level**: Dangerous areas command higher prices
- **Specificity**: Precise requests cost more
- **Urgency**: Time-sensitive intel is premium
- **Verification difficulty**: Hard-to-verify intel costs more
- **Source reputation required**: Higher rep = fewer eligible sources

## API Reference

### Create Bounty

```bash
POST /api/bounties
Authorization: Bearer <token>

{
  "title": "Current status of Mariupol port",
  "description": "Looking for recent intel on port operations...",
  "domains": ["military", "infrastructure"],
  "regions": ["mariupol", "ukraine"],
  "rewardUsdc": 75,
  "minSourceReputation": 60,
  "expiresAt": "2024-03-01T00:00:00Z"
}
```

### List Bounties

```bash
GET /api/bounties?status=open&region=ukraine&minReward=50
```

### Claim Bounty

```bash
POST /api/bounties/:id/claim
Authorization: Bearer <wallet-signature>
```

### Fulfill Bounty

```bash
POST /api/bounties/:id/fulfill
Authorization: Bearer <wallet-signature>

{
  "submissionId": "uuid-of-your-submission"
}
```

## Best Practices

### For Requesters

1. **Be specific**: Vague requests get vague answers
2. **Set realistic rewards**: Good intel costs money
3. **Provide context**: Why do you need this? (Helps sources understand)
4. **Set appropriate reputation minimums**: Higher = fewer but better sources
5. **Respond promptly**: Don't leave sources waiting

### For Sources

1. **Only claim what you can deliver**: Your reputation is on the line
2. **Provide evidence**: Photos, sources, corroboration
3. **Be honest about limitations**: Partial info is better than fabrication
4. **Meet deadlines**: Expired claims hurt your reputation
5. **Document your process**: How you obtained the intel (without compromising yourself)

## Safety Considerations

### For Requesters

- Don't post bounties that could endanger sources
- Consider the ethics of what you're asking
- Don't request personally identifiable information about individuals

### For Sources

- Evaluate risk before claiming high-stakes bounties
- Don't take unnecessary risks for small rewards
- Use delay-posting for sensitive intel
- Consider your operational security

---

## FAQ

### Can I cancel a bounty I posted?

Yes, if it hasn't been claimed. Once claimed, you must wait for the source to submit or the claim to expire.

### What if no one claims my bounty?

Funds return to you when the bounty expires.

### Can multiple sources claim the same bounty?

By default, bounties are single-claim. Multi-claim bounties (for aggregate intel) are a roadmap feature.

### How do I know if a source is reliable?

Check their reputation score, verification history, and how long they've been active. Higher reputation = more verified track record.

### What prevents fake fulfillments?

Crowd verification. If you approve a submission that the crowd later disputes, it affects the source's reputation. If you reject a valid submission, the crowd can override.

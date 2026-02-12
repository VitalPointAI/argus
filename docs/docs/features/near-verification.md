---
sidebar_position: 8
---

# On-Chain Verification (NEAR)

Argus uses NEAR blockchain for immutable proof verification. This provides:

- **Immutable timestamp** - Block height proves when intel was verified
- **Public audit trail** - Anyone can verify proof authenticity
- **Third-party attestations** - Other accounts can vouch for proofs
- **Source reputation** - On-chain track record

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ ZK Proof    │  │ Commitment  │  │ Submit to               │  │
│  │ Generation  │→ │ Computation │→ │ Argus API               │  │
│  │ (snarkjs)   │  │ (SHA-256)   │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Argus API                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Verify      │  │ Store in    │  │ Register on             │  │
│  │ Proof       │→ │ Database    │→ │ NEAR Blockchain         │  │
│  │             │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                    NEAR Blockchain                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                intel-registry.argus.near                     │ │
│  │  • Proof commitments                                         │ │
│  │  • Third-party attestations                                  │ │
│  │  • Source reputation scores                                  │ │
│  │  • Verification status                                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Proof Generation (Client-Side)

Private data never leaves the user's device:

```typescript
// User has a photo with GPS coordinates
const exif = extractExif(image);  // { lat: 51.5074, lng: -0.1278 }

// Generate ZK proof that location is within 5km of target
const proof = await generateLocationProximityProof({
  actualLat: exif.lat,        // PRIVATE - stays on device
  actualLng: exif.lng,        // PRIVATE - stays on device
  targetLat: 51.5,            // PUBLIC
  targetLng: -0.1,            // PUBLIC
  radiusKm: 5,                // PUBLIC
});

// Only send proof + public inputs (not actual coordinates)
await submitProof(proof);
```

### 2. Commitment Computation

A commitment is a hash that binds the proof to the source and intel:

```typescript
commitment = SHA256(proof || publicInputs || sourceId)
```

This allows:
- Anyone to verify data matches the commitment
- No way to determine original data from commitment
- Immutable binding to specific intel submission

### 3. On-Chain Registration

```typescript
// Register on NEAR (costs ~0.001 NEAR)
POST /api/near/register
{
  "submissionId": "uuid-of-zk-proof-submission"
}

// Response
{
  "proofId": "abc123...",
  "commitment": "deadbeef...",
  "blockHeight": 123456789,
  "status": "Pending"
}
```

### 4. Third-Party Attestations

Anyone with a NEAR account can attest to a proof:

```typescript
POST /api/near/attest
{
  "proofId": "abc123...",
  "confidence": 85,  // 1-100
  "note": "Verified via satellite imagery"
}
```

When average confidence reaches 70+, status becomes "Verified".

## Proof Types

| Type | What It Proves | Private Data | Public Data |
|------|----------------|--------------|-------------|
| `LocationProximity` | Within X km of coordinates | Actual lat/lng | Target coords, radius, result |
| `TimestampRange` | Event occurred in timeframe | Actual timestamp | Time range, result |
| `DocumentContains` | Document has keywords | Full document | Keyword hashes, count |
| `ImageMetadata` | Photo has specific EXIF | Full image | Metadata hashes |
| `VerifiableCredential` | Holder of credential | Credential details | Issuer, type, validity |

## API Reference

### Register Proof

```http
POST /api/near/register
Authorization: Bearer <source-token>

{
  "submissionId": "uuid",  // OR provide raw data:
  "proof": "...",
  "publicInputs": "...",
  "proofType": "LocationProximity",
  "intelContent": "...",
  "metadata": {}
}
```

### Get Proof

```http
GET /api/near/proof/:proofId
```

### Attest to Proof

```http
POST /api/near/attest
{
  "proofId": "...",
  "confidence": 85,
  "note": "Optional note"
}
```

### Get Source Reputation

```http
GET /api/near/reputation/:codename
```

### Verify Commitment

```http
POST /api/near/verify
{
  "proofId": "...",
  "proof": "...",
  "publicInputs": "..."
}
```

## Smart Contract

The `intel-registry` contract is deployed on NEAR:

- **Mainnet**: `intel-registry.argus.near`
- **Testnet**: `intel-registry.argus-test.testnet`

### Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `register_proof` | Change | Store proof commitment |
| `attest` | Change | Add attestation |
| `refute_proof` | Change | Mark as refuted (admin) |
| `get_proof` | View | Get proof details |
| `get_source_stats` | View | Get source statistics |
| `get_source_reputation` | View | Calculate reputation (0-100) |
| `verify_commitment` | View | Check commitment matches |

### Reputation Formula

```
reputation = 
  (verified / total) * 50 +      // Verification rate
  min(avg_confidence, 30) +      // Attestation quality
  min(total_proofs, 10) -        // Activity bonus
  (refuted / total) * 30         // Refutation penalty
```

## Environment Variables

```bash
# Network (mainnet or testnet)
NEAR_NETWORK_ID=mainnet

# Contract account
NEAR_INTEL_REGISTRY_CONTRACT=intel-registry.argus.near

# Argus account (for signing transactions)
NEAR_ACCOUNT_ID=argus.near

# Path to credentials
NEAR_KEY_PATH=~/.near-credentials
```

## Costs

| Operation | Gas | Cost (approx) |
|-----------|-----|---------------|
| Register proof | ~10 TGas | ~0.001 NEAR |
| Add attestation | ~5 TGas | ~0.0005 NEAR |
| View methods | - | Free |

## Security Considerations

1. **Privacy**: Only commitments stored on-chain, not raw data
2. **Immutability**: Once registered, proofs cannot be modified
3. **Timestamping**: Block height provides trustless timestamp
4. **Attestations**: Can be updated but not deleted
5. **Source identity**: Hashed codenames protect anonymity

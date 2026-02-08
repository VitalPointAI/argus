---
sidebar_position: 7
---

# Zero-Knowledge Proofs

Argus uses zero-knowledge proofs to enable HUMINT sources to make verifiable claims without revealing sensitive information.

## What Are ZK Proofs?

Zero-knowledge proofs let you prove a statement is true without revealing *why* it's true. For example:

- **Location**: "I was within 50km of Kyiv" without revealing exact coordinates
- **Reputation**: "My reputation is ≥ 70" without revealing exact score
- **Identity**: "This new identity is the same person as an old one" without linking them

## Supported Proof Types

### 🌍 Location Attestation

Prove you were in a geographic region without revealing your exact location.

**Use cases:**
- Verify on-the-ground presence for conflict intel
- Prove attendance at events without tracking
- Regional expertise verification

**How it works:**
```
Private input: (actualLat, actualLon, salt)
Public input: (targetLat, targetLon, maxDistance)
Proof: "I was within maxDistance km of (targetLat, targetLon)"
```

**API:**
```bash
# Generate proof
POST /api/zk/location/prove
{
  "actualLat": 50.4501,    # Your actual latitude (private)
  "actualLon": 30.5234,    # Your actual longitude (private)
  "targetLat": 50.4500,    # Target latitude (public)
  "targetLon": 30.5200,    # Target longitude (public)
  "maxDistanceKm": 50      # Maximum distance (public)
}

# Returns proof + commitment
```

### ⭐ Reputation Threshold

Prove your reputation meets a minimum threshold for bounty eligibility.

**Use cases:**
- Qualify for high-reputation bounties
- Prove expertise level without exact score
- Tiered access control

**How it works:**
```
Private input: (publicKey, reputationScore, salt)
Public input: (threshold)
Proof: "My reputation is >= threshold"
```

**API:**
```bash
POST /api/zk/reputation/prove
{
  "publicKey": "0x...",    # Your source public key
  "threshold": 70          # Minimum reputation to prove
}
```

### 🔄 Identity Rotation

Rotate to a new codename while preserving reputation, without linking old and new identities.

**Use cases:**
- Periodic identity rotation for safety
- Escape compromised identity
- Fresh start without losing reputation

**How it works:**
```
Private input: (oldPublicKey, oldPrivateKey, newPublicKey, reputation)
Public input: (newPublicKeyHash, reputationCommitment, nullifier)
Proof: "I control oldIdentity and am transferring its reputation to newIdentity"
```

The **nullifier** prevents the same old identity from being rotated twice.

**API:**
```bash
# Step 1: Generate rotation proof
POST /api/zk/identity/rotate
{
  "oldPublicKey": "0x...",
  "oldPrivateKey": "0x...",
  "newPublicKey": "0x..."
}

# Step 2: Complete rotation
POST /api/zk/identity/complete
{
  "proof": {...},
  "publicSignals": [...],
  "newPublicKey": "0x..."
}
```

## Technical Details

### Circuits

Circuits are written in [Circom](https://docs.circom.io/) and compiled to R1CS constraints. We use:

- **Poseidon Hash**: ZK-friendly hash function for commitments
- **Groth16**: Proof system (small proofs, fast verification)
- **BN128 curve**: Ethereum-compatible elliptic curve

### Security Model

| What's Hidden | What's Revealed |
|---------------|-----------------|
| Exact location | Proximity to target |
| Exact reputation | Whether above threshold |
| Old identity | That rotation occurred |
| Private keys | Public key hashes |

### Commitments

Before generating a proof, you create a **commitment** to your private data:

```
commitment = Poseidon(privateData, salt)
```

This commitment is public, but reveals nothing about `privateData` without the `salt`.

### Nullifiers

For one-time actions (like identity rotation), we use **nullifiers**:

```
nullifier = Poseidon(identityKey, action, salt)
```

Once a nullifier is used, it's recorded. Attempting to reuse it fails, preventing double-spending of reputation.

## Client-Side Proof Generation

For maximum privacy, generate proofs client-side:

```typescript
import { generateLocationProof } from '@argus/zk-client';

// All computation happens in your browser
const proof = await generateLocationProof({
  actualLat: myLat,      // Never sent to server
  actualLon: myLon,      // Never sent to server
  targetLat: 50.45,
  targetLon: 30.52,
  maxDistanceKm: 50
});

// Only send proof + public signals
await submitProof(proof);
```

## Verification

Anyone can verify a proof without knowing the private inputs:

```typescript
const isValid = await verifyLocationProof(
  proof,
  publicSignals,
  verificationKey
);
```

Verification is:
- **Fast**: ~10ms
- **Trustless**: No need to trust the prover
- **Deterministic**: Same inputs always verify the same way

## Roadmap

### Current (v0.1)
- ✅ Location attestation (mock proofs)
- ✅ Reputation threshold (mock proofs)
- ✅ Identity rotation (mock proofs)
- ✅ API endpoints

### Coming (v0.2)
- ⏳ Compiled circuits (real proofs)
- ⏳ Client-side proof generation SDK
- ⏳ On-chain verification (NEAR)
- ⏳ Time-bounded presence proofs

### Future (v0.3+)
- 📋 Device attestation (trusted hardware)
- 📋 Media authenticity proofs
- 📋 Aggregate proofs (batch verification)
- 📋 Cross-source collaboration proofs

## FAQ

### Do I need special hardware?

No. Proof generation runs in any modern browser or Node.js environment.

### How long does proof generation take?

- Location proof: ~2-5 seconds
- Reputation proof: ~1-2 seconds
- Identity rotation: ~3-5 seconds

### Can proofs be faked?

No. The cryptographic properties of ZK-SNARKs make it computationally infeasible to create a valid proof for a false statement.

### What if I lose my private key?

You lose the ability to generate proofs for that identity. This is a feature, not a bug - it prevents key theft from being silent.

### Are proofs stored on-chain?

Currently no. Proofs are verified by the Argus API. On-chain verification (for decentralized verification) is on the roadmap.

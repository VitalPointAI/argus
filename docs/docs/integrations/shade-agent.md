---
sidebar_position: 5
---

# NEAR Shade Agent (Planned)

Trustless content gating using NEAR Shade Agents on Phala Cloud TEE.

> ⚠️ **Status**: Implementation complete, awaiting NEAR Shade Agent mainnet release.

## Overview

The Shade Agent provides **trustless content decryption** for Access Pass holders. Encryption keys are stored in a TEE (Trusted Execution Environment) - no one, not even Argus, can access them.

## How It Will Work

```
┌─────────────────────────────────────────────────────┐
│                   Phala Cloud TEE                    │
│                   (Intel SGX)                        │
│  ┌───────────────────────────────────────────────┐  │
│  │           Argus Content Gate Agent            │  │
│  │                                               │  │
│  │  ┌─────────────┐    ┌──────────────────────┐ │  │
│  │  │ Key Storage │    │   NEAR RPC Client    │ │  │
│  │  │  (in TEE)   │    │  (verify NFT access) │ │  │
│  │  └─────────────┘    └──────────────────────┘ │  │
│  │         │                      │             │  │
│  │         ▼                      ▼             │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │         AES-256-GCM Decryption          │ │  │
│  │  │    + Attestation Signature Generation   │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Flow

1. **Creator uploads** source list → encrypted with AES-256 → stored on IPFS
2. **Encryption key** registered with Shade Agent (stored in TEE)
3. **User requests content** → signs challenge with NEAR wallet
4. **Agent verifies** NFT ownership on-chain via NEAR RPC
5. **If valid** → decrypts and returns content (key never leaves TEE)

## Security Properties

| Property | Description |
|----------|-------------|
| 🔐 **Keys in TEE** | AES keys stored in Intel SGX enclave memory |
| ✅ **On-chain verification** | NFT ownership checked via NEAR RPC |
| 📝 **Cryptographic attestation** | Every decryption is signed by agent |
| 🚫 **Zero trust** | No one (not even Argus) can access keys |

## Why This Matters

**Current model**: Content encryption keys could theoretically be accessed by platform operators.

**With Shade Agent**: Keys exist only inside the TEE. Even if the server is compromised, the keys remain secure. Users can cryptographically verify that the agent is running in a genuine TEE.

## API Design

### Request Decryption

```typescript
// Generate challenge
const challenge = `argus-content-access:${listId}:${nearAccount}:${Date.now()}:${nonce}`;

// Sign with NEAR wallet
const signature = await wallet.signMessage({ message: challenge });

// Request decryption from Shade Agent
const response = await fetch('https://shade-gate.phala.cloud/api/content/decrypt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    listId,
    nearAccount,
    signature: signature.signature,
    message: challenge,
    encryptedContent: base64EncryptedData
  })
});

const { content, attestation } = await response.json();
// attestation proves the response came from a genuine TEE
```

### Verify Attestation

```typescript
// Verify the TEE attestation
const attestationReport = await fetch('https://shade-gate.phala.cloud/api/attestation');
const { agentId, teeType, signature, publicKey } = await attestationReport.json();

// Verify signature matches Phala Cloud's expected measurements
const isGenuineTEE = verifyPhalaAttestation(signature, publicKey);
```

## Implementation Status

| Component | Status |
|-----------|--------|
| Server code (`shade-agent/`) | ✅ Complete |
| Docker configuration | ✅ Complete |
| Phala Cloud deployment config | ✅ Complete |
| NEAR contract integration | ✅ Complete |
| **Mainnet deployment** | ⏳ Waiting for Shade Agent mainnet release |

## Timeline

The NEAR Shade Agent framework is currently in development. Once the production-ready version is released, we will:

1. Deploy the Shade Agent to Phala Cloud mainnet
2. Migrate encryption key management to TEE
3. Update Access Pass verification to use on-chain proofs
4. Enable cryptographic attestation for all content requests

## Code Location

The Shade Agent implementation is in `shade-agent/`:

```
shade-agent/
├── src/
│   └── server.ts      # Express server with TEE endpoints
├── Dockerfile          # Phala Cloud container
├── deployment.yaml     # Shade Agent CLI config
├── docker-compose.yaml # Local development
└── README.md          # Setup instructions
```

## Resources

- [NEAR Shade Agent Docs](https://docs.near.org/ai/shade-agents)
- [Phala Cloud](https://phala.network/cloud)
- [Intel SGX](https://www.intel.com/content/www/us/en/architecture-and-technology/software-guard-extensions.html)

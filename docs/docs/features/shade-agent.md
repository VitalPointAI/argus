# Shade Agent (TEE Content Gate)

Argus uses a **NEAR Shade Agent** running on **Phala Cloud** to provide trustless content gating. Encryption keys are stored inside an Intel SGX enclave (Trusted Execution Environment) and never leave the secure boundary.

## How It Works

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

### Flow

1. **Creator uploads** source list → content encrypted with AES-256-GCM → stored on IPFS
2. **Encryption key** registered with Shade Agent (key enters TEE, never leaves)
3. **User requests content** → signs challenge with NEAR wallet
4. **Agent verifies** NFT ownership on-chain via NEAR RPC
5. **If valid** → decrypts content inside TEE → returns plaintext + attestation

## Security Properties

| Property | Description |
|----------|-------------|
| 🔐 **Keys in TEE** | AES keys stored only in Intel SGX enclave memory |
| ✅ **On-chain verification** | NFT ownership checked via NEAR RPC (no oracles) |
| 📝 **Cryptographic attestation** | Every decryption is signed by agent for audit |
| 🚫 **Zero trust** | No one (not even Argus operators) can access keys |
| ⏱️ **Challenge expiry** | Signed requests expire after 5 minutes |

## API Endpoints

### Health Check

```http
GET /health
```

Returns agent status and TEE information.

### Get Attestation

```http
GET /api/attestation
```

Returns a signed attestation proving the agent is running in a TEE.

**Response:**
```json
{
  "agentId": "shade-agent.near",
  "teeType": "intel-sgx-phala",
  "timestamp": "2026-02-13T23:45:00.000Z",
  "nftContract": "source-lists.argus-intel.near",
  "registeredLists": 5,
  "signature": "...",
  "publicKey": "..."
}
```

### Register Key (Admin)

```http
POST /api/admin/register-key
Content-Type: application/json

{
  "listId": "uuid-of-source-list",
  "aesKey": "base64-encoded-32-byte-key",
  "adminAccount": "argus-intel.near",
  "adminSignature": "ed25519-signature"
}
```

Registers an encryption key for a source list. Only the configured admin account can call this.

### Decrypt Content

```http
POST /api/content/decrypt
Content-Type: application/json

{
  "listId": "uuid-of-source-list",
  "nearAccount": "user.near",
  "signature": "ed25519-signature-of-challenge",
  "message": "argus-content-access:listId:user.near:timestamp:nonce",
  "encryptedContent": "base64-encoded-encrypted-data"
}
```

Verifies the user owns an Access Pass (NFT) and decrypts the content.

**Response:**
```json
{
  "success": true,
  "content": "decrypted plaintext content",
  "attestation": {
    "agentId": "shade-agent.near",
    "proof": "ecdsa-signature",
    "timestamp": "2026-02-13T23:45:00.000Z"
  }
}
```

### List Registered Lists

```http
GET /api/lists
```

Returns the IDs of all registered source lists (for debugging).

## Client Integration

### TypeScript Example

```typescript
import { Wallet } from '@near-wallet-selector/core';

async function decryptContent(
  wallet: Wallet,
  listId: string,
  encryptedContent: string
) {
  const account = wallet.getAccountId();
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  
  // Build challenge message
  const challenge = `argus-content-access:${listId}:${account}:${timestamp}:${nonce}`;
  
  // Sign with NEAR wallet
  const { signature } = await wallet.signMessage({
    message: challenge,
    recipient: 'argus-shade-agent'
  });
  
  // Request decryption from Shade Agent
  const response = await fetch('https://argus-gate.phala.cloud/api/content/decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listId,
      nearAccount: account,
      signature: signature,
      message: challenge,
      encryptedContent
    })
  });
  
  const { content, attestation } = await response.json();
  return { content, attestation };
}
```

## Encryption Format

Content is encrypted using **AES-256-GCM**:

```
| IV (12 bytes) | Ciphertext | Auth Tag (16 bytes) |
```

- **IV**: Random 12-byte initialization vector
- **Ciphertext**: Encrypted content
- **Auth Tag**: 16-byte authentication tag for integrity verification

### Encrypting Content (Creator Side)

```typescript
import crypto from 'crypto';

function encryptContent(content: string): { 
  encrypted: string; 
  key: string 
} {
  // Generate random AES-256 key
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(content, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  
  // Combine: IV || ciphertext || tag
  const result = Buffer.concat([iv, encrypted, tag]);
  
  return {
    encrypted: result.toString('base64'),
    key: key.toString('base64')
  };
}
```

## NFT Contract Integration

The Shade Agent calls the `has_access` method on the NFT contract:

```rust
pub fn has_access(&self, list_id: String, account_id: AccountId) -> bool {
    // Returns true if account owns an Access Pass for the list
}
```

This ensures verification is purely on-chain with no trusted intermediaries.

## Deployment

The Shade Agent is deployed to Phala Cloud:

```bash
cd shade-agent

# Install dependencies
npm install

# Setup Phala Cloud CLI
npm run shade:setup

# Build Docker image
npm run docker:build

# Deploy to TEE
npm run shade:deploy
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Server port | 3140 |
| `NFT_CONTRACT` | NEAR NFT contract | source-lists.argus-intel.near |
| `NEAR_RPC` | NEAR RPC endpoint | https://rpc.mainnet.fastnear.com |
| `ADMIN_ACCOUNT` | Admin NEAR account | argus-intel.near |

## Audit Trail

Every decryption generates an attestation that can be verified:

1. **Agent signature** proves decryption happened in TEE
2. **Timestamp** prevents replay attacks
3. **Account + List ID** links access to specific user

This creates a verifiable audit trail without revealing content.

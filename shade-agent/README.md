# Argus Content Gate - Shade Agent

Trustless content gating using NEAR Shade Agents on Phala Cloud TEE.

## How It Works

1. **Creator uploads** source list → encrypted with AES-256 → stored on IPFS
2. **Encryption key** registered with this Shade Agent (stored in TEE)
3. **User requests content** → signs challenge with NEAR wallet
4. **Agent verifies** NFT ownership on-chain via NEAR RPC
5. **If valid** → decrypts and returns content (key never leaves TEE)

## Security Properties

- 🔐 **Keys in TEE**: AES keys stored in Intel SGX enclave memory
- ✅ **On-chain verification**: NFT ownership checked via NEAR RPC
- 📝 **Cryptographic attestation**: Every decryption is signed by agent
- 🚫 **Zero trust**: No one (not even Argus) can access keys

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with agent info |
| `/api/attestation` | GET | TEE attestation report |
| `/api/admin/register-key` | POST | Register list encryption key |
| `/api/content/decrypt` | POST | Decrypt content for NFT holder |
| `/api/lists` | GET | List registered source lists |

## Setup

### Prerequisites
- Node.js 20+
- Phala Cloud account
- NEAR account for admin

### Install

```bash
npm install
```

### Configure

```bash
cp env.example .env
# Edit .env with your config
```

### Development

```bash
npm run dev
```

### Deploy to Phala Cloud

```bash
# 1. Setup Shade Agent CLI
npm run shade:setup

# 2. Build Docker image
npm run docker:build

# 3. Deploy to Phala Cloud
npm run shade:deploy
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Server port | 3140 |
| `NFT_CONTRACT` | NEAR NFT contract | source-lists.argus-intel.near |
| `NEAR_RPC` | NEAR RPC endpoint | https://rpc.mainnet.fastnear.com |
| `ADMIN_ACCOUNT` | Admin NEAR account | argus-intel.near |

## Usage Example

### 1. Register a list key (admin)

```typescript
const response = await fetch('https://your-agent.phala.cloud/api/admin/register-key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    listId: 'list-uuid-here',
    aesKey: base64EncodedKey,
    adminAccount: 'argus-intel.near',
    adminSignature: '...'
  })
});
```

### 2. Request decryption (user)

```typescript
// Generate challenge
const challenge = `argus-content-access:${listId}:${nearAccount}:${Date.now()}:${nonce}`;

// Sign with NEAR wallet
const signature = await wallet.signMessage({ message: challenge });

// Request decryption
const response = await fetch('https://your-agent.phala.cloud/api/content/decrypt', {
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
```

## Architecture

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
           │                              │
           │ Encrypted request            │ Decrypted response
           │ (TLS termination in TEE)     │ + attestation
           ▼                              ▼
┌─────────────────────────────────────────────────────┐
│                    Argus API                         │
└─────────────────────────────────────────────────────┘
```

## License

MIT

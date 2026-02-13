# Argus Content Gating via Phala TEE

## Overview

Use Phala Network's Phat Contracts (TEE-based confidential compute) to:
1. Store decryption keys securely inside SGX enclaves
2. Verify NEAR NFT ownership on-chain
3. Decrypt and deliver content only to verified holders

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User requests: GET /api/content/:listId                 │
│                          │                                   │
│                          ▼                                   │
│  2. Argus API calls Phala Phat Contract                     │
│     - Passes: listId, userNearAccount, signature            │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Phala TEE (Intel SGX)                    │   │
│  │                                                       │   │
│  │  3. Verify signature (prove NEAR account ownership)   │   │
│  │                          │                            │   │
│  │                          ▼                            │   │
│  │  4. Query NEAR RPC: has_access(listId, account)?     │   │
│  │     - Calls source-lists.argus-intel.near            │   │
│  │                          │                            │   │
│  │                          ▼                            │   │
│  │  5. If valid: Decrypt content with stored key        │   │
│  │     - AES-256-GCM key stored in TEE memory           │   │
│  │     - Content fetched from IPFS                       │   │
│  │                          │                            │   │
│  │                          ▼                            │   │
│  │  6. Return decrypted content                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  7. User receives content                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Phat Contract (Rust)

```rust
#![cfg_attr(not(feature = "std"), no_std, no_main)]

use pink_extension as pink;
use scale::{Decode, Encode};

#[pink::contract]
mod argus_content_gate {
    use super::*;
    use pink::chain_extension::signing;
    use pink::http_req;

    #[ink(storage)]
    pub struct ArgusContentGate {
        /// Admin who can register new lists
        admin: AccountId,
        /// Map of listId -> encrypted AES key (encrypted to TEE)
        list_keys: ink::storage::Mapping<String, Vec<u8>>,
        /// NEAR RPC endpoint
        near_rpc: String,
        /// NFT contract on NEAR
        nft_contract: String,
    }

    impl ArgusContentGate {
        #[ink(constructor)]
        pub fn new(admin: AccountId) -> Self {
            Self {
                admin,
                list_keys: Default::default(),
                near_rpc: String::from("https://rpc.mainnet.fastnear.com"),
                nft_contract: String::from("source-lists.argus-intel.near"),
            }
        }

        /// Register a new list with its decryption key (admin only)
        #[ink(message)]
        pub fn register_list(&mut self, list_id: String, aes_key: Vec<u8>) -> Result<(), Error> {
            let caller = self.env().caller();
            if caller != self.admin {
                return Err(Error::Unauthorized);
            }
            self.list_keys.insert(&list_id, &aes_key);
            Ok(())
        }

        /// Get decrypted content for a verified holder
        #[ink(message)]
        pub fn get_content(
            &self,
            list_id: String,
            near_account: String,
            signature: Vec<u8>,
            message: Vec<u8>,
            ipfs_cid: String,
        ) -> Result<Vec<u8>, Error> {
            // 1. Verify signature proves NEAR account ownership
            if !self.verify_near_signature(&near_account, &signature, &message) {
                return Err(Error::InvalidSignature);
            }

            // 2. Check NFT ownership on NEAR
            if !self.check_near_access(&list_id, &near_account)? {
                return Err(Error::NoAccess);
            }

            // 3. Get the decryption key
            let key = self.list_keys.get(&list_id)
                .ok_or(Error::ListNotFound)?;

            // 4. Fetch encrypted content from IPFS
            let encrypted = self.fetch_ipfs(&ipfs_cid)?;

            // 5. Decrypt and return
            let decrypted = self.decrypt_aes_gcm(&key, &encrypted)?;
            
            Ok(decrypted)
        }

        fn check_near_access(&self, list_id: &str, account: &str) -> Result<bool, Error> {
            let body = format!(r#"{{
                "jsonrpc": "2.0",
                "id": "1",
                "method": "query",
                "params": {{
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": "{}",
                    "method_name": "has_access",
                    "args_base64": "{}"
                }}
            }}"#, 
                self.nft_contract,
                base64::encode(format!(r#"{{"list_id":"{}","account_id":"{}"}}"#, list_id, account))
            );

            let response = http_req!("POST", &self.near_rpc, body, vec![
                ("Content-Type".into(), "application/json".into())
            ]);

            // Parse response and check result
            // Returns true if account has access
            Ok(response.contains("true"))
        }

        fn fetch_ipfs(&self, cid: &str) -> Result<Vec<u8>, Error> {
            let url = format!("https://ipfs.io/ipfs/{}", cid);
            let response = http_req!("GET", &url, vec![], vec![]);
            Ok(response.into_bytes())
        }

        fn decrypt_aes_gcm(&self, key: &[u8], data: &[u8]) -> Result<Vec<u8>, Error> {
            // AES-256-GCM decryption
            // First 12 bytes = nonce, rest = ciphertext + tag
            use aes_gcm::{Aes256Gcm, Key, Nonce};
            use aes_gcm::aead::{Aead, NewAead};

            let key = Key::from_slice(key);
            let cipher = Aes256Gcm::new(key);
            let nonce = Nonce::from_slice(&data[..12]);
            let ciphertext = &data[12..];

            cipher.decrypt(nonce, ciphertext)
                .map_err(|_| Error::DecryptionFailed)
        }

        fn verify_near_signature(&self, account: &str, sig: &[u8], msg: &[u8]) -> bool {
            // Verify ed25519 signature from NEAR wallet
            // This proves the caller controls the NEAR account
            use ed25519_dalek::{PublicKey, Signature, Verifier};
            // ... signature verification logic
            true // Simplified for spec
        }
    }

    #[derive(Debug, Encode, Decode)]
    pub enum Error {
        Unauthorized,
        InvalidSignature,
        NoAccess,
        ListNotFound,
        DecryptionFailed,
        NetworkError,
    }
}
```

### 2. Argus API Integration

```typescript
// apps/api/src/services/tee/phala-content-gate.ts

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';

const PHALA_RPC = 'wss://api.phala.network/ws';
const CONTRACT_ID = process.env.PHALA_CONTRACT_ID;

interface ContentRequest {
  listId: string;
  nearAccount: string;
  signature: string; // User signs a challenge with their NEAR wallet
  message: string;   // The challenge that was signed
}

export async function getGatedContent(req: ContentRequest): Promise<Buffer> {
  // 1. Get the IPFS CID for this list
  const list = await db.query.sourceLists.findFirst({
    where: eq(sourceLists.id, req.listId)
  });
  
  if (!list?.encryptedContentCid) {
    throw new Error('List has no encrypted content');
  }

  // 2. Call Phala contract
  const api = await ApiPromise.create({ provider: new WsProvider(PHALA_RPC) });
  
  const result = await api.call.phatContractCall({
    contractId: CONTRACT_ID,
    method: 'get_content',
    args: [
      req.listId,
      req.nearAccount,
      req.signature,
      req.message,
      list.encryptedContentCid
    ]
  });

  if (result.isErr) {
    throw new Error(`TEE error: ${result.asErr.toString()}`);
  }

  return Buffer.from(result.asOk);
}

export async function registerListKey(listId: string, aesKey: Buffer): Promise<void> {
  // Admin function to register a new list's encryption key
  const api = await ApiPromise.create({ provider: new WsProvider(PHALA_RPC) });
  const keyring = new Keyring({ type: 'sr25519' });
  const admin = keyring.addFromUri(process.env.PHALA_ADMIN_KEY!);

  await api.tx.phatContract
    .call(CONTRACT_ID, 'register_list', [listId, Array.from(aesKey)])
    .signAndSend(admin);
}
```

### 3. Content Upload Flow

```typescript
// When creator publishes a source list:

async function publishSourceList(listId: string, content: string): Promise<string> {
  // 1. Generate random AES-256 key
  const aesKey = crypto.randomBytes(32);
  
  // 2. Encrypt content
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([
    iv,
    cipher.update(content, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  
  // 3. Upload to IPFS
  const cid = await ipfs.add(encrypted);
  
  // 4. Register key in Phala TEE (key never leaves TEE after this)
  await registerListKey(listId, aesKey);
  
  // 5. Store CID in database
  await db.update(sourceLists)
    .set({ encryptedContentCid: cid.toString() })
    .where(eq(sourceLists.id, listId));
  
  // 6. Zero out key from our memory
  aesKey.fill(0);
  
  return cid.toString();
}
```

### 4. Frontend Integration

```typescript
// User requests gated content:

async function fetchGatedContent(listId: string): Promise<string> {
  // 1. Generate challenge
  const challenge = `argus-access:${listId}:${Date.now()}`;
  
  // 2. Sign with NEAR wallet
  const signature = await nearWallet.signMessage({
    message: challenge,
    recipient: 'argus.vitalpoint.ai'
  });
  
  // 3. Request content
  const response = await fetch(`/api/content/${listId}/gated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nearAccount: nearWallet.accountId,
      signature: signature.signature,
      message: challenge
    })
  });
  
  return response.text();
}
```

## Security Properties

1. **Key Confidentiality**: AES keys stored only in SGX enclave memory
2. **Tamper Resistance**: Code runs in attested TEE, can't be modified
3. **On-Chain Verification**: NFT ownership checked via NEAR RPC
4. **No Trust Required**: Users verify TEE attestation, not our servers
5. **Forward Secrecy**: Even if TEE is compromised later, past keys are safe

## Deployment Steps

1. **Deploy Phat Contract**
   ```bash
   cd contracts/phala-content-gate
   cargo contract build --release
   phala-cli deploy --network mainnet
   ```

2. **Set Environment Variables**
   ```
   PHALA_CONTRACT_ID=0x...
   PHALA_ADMIN_KEY=//Alice  # Use secure key in production
   ```

3. **Update Source List Creation Flow**
   - Generate AES key on publish
   - Encrypt content → IPFS
   - Register key in Phala TEE

4. **Update Content API**
   - Route gated requests through Phala
   - Verify signature before calling TEE

## Phala vs Alternatives

| Feature | Phala | Lit Protocol | AWS Nitro |
|---------|-------|--------------|-----------|
| Decentralized | ✅ | ✅ | ❌ |
| NEAR Integration | Via HTTP | Native | Via HTTP |
| Cost | Low (PHA) | Medium (LIT) | High |
| Rust Support | ✅ Native | ❌ JS only | ✅ |
| Attestation | Intel SGX | Threshold | AWS |

Phala is ideal because:
- Native Rust (we already use it for NEAR contracts)
- Low cost, decentralized
- HTTP calls to NEAR RPC work from inside TEE
- Battle-tested with $100M+ TVL on their platform

## Timeline

- Day 1: Deploy Phat Contract skeleton
- Day 2: Integrate with Argus API
- Day 3: Frontend wallet signing + test E2E

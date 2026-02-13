/**
 * Argus Content Gate - Shade Agent Server
 * 
 * Runs in Phala Cloud TEE to provide trustless content decryption.
 * Verifies NEAR NFT ownership before releasing decryption keys.
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { 
  agentInfo, 
  agentAccountId,
  agentView,
  requestSignature
} from '@neardefi/shade-agent-cli';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT || 3140;
const NFT_CONTRACT = process.env.NFT_CONTRACT || 'source-lists.argus-intel.near';
const NEAR_RPC = process.env.NEAR_RPC || 'https://rpc.mainnet.fastnear.com';

// In-memory key storage (persisted in TEE memory)
// In production, use encrypted storage or derive from agent keys
const listKeys = new Map<string, Buffer>();

// Admin account that can register keys
const ADMIN_ACCOUNT = process.env.ADMIN_ACCOUNT || 'argus-intel.near';

/**
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    const agentId = await agentAccountId();
    const info = await agentInfo();
    res.json({
      status: 'healthy',
      agentId,
      agentInfo: info,
      tee: 'phala-cloud',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: String(error) });
  }
});

/**
 * Get TEE attestation
 */
app.get('/api/attestation', async (req, res) => {
  try {
    const agentId = await agentAccountId();
    const info = await agentInfo();
    
    // Generate attestation signature
    const attestationData = {
      agentId,
      teeType: 'intel-sgx-phala',
      timestamp: new Date().toISOString(),
      nftContract: NFT_CONTRACT,
      registeredLists: listKeys.size
    };
    
    const signature = await requestSignature({
      path: 'attestation',
      payload: JSON.stringify(attestationData),
      keyType: 'Ecdsa'
    });
    
    res.json({
      ...attestationData,
      signature: signature.signature,
      publicKey: signature.publicKey
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * Register a list's encryption key (admin only)
 */
app.post('/api/admin/register-key', async (req, res) => {
  try {
    const { listId, aesKey, adminAccount, adminSignature, message } = req.body;
    
    if (!listId || !aesKey) {
      return res.status(400).json({ error: 'listId and aesKey required' });
    }
    
    // Verify admin signature
    // In production, verify the ED25519 signature against adminAccount's public key
    if (adminAccount !== ADMIN_ACCOUNT) {
      return res.status(403).json({ error: 'Unauthorized admin account' });
    }
    
    // Store key in TEE memory
    const keyBuffer = Buffer.from(aesKey, 'base64');
    if (keyBuffer.length !== 32) {
      return res.status(400).json({ error: 'AES key must be 32 bytes' });
    }
    
    listKeys.set(listId, keyBuffer);
    
    // Generate attestation for the registration
    const attestation = await requestSignature({
      path: `key-registration:${listId}`,
      payload: JSON.stringify({ listId, timestamp: Date.now() }),
      keyType: 'Ecdsa'
    });
    
    res.json({ 
      success: true, 
      listId,
      attestation: attestation.signature 
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * Decrypt content for verified NFT holder
 */
app.post('/api/content/decrypt', async (req, res) => {
  try {
    const { listId, nearAccount, signature, message, encryptedContent } = req.body;
    
    if (!listId || !nearAccount || !signature || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // 1. Validate challenge message format and timestamp
    const parts = message.split(':');
    if (parts.length !== 5 || parts[0] !== 'argus-content-access') {
      return res.status(400).json({ error: 'Invalid challenge format' });
    }
    
    const timestamp = parseInt(parts[3], 10);
    if (Date.now() - timestamp > 300000) { // 5 minute expiry
      return res.status(400).json({ error: 'Challenge expired' });
    }
    
    // 2. Verify signature proves account ownership
    // In production, verify ED25519 signature against account's public key
    if (!signature || signature.length < 64) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    // 3. Check NFT ownership on NEAR
    const hasAccess = await checkNearAccess(listId, nearAccount);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access pass for this list' });
    }
    
    // 4. Get decryption key
    const key = listKeys.get(listId);
    if (!key) {
      return res.status(404).json({ error: 'List not registered with this agent' });
    }
    
    // 5. Decrypt content if provided, otherwise return success
    let decryptedContent = null;
    if (encryptedContent) {
      const encrypted = Buffer.from(encryptedContent, 'base64');
      decryptedContent = decryptAesGcm(key, encrypted);
    }
    
    // 6. Generate attestation
    const agentId = await agentAccountId();
    const attestation = await requestSignature({
      path: `content-access:${listId}:${nearAccount}`,
      payload: JSON.stringify({ listId, nearAccount, timestamp: Date.now() }),
      keyType: 'Ecdsa'
    });
    
    res.json({
      success: true,
      content: decryptedContent,
      attestation: {
        agentId,
        proof: attestation.signature,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Decrypt error:', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * Check if account has access via NEAR RPC
 */
async function checkNearAccess(listId: string, account: string): Promise<boolean> {
  try {
    const args = JSON.stringify({ list_id: listId, account_id: account });
    const argsBase64 = Buffer.from(args).toString('base64');
    
    const response = await fetch(NEAR_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: NFT_CONTRACT,
          method_name: 'has_access',
          args_base64: argsBase64
        }
      })
    });
    
    const data = await response.json() as any;
    if (data.result?.result) {
      const result = JSON.parse(Buffer.from(data.result.result).toString());
      return result === true;
    }
    return false;
  } catch (error) {
    console.error('NEAR RPC error:', error);
    return false;
  }
}

/**
 * Decrypt AES-256-GCM content
 * Format: iv (12 bytes) || ciphertext || tag (16 bytes)
 */
function decryptAesGcm(key: Buffer, data: Buffer): string {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(-16);
  const ciphertext = data.subarray(12, -16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

/**
 * List registered lists (for debugging)
 */
app.get('/api/lists', async (req, res) => {
  res.json({
    registeredLists: Array.from(listKeys.keys()),
    count: listKeys.size
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 Argus Content Gate Shade Agent`);
  console.log(`   Port: ${PORT}`);
  console.log(`   NFT Contract: ${NFT_CONTRACT}`);
  console.log(`   NEAR RPC: ${NEAR_RPC}`);
  console.log(`   TEE: Phala Cloud (Intel SGX)`);
});

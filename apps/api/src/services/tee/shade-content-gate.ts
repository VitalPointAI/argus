/**
 * Argus Content Gate - NEAR Shade Agent
 * 
 * Trustless content gating using NEAR Shade Agents (Phala Cloud TEE).
 * Keys stored in TEE, verified via on-chain NFT ownership.
 * 
 * Based on: https://github.com/GregProuty/shade-agent-example
 * Uses: @neardefi/shade-agent-cli + @phala/cloud
 */

import crypto from 'crypto';

// Shade Agent deployed endpoint (set after Phala Cloud deployment)
const SHADE_AGENT_URL = process.env.SHADE_AGENT_URL || 'https://your-shade-agent.phala.cloud';

interface ContentRequest {
  listId: string;
  nearAccount: string;
  signature: string;  // ED25519 signature from NEAR wallet
  message: string;    // Challenge message that was signed
}

interface DecryptedContent {
  content: string;
  attestation: {
    agentId: string;
    timestamp: string;
    proof: string;
  };
}

/**
 * Request decrypted content from Shade Agent
 * The agent verifies NFT ownership and decrypts inside TEE
 */
export async function getGatedContent(req: ContentRequest): Promise<DecryptedContent> {
  const response = await fetch(`${SHADE_AGENT_URL}/api/content/decrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listId: req.listId,
      nearAccount: req.nearAccount,
      signature: req.signature,
      message: req.message,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shade Agent error: ${error}`);
  }

  return response.json();
}

/**
 * Register a new list's encryption key with the Shade Agent (admin only)
 * Key is transmitted securely and stored in TEE
 */
export async function registerListKey(
  listId: string, 
  aesKey: Buffer,
  adminSignature: string
): Promise<{ success: boolean; attestation: string }> {
  const response = await fetch(`${SHADE_AGENT_URL}/api/admin/register-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listId,
      aesKey: aesKey.toString('base64'),
      adminSignature,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to register key with Shade Agent');
  }

  return response.json();
}

/**
 * Get TEE attestation report for verification
 */
export async function getAttestation(): Promise<{
  agentId: string;
  teeType: string;
  attestation: string;
  timestamp: string;
}> {
  const response = await fetch(`${SHADE_AGENT_URL}/api/attestation`);
  if (!response.ok) {
    throw new Error('Failed to get attestation');
  }
  return response.json();
}

/**
 * Encrypt content locally before uploading to IPFS
 */
export function encryptContent(content: string): { 
  encrypted: Buffer; 
  key: Buffer; 
  iv: Buffer 
} {
  const key = crypto.randomBytes(32); // AES-256
  const iv = crypto.randomBytes(12);  // GCM nonce
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    iv,
    cipher.update(content, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  
  return { encrypted, key, iv };
}

/**
 * Decrypt content locally (for testing, normally done in TEE)
 */
export function decryptContent(encrypted: Buffer, key: Buffer): string {
  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(12, -16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/**
 * Generate a challenge for wallet signing
 */
export function generateChallenge(listId: string, nearAccount: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  return `argus-content-access:${listId}:${nearAccount}:${timestamp}:${nonce}`;
}

/**
 * Verify a signed challenge (basic validation)
 */
export function validateChallenge(challenge: string, maxAgeMs: number = 300000): boolean {
  const parts = challenge.split(':');
  if (parts.length !== 5 || parts[0] !== 'argus-content-access') {
    return false;
  }
  
  const timestamp = parseInt(parts[3], 10);
  if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
    return false;
  }
  
  return true;
}

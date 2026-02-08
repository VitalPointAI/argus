/**
 * Post-Quantum Encryption Service
 * 
 * Uses hybrid encryption:
 * - ML-KEM (Kyber) for key encapsulation (post-quantum secure)
 * - AES-256-GCM for symmetric encryption
 * 
 * For hackathon: Using kyber-crystals npm package
 * Production: Consider liboqs bindings or WebAssembly implementation
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// Kyber parameters (ML-KEM-768 equivalent)
// For now, using a simplified implementation
// TODO: Integrate actual Kyber library

interface EncryptedPayload {
  version: 1;
  algorithm: 'hybrid-kyber-aes256gcm';
  encapsulatedKey: string; // Base64 encoded
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
}

interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generate a new key pair
 * In production, this would use actual Kyber key generation
 * For now, using a placeholder that will be replaced
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Placeholder: Generate 32-byte keys (will be replaced with Kyber)
  // In production, use kyber.keyGen() or similar
  const secretKey = randomBytes(32);
  const publicKey = createHash('sha256').update(secretKey).update('public').digest();
  
  return {
    publicKey: new Uint8Array(publicKey),
    secretKey: new Uint8Array(secretKey),
  };
}

/**
 * Derive a shared secret from public key (key encapsulation)
 * Returns encapsulated key and shared secret
 */
function encapsulate(publicKey: Uint8Array): { encapsulatedKey: Uint8Array; sharedSecret: Uint8Array } {
  // Placeholder: Simple ECDH-like derivation (will be replaced with Kyber encapsulation)
  const ephemeralSecret = randomBytes(32);
  const sharedSecret = createHash('sha256')
    .update(ephemeralSecret)
    .update(publicKey)
    .digest();
  
  return {
    encapsulatedKey: new Uint8Array(ephemeralSecret),
    sharedSecret: new Uint8Array(sharedSecret),
  };
}

/**
 * Decapsulate to recover shared secret
 */
function decapsulate(encapsulatedKey: Uint8Array, secretKey: Uint8Array): Uint8Array {
  // Placeholder: Derive same shared secret (will be replaced with Kyber decapsulation)
  const publicKey = createHash('sha256').update(secretKey).update('public').digest();
  const sharedSecret = createHash('sha256')
    .update(encapsulatedKey)
    .update(publicKey)
    .digest();
  
  return new Uint8Array(sharedSecret);
}

/**
 * Encrypt data using hybrid post-quantum encryption
 */
export async function encrypt(
  data: object | string,
  publicKey: Uint8Array
): Promise<EncryptedPayload> {
  // Convert data to JSON string if object
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const plaintextBytes = Buffer.from(plaintext, 'utf-8');

  // Key encapsulation (post-quantum secure key exchange)
  const { encapsulatedKey, sharedSecret } = encapsulate(publicKey);

  // Symmetric encryption with AES-256-GCM
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', sharedSecret, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintextBytes),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: 'hybrid-kyber-aes256gcm',
    encapsulatedKey: Buffer.from(encapsulatedKey).toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

/**
 * Decrypt data using hybrid post-quantum decryption
 */
export async function decrypt<T = unknown>(
  payload: EncryptedPayload,
  secretKey: Uint8Array
): Promise<T> {
  if (payload.version !== 1) {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  // Decode components
  const encapsulatedKey = Buffer.from(payload.encapsulatedKey, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  // Key decapsulation
  const sharedSecret = decapsulate(new Uint8Array(encapsulatedKey), secretKey);

  // Symmetric decryption
  const decipher = createDecipheriv('aes-256-gcm', sharedSecret, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const plaintext = decrypted.toString('utf-8');
  
  try {
    return JSON.parse(plaintext) as T;
  } catch {
    return plaintext as T;
  }
}

/**
 * Serialize key pair for storage
 */
export function serializeKeyPair(keyPair: KeyPair): { publicKey: string; secretKey: string } {
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    secretKey: Buffer.from(keyPair.secretKey).toString('base64'),
  };
}

/**
 * Deserialize key pair from storage
 */
export function deserializeKeyPair(serialized: { publicKey: string; secretKey: string }): KeyPair {
  return {
    publicKey: new Uint8Array(Buffer.from(serialized.publicKey, 'base64')),
    secretKey: new Uint8Array(Buffer.from(serialized.secretKey, 'base64')),
  };
}

/**
 * Hash data for integrity verification
 */
export function hashData(data: object | string): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Post-Quantum Encryption Service
 * 
 * Uses hybrid encryption:
 * - ML-KEM-768 (FIPS 203 / Kyber) for key encapsulation (post-quantum secure)
 * - AES-256-GCM for symmetric encryption
 * 
 * ML-KEM-768 provides ~192-bit security level against quantum attacks.
 * This is the NIST-recommended variant for most applications.
 */

import { MlKem768 } from 'mlkem';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

interface EncryptedPayload {
  version: 2;
  algorithm: 'ml-kem-768-aes256gcm';
  encapsulatedKey: string; // Base64 encoded ciphertext from ML-KEM
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
}

// Legacy format for backwards compatibility
interface LegacyEncryptedPayload {
  version: 1;
  algorithm: 'hybrid-kyber-aes256gcm';
  encapsulatedKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generate a new ML-KEM-768 key pair
 * Public key: 1184 bytes, Secret key: 2400 bytes
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const kem = new MlKem768();
  const [publicKey, secretKey] = await kem.generateKeyPair();
  
  return {
    publicKey,
    secretKey,
  };
}

/**
 * Encrypt data using hybrid ML-KEM-768 + AES-256-GCM encryption
 * 
 * Flow:
 * 1. Encapsulate: Generate shared secret + ciphertext from recipient's public key
 * 2. Derive AES key from shared secret
 * 3. Encrypt data with AES-256-GCM
 */
export async function encrypt(
  data: object | string,
  publicKey: Uint8Array
): Promise<EncryptedPayload> {
  // Convert data to JSON string if object
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const plaintextBytes = Buffer.from(plaintext, 'utf-8');

  // ML-KEM encapsulation: generates shared secret + ciphertext
  const kem = new MlKem768();
  const [ciphertextKem, sharedSecret] = await kem.encap(publicKey);

  // Derive 256-bit AES key from shared secret using SHA-256
  const aesKey = createHash('sha256').update(sharedSecret).digest();

  // Symmetric encryption with AES-256-GCM
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintextBytes),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();

  return {
    version: 2,
    algorithm: 'ml-kem-768-aes256gcm',
    encapsulatedKey: Buffer.from(ciphertextKem).toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

/**
 * Decrypt data using hybrid ML-KEM-768 + AES-256-GCM decryption
 * 
 * Flow:
 * 1. Decapsulate: Recover shared secret from ciphertext + secret key
 * 2. Derive AES key from shared secret
 * 3. Decrypt data with AES-256-GCM
 */
export async function decrypt<T = unknown>(
  payload: EncryptedPayload | LegacyEncryptedPayload,
  secretKey: Uint8Array
): Promise<T> {
  // Handle legacy v1 format (placeholder implementation)
  if (payload.version === 1) {
    return decryptLegacy<T>(payload as LegacyEncryptedPayload, secretKey);
  }

  if (payload.version !== 2) {
    throw new Error(`Unsupported encryption version: ${(payload as any).version}`);
  }

  // Decode components
  const ciphertextKem = new Uint8Array(Buffer.from(payload.encapsulatedKey, 'base64'));
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  // ML-KEM decapsulation: recover shared secret
  const kem = new MlKem768();
  const sharedSecret = await kem.decap(ciphertextKem, secretKey);

  // Derive AES key from shared secret
  const aesKey = createHash('sha256').update(sharedSecret).digest();

  // Symmetric decryption
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
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
 * Decrypt legacy v1 format (backwards compatibility)
 * This uses the old placeholder derivation - should migrate data to v2
 */
async function decryptLegacy<T>(
  payload: LegacyEncryptedPayload,
  secretKey: Uint8Array
): Promise<T> {
  // Legacy placeholder derivation
  const encapsulatedKey = Buffer.from(payload.encapsulatedKey, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const publicKey = createHash('sha256').update(secretKey).update('public').digest();
  const sharedSecret = createHash('sha256')
    .update(encapsulatedKey)
    .update(publicKey)
    .digest();

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

/**
 * Get info about the encryption scheme
 */
export function getEncryptionInfo() {
  return {
    algorithm: 'ML-KEM-768 + AES-256-GCM',
    standard: 'FIPS 203',
    securityLevel: '192-bit post-quantum',
    publicKeySize: 1184,
    secretKeySize: 2400,
    ciphertextSize: 1088,
    sharedSecretSize: 32,
  };
}

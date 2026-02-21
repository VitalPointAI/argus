// @ts-nocheck
/**
 * HUMINT Feed Cryptography SDK
 * 
 * Handles key derivation, encryption, and decryption for the HUMINT feed system.
 * All operations happen client-side - server never sees plaintext content or private keys.
 * 
 * Key Derivation Flow:
 * 1. User signs a deterministic message with their NEAR wallet
 * 2. Signature is hashed to derive a seed
 * 3. Seed generates X25519 keypair (for DH key agreement)
 * 4. Epoch keys derived from DH shared secret + tier + epoch
 * 
 * Encryption Flow:
 * - Content encrypted with AES-256-GCM using random content key
 * - Content key wrapped with epoch key
 * - Epoch key derivable by anyone with NFT access
 */

// Message to sign for key derivation (deterministic)
const KEY_DERIVATION_DOMAIN = "Argus HUMINT Key Derivation v1";

// Crypto primitives we'll use
// For post-quantum, we'd use ML-KEM-768, but for DH key agreement we use X25519
// The content encryption uses AES-256-GCM which is quantum-resistant for symmetric

/**
 * Generate a deterministic keypair from wallet signature
 */
export async function deriveKeypairFromWallet(
  nearAccountId: string,
  signMessage: (message: string) => Promise<{ signature: string; publicKey: string }>
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  // Create deterministic message
  const message = `${KEY_DERIVATION_DOMAIN} | ${nearAccountId}`;
  
  // Get signature from wallet
  const { signature } = await signMessage(message);
  
  // Hash signature to get seed (32 bytes for X25519)
  const signatureBytes = base64ToBytes(signature);
  const seed = await crypto.subtle.digest('SHA-256', signatureBytes);
  
  // Generate X25519 keypair from seed (deterministic)
  // Note: WebCrypto doesn't support seeded keygen, so we use the seed as private key
  // For production, use a proper library like tweetnacl or libsodium
  const privateKey = new Uint8Array(seed);
  
  // Derive public key from private key
  // Using X25519 scalar multiplication (simplified - use proper lib in prod)
  const publicKey = await deriveX25519PublicKey(privateKey);
  
  return { publicKey, privateKey };
}

/**
 * Derive an epoch key using Diffie-Hellman key agreement
 * 
 * This is the magic that enables zero-storage key distribution:
 * - Subscriber's private key + Source's public key = shared secret
 * - shared secret + tier + epoch = epoch key
 * - Anyone with NFT for this tier can derive the same epoch key
 */
export async function deriveEpochKey(
  myPrivateKey: Uint8Array,
  sourcePubkey: Uint8Array,
  tier: string,
  epoch: string
): Promise<Uint8Array> {
  // Perform X25519 key agreement
  const sharedSecret = await x25519(myPrivateKey, sourcePubkey);
  
  // Derive epoch key: HKDF(shared_secret, salt=tier||epoch, info="humint-epoch-key")
  const salt = new TextEncoder().encode(`${tier}|${epoch}`);
  const info = new TextEncoder().encode("humint-epoch-key");
  
  const epochKey = await hkdfDerive(sharedSecret, salt, info, 32);
  
  return new Uint8Array(epochKey);
}

/**
 * Encrypt content for a post
 * Returns encrypted content and wrapped content key
 */
export async function encryptPost(
  content: string | Uint8Array,
  epochKey: Uint8Array
): Promise<{
  encryptedContent: Uint8Array;
  iv: Uint8Array;
  contentKeyWrapped: Uint8Array;
}> {
  // Generate random content key
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Convert content to bytes if string
  const contentBytes = typeof content === 'string' 
    ? new TextEncoder().encode(content)
    : content;
  
  // Encrypt content with content key (AES-256-GCM)
  const encryptedContent = await aesGcmEncrypt(contentBytes, contentKey, iv);
  
  // Wrap content key with epoch key
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const contentKeyWrapped = await aesGcmEncrypt(
    contentKey, 
    epochKey, 
    wrapIv,
    true // Include IV in output
  );
  
  return {
    encryptedContent,
    iv,
    contentKeyWrapped,
  };
}

/**
 * Decrypt content from a post
 */
export async function decryptPost(
  encryptedContent: Uint8Array,
  iv: Uint8Array,
  contentKeyWrapped: Uint8Array,
  epochKey: Uint8Array
): Promise<Uint8Array> {
  // Unwrap content key
  const contentKey = await aesGcmDecrypt(contentKeyWrapped, epochKey, true);
  
  // Decrypt content
  const content = await aesGcmDecrypt(encryptedContent, contentKey, false, iv);
  
  return content;
}

/**
 * Encrypt content for a specific recipient (per-post grant)
 */
export async function encryptForRecipient(
  contentKey: Uint8Array,
  recipientPubkey: Uint8Array,
  myPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // DH to get shared secret with recipient
  const sharedSecret = await x25519(myPrivateKey, recipientPubkey);
  
  // Derive wrapping key
  const salt = new TextEncoder().encode("humint-grant");
  const info = new TextEncoder().encode("content-key-wrap");
  const wrapKey = await hkdfDerive(sharedSecret, salt, info, 32);
  
  // Wrap content key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await aesGcmEncrypt(contentKey, new Uint8Array(wrapKey), iv, true);
  
  return wrapped;
}

/**
 * Decrypt content key from a per-post grant
 */
export async function decryptGrantedKey(
  wrappedKey: Uint8Array,
  sourcePubkey: Uint8Array,
  myPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // DH to get shared secret with source
  const sharedSecret = await x25519(myPrivateKey, sourcePubkey);
  
  // Derive unwrapping key
  const salt = new TextEncoder().encode("humint-grant");
  const info = new TextEncoder().encode("content-key-wrap");
  const unwrapKey = await hkdfDerive(sharedSecret, salt, info, 32);
  
  // Unwrap content key
  const contentKey = await aesGcmDecrypt(wrappedKey, new Uint8Array(unwrapKey), true);
  
  return contentKey;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * AES-256-GCM encryption
 */
async function aesGcmEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  includeIv = false
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext
  );
  
  if (includeIv) {
    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result;
  }
  
  return new Uint8Array(ciphertext);
}

/**
 * AES-256-GCM decryption
 */
async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  ivIncluded: boolean,
  iv?: Uint8Array
): Promise<Uint8Array> {
  let actualIv: Uint8Array;
  let actualCiphertext: Uint8Array;
  
  if (ivIncluded) {
    // Extract IV from beginning
    actualIv = ciphertext.slice(0, 12);
    actualCiphertext = ciphertext.slice(12);
  } else {
    if (!iv) throw new Error('IV required when not included in ciphertext');
    actualIv = iv;
    actualCiphertext = ciphertext;
  }
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: actualIv },
    cryptoKey,
    actualCiphertext
  );
  
  return new Uint8Array(plaintext);
}

/**
 * HKDF key derivation
 */
async function hkdfDerive(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    baseKey,
    length * 8
  );
}

/**
 * X25519 key agreement (simplified - use proper library in production)
 * 
 * Note: WebCrypto doesn't expose X25519 directly.
 * In production, use @noble/curves or tweetnacl.
 */
async function x25519(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
  // For now, we'll use ECDH with P-256 as a placeholder
  // TODO: Replace with proper X25519 implementation
  
  // Simulate with HKDF of both keys (NOT SECURE - placeholder only)
  const combined = new Uint8Array(privateKey.length + publicKey.length);
  combined.set(privateKey, 0);
  combined.set(publicKey, privateKey.length);
  
  const shared = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(shared);
}

/**
 * Derive X25519 public key from private key (simplified)
 */
async function deriveX25519PublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  // TODO: Replace with proper X25519 implementation
  // For now, hash the private key to get a "public key"
  const hash = await crypto.subtle.digest('SHA-256', privateKey);
  return new Uint8Array(hash);
}

/**
 * Base64 to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uint8Array to Base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Uint8Array to Hex
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hex to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Hash content for integrity verification
 */
export async function hashContent(content: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', content);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Generate current epoch string (YYYY-MM)
 */
export function getCurrentEpoch(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ==========================================
// HIGH-LEVEL API
// ==========================================

export interface HumintKeys {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyHex: string;
}

export interface EncryptedPost {
  encryptedContent: string; // Base64
  iv: string; // Hex
  contentKeyWrapped: string; // Base64
  contentHash: string; // Hex
  tier: string;
  epoch: string;
}

/**
 * Initialize HUMINT crypto for a user
 */
export async function initHumintCrypto(
  nearAccountId: string,
  signMessage: (message: string) => Promise<{ signature: string; publicKey: string }>
): Promise<HumintKeys> {
  const { publicKey, privateKey } = await deriveKeypairFromWallet(nearAccountId, signMessage);
  
  return {
    publicKey,
    privateKey,
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Create an encrypted post (for sources)
 */
export async function createEncryptedPost(
  content: string,
  mediaBlobs: Uint8Array[],
  tier: string,
  keys: HumintKeys
): Promise<{
  textPost: EncryptedPost;
  mediaBlobs: { encrypted: Uint8Array; iv: string }[];
}> {
  const epoch = getCurrentEpoch();
  
  // Derive epoch key (source encrypts with their own key)
  const epochKey = await deriveEpochKey(keys.privateKey, keys.publicKey, tier, epoch);
  
  // Encrypt text content
  const { encryptedContent, iv, contentKeyWrapped } = await encryptPost(content, epochKey);
  const contentHash = await hashContent(new TextEncoder().encode(content));
  
  const textPost: EncryptedPost = {
    encryptedContent: bytesToBase64(encryptedContent),
    iv: bytesToHex(iv),
    contentKeyWrapped: bytesToBase64(contentKeyWrapped),
    contentHash,
    tier,
    epoch,
  };
  
  // Encrypt media blobs
  const encryptedMedia = await Promise.all(
    mediaBlobs.map(async (blob) => {
      const { encryptedContent: encrypted, iv: mediaIv } = await encryptPost(blob, epochKey);
      return {
        encrypted,
        iv: bytesToHex(mediaIv),
      };
    })
  );
  
  return {
    textPost,
    mediaBlobs: encryptedMedia,
  };
}

/**
 * Decrypt a post (for subscribers)
 */
export async function decryptPostContent(
  post: EncryptedPost,
  sourcePubkeyHex: string,
  keys: HumintKeys
): Promise<string> {
  const sourcePubkey = hexToBytes(sourcePubkeyHex);
  
  // Derive epoch key using DH with source's pubkey
  const epochKey = await deriveEpochKey(keys.privateKey, sourcePubkey, post.tier, post.epoch);
  
  // Decrypt content
  const encryptedContent = base64ToBytes(post.encryptedContent);
  const iv = hexToBytes(post.iv);
  const contentKeyWrapped = base64ToBytes(post.contentKeyWrapped);
  
  const plaintext = await decryptPost(encryptedContent, iv, contentKeyWrapped, epochKey);
  
  return new TextDecoder().decode(plaintext);
}

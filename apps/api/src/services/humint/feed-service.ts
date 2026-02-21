/**
 * HUMINT Feed Service
 * 
 * Abstracts blockchain complexity from users.
 * This is a simplified version - full crypto will be added when deploying to mainnet.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { pinFile, pinJSON, fetchFromIPFS, fetchBytesFromIPFS } from '../storage/ipfs';

// Types
export interface SourceProfile {
  id: string;
  codename: string;
  codenameHash: string;
  publicKey: string;
  tiers: TierConfig[];
  createdAt: Date;
  isActive: boolean;
}

export interface TierConfig {
  name: string;
  level: number;
  priceNear: string;
  description: string;
}

export interface HumintPost {
  id: string;
  sourceHash: string;
  contentCid: string;
  contentHash: string;
  minTier: number;
  epoch: string;
  createdAt: Date;
  content?: DecryptedContent;
}

export interface DecryptedContent {
  type: 'text' | 'image' | 'video';
  text?: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
}

// Default tiers
const DEFAULT_TIERS: TierConfig[] = [
  { name: 'Free', level: 0, priceNear: '0', description: 'Public updates' },
  { name: 'Bronze', level: 1, priceNear: '5', description: 'Basic intel access' },
  { name: 'Silver', level: 2, priceNear: '15', description: 'Premium intel + analysis' },
  { name: 'Gold', level: 3, priceNear: '50', description: 'Full access + direct contact' },
];

export class HumintFeedService {
  constructor() {}

  /**
   * Generate codename hash
   */
  hashCodename(codename: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(codename.toLowerCase())));
  }

  /**
   * Generate a deterministic public key from user ID
   * In production, this would derive from wallet signature
   */
  generatePublicKey(userId: string, codenameHash: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(`${userId}:${codenameHash}`)));
  }

  /**
   * Get current epoch (YYYY-MM)
   */
  getCurrentEpoch(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Hash content for integrity verification
   */
  hashContent(content: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(content)));
  }

  /**
   * Upload content to IPFS
   * In production, this would encrypt before uploading
   */
  async uploadContent(
    content: { text?: string; type: string; epoch: string; tier: number },
    postId: string
  ): Promise<string> {
    try {
      const result = await pinFile(
        Buffer.from(JSON.stringify(content)),
        `${postId}.json`,
        { type: 'humint-post', postId }
      );
      return result.cid;
    } catch (error) {
      console.error('IPFS upload failed:', error);
      // Return local reference if IPFS unavailable
      return `local:${this.hashContent(JSON.stringify(content)).slice(0, 16)}`;
    }
  }

  /**
   * Fetch content from IPFS
   * In production, this would decrypt after fetching
   */
  async fetchContent(cid: string): Promise<DecryptedContent | null> {
    if (cid.startsWith('local:')) {
      // Content stored locally, not on IPFS
      return null;
    }

    try {
      const data = await fetchFromIPFS<{ text?: string; type: string }>(cid);
      return {
        type: (data.type || 'text') as 'text' | 'image' | 'video',
        text: data.text,
      };
    } catch (error) {
      console.error('IPFS fetch failed:', error);
      return null;
    }
  }

  /**
   * Get default tiers
   */
  getDefaultTiers(): TierConfig[] {
    return DEFAULT_TIERS.slice(1); // Exclude free tier from options
  }
}

// Singleton instance
let feedServiceInstance: HumintFeedService | null = null;

export function getHumintFeedService(): HumintFeedService {
  if (!feedServiceInstance) {
    feedServiceInstance = new HumintFeedService();
  }
  return feedServiceInstance;
}

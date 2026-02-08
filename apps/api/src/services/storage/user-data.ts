/**
 * User-Owned Data Storage Service
 * 
 * Stores user data encrypted on IPFS, anchored to NEAR registry
 * User controls their data via their NEAR account
 */

import { pinJSON, fetchFromIPFS, unpin } from './ipfs';
import { encrypt, decrypt, hashData } from '../crypto/pq-encryption';

// User data schema
export interface UserDataStore {
  version: 1;
  accountId: string; // NEAR account ID
  updatedAt: string; // ISO timestamp
  dataHash: string; // SHA256 of unencrypted data for verification
  
  // User's encrypted data sections
  preferences: EncryptedSection;
  sourceLists: EncryptedSection;
  briefingHistory: EncryptedSection;
  ratings: EncryptedSection;
}

interface EncryptedSection {
  cid: string; // IPFS CID of encrypted data
  updatedAt: string;
  dataHash: string;
}

// Individual data types
export interface UserPreferences {
  domains: {
    selected: string[];
  };
  notificationEmails: {
    addresses: string[];
    primary: string;
  };
  email: {
    enabled: boolean;
    briefings: {
      enabled: boolean;
      deliveryTimes: string[];
      timezone: string;
      format: 'executive' | 'summary' | 'full';
      includeAudio: boolean;
    };
    alerts: {
      enabled: boolean;
      minConfidence: number;
    };
    digest: {
      enabled: boolean;
      frequency: 'daily' | 'weekly' | 'never';
    };
  };
  web: {
    darkMode: boolean;
    compactView: boolean;
  };
}

export interface SourceListData {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  sourceIds: string[]; // References to global sources
  createdAt: string;
  updatedAt: string;
  nftTokenId?: string; // If minted as NFT
}

export interface BriefingRecord {
  id: string;
  title: string;
  type: 'morning' | 'evening' | 'weekly';
  contentCid: string; // Full briefing content stored separately
  summary: string;
  sourceCount: number;
  avgConfidence: number;
  generatedAt: string;
}

export interface RatingRecord {
  sourceId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

/**
 * Store encrypted user preferences to IPFS
 */
export async function storePreferences(
  accountId: string,
  preferences: UserPreferences,
  publicKey: Uint8Array
): Promise<{ cid: string; dataHash: string }> {
  const dataHash = hashData(preferences);
  const encrypted = await encrypt(preferences, publicKey);
  
  const result = await pinJSON(encrypted, `argus-prefs-${accountId}`, {
    type: 'preferences',
    accountId,
    dataHash,
  });
  
  return {
    cid: result.cid,
    dataHash,
  };
}

/**
 * Fetch and decrypt user preferences from IPFS
 */
export async function fetchPreferences(
  cid: string,
  secretKey: Uint8Array
): Promise<UserPreferences> {
  const encrypted = await fetchFromIPFS(cid);
  return decrypt<UserPreferences>(encrypted as any, secretKey);
}

/**
 * Store source lists to IPFS
 */
export async function storeSourceLists(
  accountId: string,
  lists: SourceListData[],
  publicKey: Uint8Array
): Promise<{ cid: string; dataHash: string }> {
  const dataHash = hashData(lists);
  const encrypted = await encrypt(lists, publicKey);
  
  const result = await pinJSON(encrypted, `argus-lists-${accountId}`, {
    type: 'sourceLists',
    accountId,
    dataHash,
  });
  
  return {
    cid: result.cid,
    dataHash,
  };
}

/**
 * Fetch and decrypt source lists from IPFS
 */
export async function fetchSourceLists(
  cid: string,
  secretKey: Uint8Array
): Promise<SourceListData[]> {
  const encrypted = await fetchFromIPFS(cid);
  return decrypt<SourceListData[]>(encrypted as any, secretKey);
}

/**
 * Store briefing history to IPFS
 */
export async function storeBriefingHistory(
  accountId: string,
  briefings: BriefingRecord[],
  publicKey: Uint8Array
): Promise<{ cid: string; dataHash: string }> {
  const dataHash = hashData(briefings);
  const encrypted = await encrypt(briefings, publicKey);
  
  const result = await pinJSON(encrypted, `argus-briefings-${accountId}`, {
    type: 'briefingHistory',
    accountId,
    dataHash,
  });
  
  return {
    cid: result.cid,
    dataHash,
  };
}

/**
 * Fetch and decrypt briefing history from IPFS
 */
export async function fetchBriefingHistory(
  cid: string,
  secretKey: Uint8Array
): Promise<BriefingRecord[]> {
  const encrypted = await fetchFromIPFS(cid);
  return decrypt<BriefingRecord[]>(encrypted as any, secretKey);
}

/**
 * Store ratings to IPFS
 */
export async function storeRatings(
  accountId: string,
  ratings: RatingRecord[],
  publicKey: Uint8Array
): Promise<{ cid: string; dataHash: string }> {
  const dataHash = hashData(ratings);
  const encrypted = await encrypt(ratings, publicKey);
  
  const result = await pinJSON(encrypted, `argus-ratings-${accountId}`, {
    type: 'ratings',
    accountId,
    dataHash,
  });
  
  return {
    cid: result.cid,
    dataHash,
  };
}

/**
 * Fetch and decrypt ratings from IPFS
 */
export async function fetchRatings(
  cid: string,
  secretKey: Uint8Array
): Promise<RatingRecord[]> {
  const encrypted = await fetchFromIPFS(cid);
  return decrypt<RatingRecord[]>(encrypted as any, secretKey);
}

/**
 * Create the master user data store document
 * This is what gets anchored to the NEAR registry
 */
export async function createUserDataStore(
  accountId: string,
  sections: {
    preferences?: { cid: string; dataHash: string };
    sourceLists?: { cid: string; dataHash: string };
    briefingHistory?: { cid: string; dataHash: string };
    ratings?: { cid: string; dataHash: string };
  }
): Promise<{ cid: string; store: UserDataStore }> {
  const now = new Date().toISOString();
  
  const store: UserDataStore = {
    version: 1,
    accountId,
    updatedAt: now,
    dataHash: '', // Computed below
    
    preferences: sections.preferences ? {
      cid: sections.preferences.cid,
      updatedAt: now,
      dataHash: sections.preferences.dataHash,
    } : { cid: '', updatedAt: now, dataHash: '' },
    
    sourceLists: sections.sourceLists ? {
      cid: sections.sourceLists.cid,
      updatedAt: now,
      dataHash: sections.sourceLists.dataHash,
    } : { cid: '', updatedAt: now, dataHash: '' },
    
    briefingHistory: sections.briefingHistory ? {
      cid: sections.briefingHistory.cid,
      updatedAt: now,
      dataHash: sections.briefingHistory.dataHash,
    } : { cid: '', updatedAt: now, dataHash: '' },
    
    ratings: sections.ratings ? {
      cid: sections.ratings.cid,
      updatedAt: now,
      dataHash: sections.ratings.dataHash,
    } : { cid: '', updatedAt: now, dataHash: '' },
  };
  
  // Compute overall hash
  store.dataHash = hashData(store);
  
  // Pin the master document (unencrypted - just references)
  const result = await pinJSON(store, `argus-userdata-${accountId}`, {
    type: 'userDataStore',
    accountId,
    version: '1',
  });
  
  return {
    cid: result.cid,
    store,
  };
}

/**
 * Fetch user data store from IPFS
 */
export async function fetchUserDataStore(cid: string): Promise<UserDataStore> {
  return fetchFromIPFS<UserDataStore>(cid);
}

/**
 * Export all user data (for portability)
 */
export async function exportAllUserData(
  storeCid: string,
  secretKey: Uint8Array
): Promise<{
  preferences: UserPreferences | null;
  sourceLists: SourceListData[] | null;
  briefingHistory: BriefingRecord[] | null;
  ratings: RatingRecord[] | null;
  exportedAt: string;
}> {
  const store = await fetchUserDataStore(storeCid);
  
  const [preferences, sourceLists, briefingHistory, ratings] = await Promise.all([
    store.preferences.cid ? fetchPreferences(store.preferences.cid, secretKey).catch(() => null) : null,
    store.sourceLists.cid ? fetchSourceLists(store.sourceLists.cid, secretKey).catch(() => null) : null,
    store.briefingHistory.cid ? fetchBriefingHistory(store.briefingHistory.cid, secretKey).catch(() => null) : null,
    store.ratings.cid ? fetchRatings(store.ratings.cid, secretKey).catch(() => null) : null,
  ]);
  
  return {
    preferences,
    sourceLists,
    briefingHistory,
    ratings,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Delete all user data (revoke)
 */
export async function deleteAllUserData(storeCid: string): Promise<{
  deleted: string[];
  failed: string[];
}> {
  const store = await fetchUserDataStore(storeCid);
  const deleted: string[] = [];
  const failed: string[] = [];
  
  const cidsToDelete = [
    storeCid,
    store.preferences.cid,
    store.sourceLists.cid,
    store.briefingHistory.cid,
    store.ratings.cid,
  ].filter(Boolean);
  
  for (const cid of cidsToDelete) {
    try {
      await unpin(cid);
      deleted.push(cid);
    } catch {
      failed.push(cid);
    }
  }
  
  return { deleted, failed };
}

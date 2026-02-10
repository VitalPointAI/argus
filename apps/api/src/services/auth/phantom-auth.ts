/**
 * Phantom Auth Integration
 * 
 * Anonymous passkey authentication for HUMINT sources using @vitalpoint/near-phantom-auth
 * 
 * NOTE: Uses dynamic imports to fail gracefully if package not built
 */

import { db } from '../../db';
import { Pool } from 'pg';

// Dynamic import types
type AnonAuthInstance = any;

let phantomAuth: AnonAuthInstance | null = null;
let phantomAuthAvailable = true;

/**
 * Initialize Phantom Auth
 * 
 * Call this during server startup. Uses dynamic imports to fail gracefully.
 */
export async function initPhantomAuth(): Promise<AnonAuthInstance | null> {
  if (phantomAuth) {
    return phantomAuth;
  }

  if (!phantomAuthAvailable) {
    return null;
  }

  // Try to dynamically import the phantom auth package
  let createAnonAuth: any;
  try {
    const mod = await import('@vitalpoint/near-phantom-auth/server');
    createAnonAuth = mod.createAnonAuth;
  } catch (e) {
    console.warn('[PhantomAuth] Package not available, HUMINT registration disabled:', e instanceof Error ? e.message : e);
    phantomAuthAvailable = false;
    return null;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Phantom Auth');
  }

  const sessionSecret = process.env.PHANTOM_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('PHANTOM_SESSION_SECRET or SESSION_SECRET is required');
  }

  // Determine RP configuration from environment
  const rpId = process.env.PHANTOM_RP_ID || 'argus.vitalpoint.ai';
  const rpName = process.env.PHANTOM_RP_NAME || 'Argus Intelligence';
  const rpOrigin = process.env.PHANTOM_RP_ORIGIN || 'https://argus.vitalpoint.ai';

  // Determine NEAR network
  const nearNetwork = (process.env.NEAR_NETWORK || 'testnet') as 'testnet' | 'mainnet';

  // Build IPFS recovery config if available
  let ipfsConfig = undefined;
  if (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET) {
    ipfsConfig = {
      pinningService: 'pinata' as const,
      apiKey: process.env.PINATA_API_KEY,
      apiSecret: process.env.PINATA_API_SECRET,
    };
  } else if (process.env.WEB3_STORAGE_TOKEN) {
    ipfsConfig = {
      pinningService: 'web3storage' as const,
      apiKey: process.env.WEB3_STORAGE_TOKEN,
    };
  } else if (process.env.INFURA_IPFS_PROJECT_ID && process.env.INFURA_IPFS_PROJECT_SECRET) {
    ipfsConfig = {
      pinningService: 'infura' as const,
      projectId: process.env.INFURA_IPFS_PROJECT_ID,
      apiSecret: process.env.INFURA_IPFS_PROJECT_SECRET,
    };
  }

  console.log('[PhantomAuth] Initializing...', {
    rpId,
    rpName,
    nearNetwork,
    ipfsConfigured: !!ipfsConfig,
  });

  phantomAuth = createAnonAuth({
    nearNetwork,
    sessionSecret,
    database: {
      type: 'postgres',
      connectionString: databaseUrl,
    },
    rp: {
      name: rpName,
      id: rpId,
      origin: rpOrigin,
    },
    codename: {
      style: 'nato-phonetic', // ALPHA-7, BRAVO-12, etc.
    },
    recovery: {
      wallet: true, // Enable NEAR wallet recovery
      ipfs: ipfsConfig, // Enable IPFS recovery if configured
    },
  });

  // Initialize database schema
  await phantomAuth.initialize();
  console.log('[PhantomAuth] Database schema initialized');

  return phantomAuth;
}

/**
 * Get Phantom Auth instance
 * 
 * Throws if not initialized
 */
export function getPhantomAuth(): AnonAuthInstance {
  if (!phantomAuth) {
    throw new Error('PhantomAuth not initialized. Call initPhantomAuth() first.');
  }
  return phantomAuth;
}

/**
 * Check if Phantom Auth is initialized
 */
export function isPhantomAuthInitialized(): boolean {
  return phantomAuth !== null;
}

/**
 * Middleware types for Hono integration
 */
export interface PhantomUser {
  id: string;
  codename: string;
  nearAccountId: string;
  mpcPublicKey: string;
  derivationPath: string;
}

export interface PhantomSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

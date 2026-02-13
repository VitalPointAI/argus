import { db } from '../../db';
import { platformSettings } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Cache settings for 5 minutes
let settingsCache: Record<string, any> = {};
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all platform settings (cached)
 */
export async function getPlatformSettings(): Promise<Record<string, any>> {
  if (Date.now() < cacheExpiry && Object.keys(settingsCache).length > 0) {
    return settingsCache;
  }

  try {
    const rows = await db.select().from(platformSettings);
    
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      } catch {
        settings[row.key] = row.value;
      }
    }
    
    settingsCache = settings;
    cacheExpiry = Date.now() + CACHE_TTL;
    
    return settings;
  } catch (error) {
    console.error('Failed to fetch platform settings:', error);
    // Return defaults on error
    return getDefaultSettings();
  }
}

/**
 * Get a single platform setting
 */
export async function getSetting<T = any>(key: string, defaultValue?: T): Promise<T> {
  const settings = await getPlatformSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * Get marketplace fee percentage
 */
export async function getMarketplaceFeePercent(): Promise<number> {
  return getSetting('marketplace_fee_percent', 5);
}

/**
 * Get platform wallet for fees
 */
export async function getPlatformWallet(): Promise<string> {
  return getSetting('platform_wallet', 'argus-intel.near');
}

/**
 * Get minimum withdrawal amount
 */
export async function getMinWithdrawalUsdc(): Promise<number> {
  return getSetting('min_withdrawal_usdc', 10);
}

/**
 * Check if marketplace is enabled
 */
export async function isMarketplaceEnabled(): Promise<boolean> {
  return getSetting('marketplace_enabled', true);
}

/**
 * Invalidate settings cache (call after admin updates)
 */
export function invalidateSettingsCache(): void {
  cacheExpiry = 0;
  settingsCache = {};
}

/**
 * Default settings fallback
 */
function getDefaultSettings(): Record<string, any> {
  return {
    marketplace_fee_percent: 5,
    min_withdrawal_usdc: 10,
    platform_wallet: 'argus-intel.near',
    marketplace_enabled: true,
  };
}

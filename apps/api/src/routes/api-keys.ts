import { Hono } from 'hono';
import { Context, Next } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db, users, apiKeys, apiKeyRateLimits } from '../db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

// User type from database
interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  preferences: Record<string, unknown>;
}

// Context variables type
type Variables = {
  user: User | null;
  authMethod?: 'jwt' | 'api_key';
  apiKeyId?: string;
};

export const apiKeysRoutes = new Hono<{ Variables: Variables }>();

const JWT_SECRET = process.env.JWT_SECRET || 'argus-secret-change-in-production';
const API_KEY_RATE_LIMIT = parseInt(process.env.API_KEY_RATE_LIMIT || '100'); // requests per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// ============ Helper Functions ============

/**
 * Generate a secure random API key
 * Format: argus_<32 random hex chars>
 */
function generateApiKey(): string {
  const randomPart = randomBytes(16).toString('hex');
  return `argus_${randomPart}`;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Get the prefix of an API key (first 8 chars for identification)
 */
function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}

/**
 * Require JWT authentication middleware
 */
async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 401);
    }
    
    c.set('user', user as User);
    await next();
  } catch {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
}

// Apply auth middleware to all routes
apiKeysRoutes.use('/*', requireAuth);

// ============ Validation Schemas ============

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
});

// ============ Routes ============

/**
 * POST /api/keys - Create a new API key
 * Returns the key once - it cannot be retrieved again
 */
apiKeysRoutes.post('/', zValidator('json', createKeySchema), async (c) => {
  try {
    const user = c.get('user')!;
    const { name } = c.req.valid('json');
    
    // Generate the key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = getKeyPrefix(apiKey);
    
    // Store the hashed key
    const [created] = await db.insert(apiKeys).values({
      userId: user.id,
      keyHash,
      keyPrefix,
      name,
    }).returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    });
    
    return c.json({
      success: true,
      data: {
        ...created,
        key: apiKey, // Only returned once!
      },
      message: 'API key created. Save it now - it cannot be retrieved again.',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    return c.json({ success: false, error: 'Failed to create API key' }, 500);
  }
});

/**
 * GET /api/keys - List user's API keys (without revealing the actual keys)
 */
apiKeysRoutes.get('/', async (c) => {
  try {
    const user = c.get('user')!;
    
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id))
      .orderBy(desc(apiKeys.createdAt));
    
    return c.json({ success: true, data: keys });
  } catch (error) {
    console.error('List API keys error:', error);
    return c.json({ success: false, error: 'Failed to list API keys' }, 500);
  }
});

/**
 * DELETE /api/keys/:id - Revoke an API key
 */
apiKeysRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user')!;
    const keyId = c.req.param('id');
    
    // Verify ownership and delete
    const [deleted] = await db
      .delete(apiKeys)
      .where(and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.userId, user.id)
      ))
      .returning({ id: apiKeys.id });
    
    if (!deleted) {
      return c.json({ success: false, error: 'API key not found' }, 404);
    }
    
    return c.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    console.error('Delete API key error:', error);
    return c.json({ success: false, error: 'Failed to revoke API key' }, 500);
  }
});

// ============ API Key Authentication Middleware ============

/**
 * Check rate limit for an API key
 * Returns true if request is allowed, false if rate limited
 */
async function checkRateLimit(keyId: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS);
  const resetAt = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_MS);
  
  // Try to find existing rate limit record
  const [existing] = await db
    .select()
    .from(apiKeyRateLimits)
    .where(and(
      eq(apiKeyRateLimits.apiKeyId, keyId),
      eq(apiKeyRateLimits.windowStart, windowStart)
    ))
    .limit(1);
  
  if (existing) {
    if (existing.requestCount >= API_KEY_RATE_LIMIT) {
      return { allowed: false, remaining: 0, resetAt };
    }
    
    // Increment counter
    await db
      .update(apiKeyRateLimits)
      .set({ requestCount: existing.requestCount + 1 })
      .where(eq(apiKeyRateLimits.id, existing.id));
    
    return { 
      allowed: true, 
      remaining: API_KEY_RATE_LIMIT - existing.requestCount - 1,
      resetAt 
    };
  }
  
  // Create new rate limit record
  await db.insert(apiKeyRateLimits).values({
    apiKeyId: keyId,
    windowStart,
    requestCount: 1,
  });
  
  return { allowed: true, remaining: API_KEY_RATE_LIMIT - 1, resetAt };
}

/**
 * API Key authentication middleware
 * Checks X-API-Key header and authenticates the request
 * Works alongside JWT auth - either one is sufficient
 * 
 * Note: Using `any` for context type since this middleware is used across
 * different Hono app instances with varying type definitions.
 */
export async function apiKeyAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Check if already authenticated via JWT
  try {
    if (c.get('user' as never)) {
      return next();
    }
  } catch {
    // No user set yet, continue
  }
  
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey) {
    // No API key provided, continue to next middleware
    // (might be using JWT auth instead)
    return next();
  }
  
  // Validate API key format
  if (!apiKey.startsWith('argus_') || apiKey.length !== 38) {
    return c.json({ success: false, error: 'Invalid API key format' }, 401);
  }
  
  try {
    const keyPrefix = getKeyPrefix(apiKey);
    const keyHash = hashApiKey(apiKey);
    
    // Find matching key by prefix first, then verify hash
    const matchingKeys = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyPrefix, keyPrefix),
        eq(apiKeys.isActive, true)
      ));
    
    const matchedKey = matchingKeys.find(k => k.keyHash === keyHash);
    
    if (!matchedKey) {
      return c.json({ success: false, error: 'Invalid API key' }, 401);
    }
    
    // Check rate limit
    const rateLimit = await checkRateLimit(matchedKey.id);
    
    // Add rate limit headers
    c.header('X-RateLimit-Limit', API_KEY_RATE_LIMIT.toString());
    c.header('X-RateLimit-Remaining', rateLimit.remaining.toString());
    c.header('X-RateLimit-Reset', Math.floor(rateLimit.resetAt.getTime() / 1000).toString());
    
    if (!rateLimit.allowed) {
      return c.json({ 
        success: false, 
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)
      }, 429);
    }
    
    // Get the user associated with this key
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, matchedKey.userId))
      .limit(1);
    
    if (!user) {
      return c.json({ success: false, error: 'API key user not found' }, 401);
    }
    
    // Update last used timestamp (non-blocking)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, matchedKey.id))
      .catch(console.error);
    
    // Set user context
    c.set('user' as never, user as never);
    c.set('authMethod' as never, 'api_key' as never);
    c.set('apiKeyId' as never, matchedKey.id as never);
    
    return next();
  } catch (error) {
    console.error('API key auth error:', error);
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
}

/**
 * Combined auth middleware that accepts either JWT or API key
 */
export async function combinedAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');
  
  // Try JWT first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
      
      if (user) {
        c.set('user' as never, user as never);
        c.set('authMethod' as never, 'jwt' as never);
        return next();
      }
    } catch {
      // JWT invalid, try API key
    }
  }
  
  // Try API key
  if (apiKey) {
    return apiKeyAuthMiddleware(c, next);
  }
  
  // No auth provided
  c.set('user' as never, null as never);
  return next();
}

/**
 * Require authentication (either JWT or API key)
 */
export function requireCombinedAuth(c: Context, next: Next): Response | Promise<void> {
  try {
    if (!c.get('user' as never)) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
  } catch {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  return next();
}

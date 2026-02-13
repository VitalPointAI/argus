import { Hono, Context } from 'hono';
import { db, users, sources, content, briefings, domains, apiKeys, platformSettings } from '../db';
import { eq, desc, count, and, gte, isNull } from 'drizzle-orm';
import { authMiddleware } from './auth';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

type Variables = {
  adminUser: AdminUser;
  user: AdminUser | null;
};

export const adminRoutes = new Hono<{ Variables: Variables }>();

/**
 * Middleware to verify admin status (uses authMiddleware for cookie/token support)
 */
async function requireAdmin(c: Context<{ Variables: Variables }>, next: () => Promise<void>) {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }
  
  if (!user.isAdmin) {
    return c.json({ success: false, error: 'Admin access required' }, 403);
  }
  
  c.set('adminUser', user);
  await next();
}

// Apply auth middleware first, then admin check
adminRoutes.use('/*', authMiddleware);
adminRoutes.use('/*', requireAdmin);

/**
 * GET /admin/stats - System statistics
 */
adminRoutes.get('/stats', async (c) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get counts
    const [userCount] = await db.select({ count: count() }).from(users);
    const [sourceCount] = await db.select({ count: count() }).from(sources);
    const [contentCount] = await db.select({ count: count() }).from(content);
    const [briefingCount] = await db.select({ count: count() }).from(briefings);
    const [domainCount] = await db.select({ count: count() }).from(domains);
    
    // Recent activity - content ingested
    const [content24h] = await db
      .select({ count: count() })
      .from(content)
      .where(gte(content.fetchedAt, last24h));
    
    const [content7d] = await db
      .select({ count: count() })
      .from(content)
      .where(gte(content.fetchedAt, last7d));
    
    // Active sources (fetched in last 24h)
    const [activeSources] = await db
      .select({ count: count() })
      .from(sources)
      .where(and(eq(sources.isActive, true), gte(sources.lastFetchedAt, last24h)));
    
    return c.json({
      success: true,
      data: {
        totals: {
          users: userCount.count,
          sources: sourceCount.count,
          articles: contentCount.count,
          briefings: briefingCount.count,
          domains: domainCount.count,
        },
        activity: {
          articlesLast24h: content24h.count,
          articlesLast7d: content7d.count,
          activeSourcesLast24h: activeSources.count,
        },
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});

/**
 * GET /admin/users - List all users
 */
adminRoutes.get('/users', async (c) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    
    return c.json({ success: true, data: allUsers });
  } catch (error) {
    console.error('Admin users error:', error);
    return c.json({ success: false, error: 'Failed to fetch users' }, 500);
  }
});

/**
 * PUT /admin/users/:id - Update user (admin status, etc.)
 */
adminRoutes.put('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();
    const currentUser = c.get('adminUser') as AdminUser;
    
    // Prevent self-demotion
    if (userId === currentUser.id && body.isAdmin === false) {
      return c.json({ success: false, error: 'Cannot remove your own admin status' }, 400);
    }
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (typeof body.isAdmin === 'boolean') {
      updateData.isAdmin = body.isAdmin;
    }
    if (typeof body.name === 'string') {
      updateData.name = body.name;
    }
    
    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
      });
    
    if (!updated) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin update user error:', error);
    return c.json({ success: false, error: 'Failed to update user' }, 500);
  }
});

/**
 * DELETE /admin/users/:id - Delete user
 */
adminRoutes.delete('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const currentUser = c.get('adminUser') as AdminUser;
    
    if (userId === currentUser.id) {
      return c.json({ success: false, error: 'Cannot delete yourself' }, 400);
    }
    
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    
    if (!deleted) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    return c.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    return c.json({ success: false, error: 'Failed to delete user' }, 500);
  }
});

/**
 * GET /admin/sources/global - List all global sources (createdBy is null)
 */
adminRoutes.get('/sources/global', async (c) => {
  try {
    const globalSources = await db
      .select()
      .from(sources)
      .where(isNull(sources.createdBy))
      .orderBy(desc(sources.lastFetchedAt));
    
    return c.json({ success: true, data: globalSources });
  } catch (error) {
    console.error('Admin global sources error:', error);
    return c.json({ success: false, error: 'Failed to fetch sources' }, 500);
  }
});

/**
 * POST /admin/sources/:id/make-global - Make a user source global
 */
adminRoutes.post('/sources/:id/make-global', async (c) => {
  try {
    const sourceId = c.req.param('id');
    
    const [updated] = await db
      .update(sources)
      .set({ createdBy: null })
      .where(eq(sources.id, sourceId))
      .returning();
    
    if (!updated) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin make global error:', error);
    return c.json({ success: false, error: 'Failed to update source' }, 500);
  }
});

/**
 * DELETE /admin/sources/:id - Delete any source (admin only)
 */
adminRoutes.delete('/sources/:id', async (c) => {
  try {
    const sourceId = c.req.param('id');
    
    const [deleted] = await db
      .delete(sources)
      .where(eq(sources.id, sourceId))
      .returning({ id: sources.id });
    
    if (!deleted) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Source deleted' });
  } catch (error) {
    console.error('Admin delete source error:', error);
    return c.json({ success: false, error: 'Failed to delete source' }, 500);
  }
});

/**
 * POST /admin/ingest/trigger - Manually trigger ingestion
 */
adminRoutes.post('/ingest/trigger', async (c) => {
  try {
    // This could trigger the ingestion job via a separate process
    // For now, just acknowledge the request
    return c.json({ 
      success: true, 
      message: 'Ingestion triggered. Check logs for progress.',
      note: 'Full implementation requires background job integration'
    });
  } catch (error) {
    console.error('Admin ingest trigger error:', error);
    return c.json({ success: false, error: 'Failed to trigger ingestion' }, 500);
  }
});

// ============ API Keys Management (Admin) ============

/**
 * GET /admin/api-keys - List all API keys across all users
 */
adminRoutes.get('/api-keys', async (c) => {
  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        userName: users.name,
        userEmail: users.email,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.userId, users.id))
      .orderBy(desc(apiKeys.createdAt));
    
    return c.json({ success: true, data: keys });
  } catch (error) {
    console.error('Admin list API keys error:', error);
    return c.json({ success: false, error: 'Failed to list API keys' }, 500);
  }
});

/**
 * PUT /admin/api-keys/:id - Update API key (activate/deactivate)
 */
adminRoutes.put('/api-keys/:id', async (c) => {
  try {
    const keyId = c.req.param('id');
    const body = await c.req.json();
    
    const updateData: Record<string, any> = {};
    
    if (typeof body.isActive === 'boolean') {
      updateData.isActive = body.isActive;
    }
    if (typeof body.name === 'string') {
      updateData.name = body.name;
    }
    
    if (Object.keys(updateData).length === 0) {
      return c.json({ success: false, error: 'No valid fields to update' }, 400);
    }
    
    const [updated] = await db
      .update(apiKeys)
      .set(updateData)
      .where(eq(apiKeys.id, keyId))
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      });
    
    if (!updated) {
      return c.json({ success: false, error: 'API key not found' }, 404);
    }
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin update API key error:', error);
    return c.json({ success: false, error: 'Failed to update API key' }, 500);
  }
});

/**
 * DELETE /admin/api-keys/:id - Delete any API key (admin only)
 */
adminRoutes.delete('/api-keys/:id', async (c) => {
  try {
    const keyId = c.req.param('id');
    
    const [deleted] = await db
      .delete(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .returning({ id: apiKeys.id });
    
    if (!deleted) {
      return c.json({ success: false, error: 'API key not found' }, 404);
    }
    
    return c.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    console.error('Admin delete API key error:', error);
    return c.json({ success: false, error: 'Failed to delete API key' }, 500);
  }
});

// ============ Platform Settings ============

/**
 * GET /admin/settings - Get all platform settings
 */
adminRoutes.get('/settings', async (c) => {
  try {
    const settings = await db.select().from(platformSettings);
    
    // Convert to key-value object, parsing JSON values
    const settingsObj: Record<string, any> = {};
    for (const s of settings) {
      let parsedValue = s.value;
      // Try to parse as JSON (for backwards compat with stringified values)
      try {
        parsedValue = JSON.parse(s.value);
      } catch {
        // Keep as-is if not valid JSON
      }
      settingsObj[s.key] = {
        value: parsedValue,
        description: s.description,
        updatedAt: s.updatedAt,
      };
    }
    
    return c.json({ success: true, data: settingsObj });
  } catch (error) {
    console.error('Admin get settings error:', error);
    return c.json({ success: false, error: 'Failed to fetch settings' }, 500);
  }
});

/**
 * PUT /admin/settings/:key - Update a platform setting
 */
adminRoutes.put('/settings/:key', async (c) => {
  try {
    const adminUser = c.get('adminUser');
    const key = c.req.param('key');
    const body = await c.req.json();
    const { value } = body;
    
    if (value === undefined) {
      return c.json({ success: false, error: 'Value required' }, 400);
    }
    
    // Validate specific settings
    if (key === 'marketplace_fee_percent') {
      const fee = parseFloat(value);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return c.json({ success: false, error: 'Fee must be 0-100' }, 400);
      }
    }
    
    // Upsert setting
    const existing = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    
    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(platformSettings)
        .set({ 
          value: JSON.stringify(value),
          updatedBy: adminUser.id,
          updatedAt: new Date(),
        })
        .where(eq(platformSettings.key, key))
        .returning();
    } else {
      [result] = await db
        .insert(platformSettings)
        .values({
          key,
          value: JSON.stringify(value),
          updatedBy: adminUser.id,
        })
        .returning();
    }
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin update setting error:', error);
    return c.json({ success: false, error: 'Failed to update setting' }, 500);
  }
});

/**
 * POST /admin/settings - Batch update settings
 */
adminRoutes.post('/settings', async (c) => {
  try {
    const adminUser = c.get('adminUser');
    const body = await c.req.json();
    
    console.log('[Admin] Saving settings:', body);
    
    const results = [];
    for (const [key, value] of Object.entries(body)) {
      // Store as string - stringify only objects/arrays, not primitives
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      const existing = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
      
      if (existing.length > 0) {
        const [result] = await db
          .update(platformSettings)
          .set({ 
            value: valueStr,
            updatedBy: adminUser.id,
            updatedAt: new Date(),
          })
          .where(eq(platformSettings.key, key))
          .returning();
        results.push(result);
      } else {
        const [result] = await db
          .insert(platformSettings)
          .values({
            key,
            value: valueStr,
            updatedBy: adminUser.id,
          })
          .returning();
        results.push(result);
      }
    }
    
    console.log('[Admin] Settings saved:', results.length, 'keys');
    return c.json({ success: true, data: results });
  } catch (error) {
    console.error('Admin batch update settings error:', error);
    return c.json({ success: false, error: 'Failed to update settings' }, 500);
  }
});

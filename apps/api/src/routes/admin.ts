import { Hono } from 'hono';
import { db, users, sources, articles, briefings, domains } from '../db';
import { eq, desc, count, sql, and, gte } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'argus-secret-change-in-production';

export const adminRoutes = new Hono();

/**
 * Middleware to verify admin status
 */
async function requireAdmin(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    
    if (!user || !user.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    c.set('user', user);
    await next();
  } catch {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
}

// Apply admin middleware to all routes
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
    const [articleCount] = await db.select({ count: count() }).from(articles);
    const [briefingCount] = await db.select({ count: count() }).from(briefings);
    const [domainCount] = await db.select({ count: count() }).from(domains);
    
    // Recent activity
    const [articles24h] = await db
      .select({ count: count() })
      .from(articles)
      .where(gte(articles.ingestedAt, last24h));
    
    const [articles7d] = await db
      .select({ count: count() })
      .from(articles)
      .where(gte(articles.ingestedAt, last7d));
    
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
          articles: articleCount.count,
          briefings: briefingCount.count,
          domains: domainCount.count,
        },
        activity: {
          articlesLast24h: articles24h.count,
          articlesLast7d: articles7d.count,
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
    const currentUser = c.get('user');
    
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
    const currentUser = c.get('user');
    
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
 * GET /admin/sources/global - List all global sources with stats
 */
adminRoutes.get('/sources/global', async (c) => {
  try {
    const globalSources = await db
      .select()
      .from(sources)
      .where(eq(sources.isGlobal, true))
      .orderBy(desc(sources.lastFetchedAt));
    
    return c.json({ success: true, data: globalSources });
  } catch (error) {
    console.error('Admin global sources error:', error);
    return c.json({ success: false, error: 'Failed to fetch sources' }, 500);
  }
});

/**
 * POST /admin/sources/:id/toggle-global - Toggle source global status
 */
adminRoutes.post('/sources/:id/toggle-global', async (c) => {
  try {
    const sourceId = c.req.param('id');
    
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    const [updated] = await db
      .update(sources)
      .set({ isGlobal: !source.isGlobal })
      .where(eq(sources.id, sourceId))
      .returning();
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin toggle global error:', error);
    return c.json({ success: false, error: 'Failed to toggle source' }, 500);
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

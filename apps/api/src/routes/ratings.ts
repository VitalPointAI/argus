/**
 * Source Ratings API Routes
 * 
 * POST /api/sources/:id/rate - Submit or update a rating
 * GET /api/sources/:id/ratings - Get ratings for a source
 * GET /api/sources/:id/reputation - Get full reputation data
 * GET /api/sources/:id/reliability-history - Get reliability score history
 */

import { Hono } from 'hono';
import { authMiddleware } from './auth';
import {
  rateSource,
  getSourceRatings,
  getSourceReputation,
  getReliabilityHistory,
  applyReputationDecay,
} from '../services/reputation';
import { db, sources } from '../db';
import { eq } from 'drizzle-orm';

// User type from database
interface User {
  id: string;
  email: string;
  name: string;
  preferences: Record<string, unknown>;
}

// Context variables type
type Variables = {
  user: User | null;
};

export const ratingsRoutes = new Hono<{ Variables: Variables }>();

// Admin emails
const ADMIN_EMAILS = ['a.luhning@vitalpoint.ai'];

function isAdmin(user: User | null): boolean {
  return !!user && ADMIN_EMAILS.includes(user.email);
}

// Rate a source (requires authentication)
ratingsRoutes.post('/:id/rate', authMiddleware, async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const { rating, comment } = body;
  
  if (rating === undefined || rating === null) {
    return c.json({ success: false, error: 'rating is required (1-5)' }, 400);
  }
  
  const result = await rateSource(sourceId, user.id, rating, comment);
  
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }
  
  const status = result.rating?.isUpdate ? 200 : 201;
  return c.json({
    success: true,
    data: result.rating,
    warning: result.warning,
  }, status);
});

// Get ratings for a source (public, but shows more info if authenticated)
ratingsRoutes.get('/:id/ratings', async (c) => {
  const sourceId = c.req.param('id');
  const limit = Math.min(100, parseInt(c.req.query('limit') || '20'));
  const offset = parseInt(c.req.query('offset') || '0');
  
  // Check source exists
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  const result = await getSourceRatings(sourceId, limit, offset);
  
  return c.json({
    success: true,
    data: {
      source: {
        id: source.id,
        name: source.name,
        reliabilityScore: source.reliabilityScore,
      },
      ...result,
      pagination: {
        limit,
        offset,
        hasMore: result.ratings.length === limit,
      },
    },
  });
});

// Get full reputation data for a source
ratingsRoutes.get('/:id/reputation', async (c) => {
  const sourceId = c.req.param('id');
  
  const reputation = await getSourceReputation(sourceId);
  
  if (!reputation) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  return c.json({
    success: true,
    data: reputation,
  });
});

// Get reliability history for a source
ratingsRoutes.get('/:id/reliability-history', async (c) => {
  const sourceId = c.req.param('id');
  const limit = Math.min(100, parseInt(c.req.query('limit') || '50'));
  
  // Check source exists
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  const history = await getReliabilityHistory(sourceId, limit);
  
  return c.json({
    success: true,
    data: {
      source: {
        id: source.id,
        name: source.name,
        currentScore: source.reliabilityScore,
      },
      history,
    },
  });
});

// Admin route: Manually trigger reputation decay
ratingsRoutes.post('/decay/trigger', authMiddleware, async (c) => {
  const user = c.get('user');
  
  if (!isAdmin(user)) {
    return c.json({ success: false, error: 'Admin access required' }, 403);
  }
  
  const result = await applyReputationDecay();
  
  return c.json({
    success: true,
    data: result,
  });
});

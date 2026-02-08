// Intel Bounties API Routes
// Allows users to post requests for specific intelligence with rewards

import { Hono } from 'hono';
import { db } from '../db';
import { intelBounties, humintSources, humintSubmissions, users } from '../db/schema';
import { eq, desc, sql, and, gte, or, ilike } from 'drizzle-orm';

const bounties = new Hono();

// Helper to get authenticated user from context
function getUser(c: any): { id: string } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string } : null;
}

// ============================================
// List Bounties (Public)
// ============================================

bounties.get('/', async (c) => {
  try {
    const {
      status = 'open',
      region,
      domain,
      minReward,
      maxReward,
      sort = 'recent',
      limit = '20',
      offset = '0'
    } = c.req.query();
    
    let query = db.select({
      id: intelBounties.id,
      title: intelBounties.title,
      description: intelBounties.description,
      domains: intelBounties.domains,
      regions: intelBounties.regions,
      rewardUsdc: intelBounties.rewardUsdc,
      minSourceReputation: intelBounties.minSourceReputation,
      status: intelBounties.status,
      expiresAt: intelBounties.expiresAt,
      createdAt: intelBounties.createdAt,
      // Don't expose creator ID for anonymous bounties
    })
    .from(intelBounties)
    .$dynamic();
    
    const conditions = [];
    
    // Status filter
    if (status && status !== 'all') {
      conditions.push(eq(intelBounties.status, status));
    }
    
    // Region filter
    if (region) {
      const regions = region.split(',').map(r => r.trim().toLowerCase());
      conditions.push(sql`${intelBounties.regions} && ${regions}`);
    }
    
    // Domain filter
    if (domain) {
      const domains = domain.split(',').map(d => d.trim().toLowerCase());
      conditions.push(sql`${intelBounties.domains} && ${domains}`);
    }
    
    // Reward range
    if (minReward) {
      conditions.push(gte(intelBounties.rewardUsdc, parseFloat(minReward)));
    }
    if (maxReward) {
      conditions.push(sql`${intelBounties.rewardUsdc} <= ${parseFloat(maxReward)}`);
    }
    
    // Exclude expired open bounties
    if (status === 'open') {
      conditions.push(or(
        sql`${intelBounties.expiresAt} IS NULL`,
        sql`${intelBounties.expiresAt} > NOW()`
      ));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sort
    if (sort === 'recent') {
      query = query.orderBy(desc(intelBounties.createdAt));
    } else if (sort === 'reward') {
      query = query.orderBy(desc(intelBounties.rewardUsdc));
    } else if (sort === 'expiring') {
      query = query.orderBy(intelBounties.expiresAt);
    }
    
    query = query.limit(parseInt(limit)).offset(parseInt(offset));
    
    const results = await query;
    
    return c.json({
      success: true,
      data: results,
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: results.length,
      }
    });
  } catch (error) {
    console.error('List bounties error:', error);
    return c.json({ success: false, error: 'Failed to list bounties' }, 500);
  }
});

// ============================================
// Get Single Bounty
// ============================================

bounties.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const [bounty] = await db.select({
      id: intelBounties.id,
      title: intelBounties.title,
      description: intelBounties.description,
      domains: intelBounties.domains,
      regions: intelBounties.regions,
      rewardUsdc: intelBounties.rewardUsdc,
      minSourceReputation: intelBounties.minSourceReputation,
      status: intelBounties.status,
      expiresAt: intelBounties.expiresAt,
      createdAt: intelBounties.createdAt,
      fulfilledByCodename: humintSources.codename,
    })
    .from(intelBounties)
    .leftJoin(humintSources, eq(intelBounties.fulfilledBy, humintSources.id))
    .where(eq(intelBounties.id, id))
    .limit(1);
    
    if (!bounty) {
      return c.json({ success: false, error: 'Bounty not found' }, 404);
    }
    
    return c.json({ success: true, data: bounty });
  } catch (error) {
    console.error('Get bounty error:', error);
    return c.json({ success: false, error: 'Failed to get bounty' }, 500);
  }
});

// ============================================
// Create Bounty (Authenticated)
// ============================================

bounties.post('/', async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    
    const body = await c.req.json();
    const {
      title,
      description,
      domains,
      regions,
      rewardUsdc,
      minSourceReputation = 50,
      expiresAt,
      anonymous = false // If true, creator is not stored
    } = body;
    
    // Validation
    if (!title || !description || !rewardUsdc) {
      return c.json({ success: false, error: 'Title, description, and reward are required' }, 400);
    }
    
    if (rewardUsdc < 1) {
      return c.json({ success: false, error: 'Minimum reward is 1 USDC' }, 400);
    }
    
    if (minSourceReputation < 0 || minSourceReputation > 100) {
      return c.json({ success: false, error: 'Reputation must be 0-100' }, 400);
    }
    
    // TODO: Escrow payment verification
    // For now, bounties are created without payment escrow
    // Full implementation requires NEAR contract integration
    
    const [bounty] = await db.insert(intelBounties)
      .values({
        creatorId: anonymous ? null : user.id, // Null for anonymous bounties
        title,
        description,
        domains: domains?.map((d: string) => d.toLowerCase()) || [],
        regions: regions?.map((r: string) => r.toLowerCase()) || [],
        rewardUsdc,
        minSourceReputation,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: 'open',
      })
      .returning();
    
    console.log('Bounty created:', { 
      id: bounty.id, 
      title: bounty.title, 
      reward: bounty.rewardUsdc,
      anonymous: anonymous 
    });
    
    return c.json({
      success: true,
      data: bounty
    });
  } catch (error) {
    console.error('Create bounty error:', error);
    return c.json({ success: false, error: 'Failed to create bounty' }, 500);
  }
});

// ============================================
// Cancel Bounty (Creator Only)
// ============================================

bounties.post('/:id/cancel', async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    
    const { id } = c.req.param();
    
    // Get bounty
    const [bounty] = await db.select()
      .from(intelBounties)
      .where(eq(intelBounties.id, id))
      .limit(1);
    
    if (!bounty) {
      return c.json({ success: false, error: 'Bounty not found' }, 404);
    }
    
    // Check ownership (only non-anonymous bounties can be cancelled by creator)
    if (bounty.creatorId !== user.id) {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }
    
    // Can only cancel open, unclaimed bounties
    if (bounty.status !== 'open') {
      return c.json({ success: false, error: 'Can only cancel open bounties' }, 400);
    }
    
    // Update status
    const [updated] = await db.update(intelBounties)
      .set({ status: 'cancelled' })
      .where(eq(intelBounties.id, id))
      .returning();
    
    // TODO: Return escrowed funds
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Cancel bounty error:', error);
    return c.json({ success: false, error: 'Failed to cancel bounty' }, 500);
  }
});

// ============================================
// Claim Bounty (HUMINT Source Only)
// ============================================
// DISABLED until wallet auth is integrated

bounties.post('/:id/claim', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Claiming bounties requires wallet signature verification. This feature is not yet available.',
    code: 'AUTH_NOT_CONFIGURED'
  }, 503);
});

// ============================================
// Fulfill Bounty (HUMINT Source Only)
// ============================================
// DISABLED until wallet auth is integrated

bounties.post('/:id/fulfill', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Fulfilling bounties requires wallet signature verification. This feature is not yet available.',
    code: 'AUTH_NOT_CONFIGURED'
  }, 503);
});

// ============================================
// Stats
// ============================================

bounties.get('/stats/summary', async (c) => {
  try {
    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      claimed: sql<number>`count(*) filter (where status = 'claimed')::int`,
      paid: sql<number>`count(*) filter (where status = 'paid')::int`,
      totalRewardOpen: sql<number>`coalesce(sum(reward_usdc) filter (where status = 'open'), 0)::numeric`,
      avgReward: sql<number>`coalesce(avg(reward_usdc), 0)::numeric`,
    })
    .from(intelBounties);
    
    return c.json({
      success: true,
      data: {
        total: stats?.total || 0,
        open: stats?.open || 0,
        claimed: stats?.claimed || 0,
        paid: stats?.paid || 0,
        totalRewardOpen: parseFloat(String(stats?.totalRewardOpen || 0)),
        avgReward: parseFloat(String(stats?.avgReward || 0)).toFixed(2),
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ success: false, error: 'Failed to get stats' }, 500);
  }
});

export default bounties;

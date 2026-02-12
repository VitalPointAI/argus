// Intel Bounties API Routes
// Allows users to post requests for specific intelligence with rewards
// Implements Option 2 safeguards: category allowlist, keyword blocklist, legal attestation, admin review

import { Hono } from 'hono';
import { db } from '../db';
import { intelBounties, humintSources, humintSubmissions, users, bountyCategories, bountyBlockedKeywords, notifications } from '../db/schema';
import { eq, desc, sql, and, gte, or, ilike, inArray } from 'drizzle-orm';
import { reviewBountyRequest, generateProofRequirements } from '../services/compliance/ai-compliance-agent';
import { notifyComplianceIssue, notifyComplianceApproved } from '../services/notifications';

const bounties = new Hono();

// Helper to get authenticated user from context
function getUser(c: any): { id: string; isAdmin?: boolean } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string; isAdmin?: boolean } : null;
}

// Check text against blocked keywords
async function checkBlockedKeywords(text: string): Promise<{ blocked: boolean; keyword?: string; reason?: string }> {
  const keywords = await db.select().from(bountyBlockedKeywords);
  const lowerText = text.toLowerCase();
  
  for (const kw of keywords) {
    // Support regex patterns (e.g., "where does .* live")
    try {
      const regex = new RegExp(kw.keyword.toLowerCase(), 'i');
      if (regex.test(lowerText)) {
        return { blocked: true, keyword: kw.keyword, reason: kw.reason || 'Prohibited content' };
      }
    } catch {
      // Fallback to simple includes for non-regex keywords
      if (lowerText.includes(kw.keyword.toLowerCase())) {
        return { blocked: true, keyword: kw.keyword, reason: kw.reason || 'Prohibited content' };
      }
    }
  }
  
  return { blocked: false };
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
      category,
      minReward,
      maxReward,
      sort = 'recent',
      limit = '20',
      offset = '0',
      includeUnreviewed = 'false' // Admin only
    } = c.req.query();
    
    const user = getUser(c);
    
    let query = db.select({
      id: intelBounties.id,
      title: intelBounties.title,
      description: intelBounties.description,
      domains: intelBounties.domains,
      regions: intelBounties.regions,
      category: intelBounties.category,
      rewardUsdc: intelBounties.rewardUsdc,
      minSourceReputation: intelBounties.minSourceReputation,
      status: intelBounties.status,
      reviewStatus: intelBounties.reviewStatus,
      expiresAt: intelBounties.expiresAt,
      createdAt: intelBounties.createdAt,
      // Don't expose creator ID for anonymous bounties
    })
    .from(intelBounties)
    .$dynamic();
    
    const conditions = [];
    
    // IMPORTANT: Only show approved bounties to public
    // Admins can see all with includeUnreviewed=true
    if (includeUnreviewed !== 'true' || !user?.isAdmin) {
      conditions.push(inArray(intelBounties.reviewStatus, ['approved', 'auto_approved']));
    }
    
    // Status filter
    if (status && status !== 'all') {
      conditions.push(eq(intelBounties.status, status));
    }
    
    // Category filter
    if (category) {
      conditions.push(eq(intelBounties.category, category));
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
      anonymous = false,
      // NEW: Required for Option 2 safeguards
      intendedUse,
      category = 'general',
      legalAttestation = false // Must be true to proceed
    } = body;
    
    // Validation
    if (!title || !description || !rewardUsdc) {
      return c.json({ success: false, error: 'Title, description, and reward are required' }, 400);
    }
    
    // NEW: Require intended use statement
    if (!intendedUse || intendedUse.length < 20) {
      return c.json({ 
        success: false, 
        error: 'Please provide a detailed intended use statement (min 20 characters) explaining how you plan to use this intelligence' 
      }, 400);
    }
    
    // NEW: Require legal attestation
    if (!legalAttestation) {
      return c.json({ 
        success: false, 
        error: 'You must agree to the legal attestation that this request will not be used for harassment, stalking, or illegal purposes' 
      }, 400);
    }
    
    if (rewardUsdc < 1) {
      return c.json({ success: false, error: 'Minimum reward is 1 USDC' }, 400);
    }
    
    if (minSourceReputation < 0 || minSourceReputation > 100) {
      return c.json({ success: false, error: 'Reputation must be 0-100' }, 400);
    }
    
    // NEW: Validate category exists and is enabled
    const [categoryRecord] = await db.select()
      .from(bountyCategories)
      .where(and(eq(bountyCategories.name, category), eq(bountyCategories.enabled, true)))
      .limit(1);
    
    if (!categoryRecord) {
      return c.json({ success: false, error: 'Invalid or disabled category' }, 400);
    }
    
    // NEW: Check for blocked keywords in title, description, and intended use
    const fullText = `${title} ${description} ${intendedUse}`;
    const keywordCheck = await checkBlockedKeywords(fullText);
    
    if (keywordCheck.blocked) {
      console.log('Bounty rejected - blocked keyword:', {
        user: user.id,
        keyword: keywordCheck.keyword,
        reason: keywordCheck.reason,
        title: title.substring(0, 50)
      });
      
      return c.json({ 
        success: false, 
        error: `Request contains prohibited content: ${keywordCheck.reason}. Intel bounties cannot request personal information, locations of individuals, or content that could be used for harm.`,
        code: 'BLOCKED_CONTENT'
      }, 400);
    }
    
    // Run AI compliance review
    // First create the bounty in pending state
    const [bounty] = await db.insert(intelBounties)
      .values({
        creatorId: anonymous ? null : user.id,
        title,
        description,
        domains: domains?.map((d: string) => d.toLowerCase()) || [],
        regions: regions?.map((r: string) => r.toLowerCase()) || [],
        rewardUsdc,
        minSourceReputation,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: 'open',
        // NEW fields
        intendedUse,
        legalAttestationAt: new Date(),
        category,
        reviewStatus: 'pending', // Start as pending, AI will determine final status
      })
      .returning();
    
    console.log('Bounty created:', { 
      id: bounty.id, 
      title: bounty.title, 
      reward: bounty.rewardUsdc,
      category,
      anonymous
    });
    
    // Run AI compliance review
    try {
      const complianceResult = await reviewBountyRequest(bounty.id);
      
      if (complianceResult.status === 'rejected') {
        // Update bounty status
        await db.update(intelBounties)
          .set({ reviewStatus: 'rejected', rejectionReason: complianceResult.message })
          .where(eq(intelBounties.id, bounty.id));
        
        return c.json({
          success: false,
          error: 'Your request could not be approved',
          complianceMessage: complianceResult.message,
          issues: complianceResult.issues,
        }, 400);
      }
      
      if (complianceResult.status === 'needs_revision') {
        // Notify user
        if (!anonymous && user.id) {
          await notifyComplianceIssue(
            user.id, 
            'bounty_request', 
            title, 
            complianceResult.issues.map(i => i.description)
          );
        }
        
        return c.json({
          success: true,
          data: bounty,
          needsRevision: true,
          complianceMessage: complianceResult.message,
          issues: complianceResult.issues,
          reviewId: complianceResult.reviewId,
          message: 'Your bounty needs some adjustments before it can be published. Please review the issues and update your request.'
        });
      }
      
      // Approved! Update status based on category auto-approve rules
      const finalStatus = categoryRecord.autoApprove ? 'auto_approved' : 'approved';
      await db.update(intelBounties)
        .set({ reviewStatus: finalStatus })
        .where(eq(intelBounties.id, bounty.id));
      
      // Generate proof requirements for valid bounty submissions
      let proofRequirements;
      try {
        proofRequirements = await generateProofRequirements(bounty.id);
        console.log('Proof requirements generated:', { bountyId: bounty.id, count: proofRequirements.requirements.length });
      } catch (proofError) {
        console.error('Failed to generate proof requirements:', proofError);
        // Non-fatal - bounty can still be created
      }
      
      // Notify if applicable
      if (!anonymous && user.id) {
        await notifyComplianceApproved(user.id, 'bounty_request', title);
      }
      
      return c.json({
        success: true,
        data: { ...bounty, reviewStatus: finalStatus },
        proofRequirements: proofRequirements?.requirements || [],
        message: 'Your bounty has been approved and is now visible to sources!'
      });
      
    } catch (complianceError) {
      console.error('AI compliance review error:', complianceError);
      // If AI review fails, fall back to pending for manual review
      return c.json({
        success: true,
        data: bounty,
        message: 'Your bounty has been submitted for review. It will be visible to sources once approved.'
      });
    }
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
      pendingReview: sql<number>`count(*) filter (where review_status = 'pending')::int`,
      totalRewardOpen: sql<number>`coalesce(sum(reward_usdc) filter (where status = 'open' and review_status in ('approved', 'auto_approved')), 0)::numeric`,
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
        pendingReview: stats?.pendingReview || 0,
        totalRewardOpen: parseFloat(String(stats?.totalRewardOpen || 0)),
        avgReward: parseFloat(String(stats?.avgReward || 0)).toFixed(2),
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ success: false, error: 'Failed to get stats' }, 500);
  }
});

// ============================================
// Admin: List Categories
// ============================================

bounties.get('/categories', async (c) => {
  try {
    const categories = await db.select()
      .from(bountyCategories)
      .where(eq(bountyCategories.enabled, true))
      .orderBy(bountyCategories.name);
    
    return c.json({ success: true, data: categories });
  } catch (error) {
    console.error('List categories error:', error);
    return c.json({ success: false, error: 'Failed to list categories' }, 500);
  }
});

// ============================================
// Admin: Review Queue
// ============================================

bounties.get('/admin/review-queue', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const pending = await db.select({
      id: intelBounties.id,
      title: intelBounties.title,
      description: intelBounties.description,
      intendedUse: intelBounties.intendedUse,
      category: intelBounties.category,
      rewardUsdc: intelBounties.rewardUsdc,
      createdAt: intelBounties.createdAt,
      creatorId: intelBounties.creatorId,
    })
    .from(intelBounties)
    .where(eq(intelBounties.reviewStatus, 'pending'))
    .orderBy(intelBounties.createdAt);
    
    return c.json({ success: true, data: pending });
  } catch (error) {
    console.error('Review queue error:', error);
    return c.json({ success: false, error: 'Failed to get review queue' }, 500);
  }
});

// ============================================
// Admin: Approve Bounty
// ============================================

bounties.post('/:id/approve', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const { id } = c.req.param();
    
    const [bounty] = await db.select()
      .from(intelBounties)
      .where(eq(intelBounties.id, id))
      .limit(1);
    
    if (!bounty) {
      return c.json({ success: false, error: 'Bounty not found' }, 404);
    }
    
    if (bounty.reviewStatus !== 'pending') {
      return c.json({ success: false, error: 'Bounty is not pending review' }, 400);
    }
    
    const [updated] = await db.update(intelBounties)
      .set({
        reviewStatus: 'approved',
        reviewedBy: user.id,
        reviewedAt: new Date(),
      })
      .where(eq(intelBounties.id, id))
      .returning();
    
    console.log('Bounty approved:', { id, adminId: user.id });
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Approve bounty error:', error);
    return c.json({ success: false, error: 'Failed to approve bounty' }, 500);
  }
});

// ============================================
// Admin: Reject Bounty
// ============================================

bounties.post('/:id/reject', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const { id } = c.req.param();
    const body = await c.req.json();
    const { reason } = body;
    
    if (!reason) {
      return c.json({ success: false, error: 'Rejection reason is required' }, 400);
    }
    
    const [bounty] = await db.select()
      .from(intelBounties)
      .where(eq(intelBounties.id, id))
      .limit(1);
    
    if (!bounty) {
      return c.json({ success: false, error: 'Bounty not found' }, 404);
    }
    
    if (bounty.reviewStatus !== 'pending') {
      return c.json({ success: false, error: 'Bounty is not pending review' }, 400);
    }
    
    const [updated] = await db.update(intelBounties)
      .set({
        reviewStatus: 'rejected',
        rejectionReason: reason,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        status: 'cancelled', // Rejected bounties are effectively cancelled
      })
      .where(eq(intelBounties.id, id))
      .returning();
    
    console.log('Bounty rejected:', { id, adminId: user.id, reason });
    
    // TODO: Notify creator of rejection (if not anonymous)
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Reject bounty error:', error);
    return c.json({ success: false, error: 'Failed to reject bounty' }, 500);
  }
});

// ============================================
// Admin: Manage Blocked Keywords
// ============================================

bounties.get('/admin/blocked-keywords', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const keywords = await db.select().from(bountyBlockedKeywords).orderBy(bountyBlockedKeywords.keyword);
    return c.json({ success: true, data: keywords });
  } catch (error) {
    console.error('List blocked keywords error:', error);
    return c.json({ success: false, error: 'Failed to list blocked keywords' }, 500);
  }
});

bounties.post('/admin/blocked-keywords', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const body = await c.req.json();
    const { keyword, reason } = body;
    
    if (!keyword) {
      return c.json({ success: false, error: 'Keyword is required' }, 400);
    }
    
    const [added] = await db.insert(bountyBlockedKeywords)
      .values({ keyword: keyword.toLowerCase(), reason })
      .onConflictDoNothing()
      .returning();
    
    if (!added) {
      return c.json({ success: false, error: 'Keyword already exists' }, 400);
    }
    
    return c.json({ success: true, data: added });
  } catch (error) {
    console.error('Add blocked keyword error:', error);
    return c.json({ success: false, error: 'Failed to add blocked keyword' }, 500);
  }
});

bounties.delete('/admin/blocked-keywords/:id', async (c) => {
  try {
    const user = getUser(c);
    if (!user?.isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    
    const { id } = c.req.param();
    
    await db.delete(bountyBlockedKeywords).where(eq(bountyBlockedKeywords.id, id));
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete blocked keyword error:', error);
    return c.json({ success: false, error: 'Failed to delete blocked keyword' }, 500);
  }
});

export default bounties;

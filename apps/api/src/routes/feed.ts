// Source Feed Routes
// Intel submissions become feed items - available to subscribers

import { Hono } from 'hono';
import { db } from '../db';
import { 
  sourceFeedItems, 
  humintSources, 
  humintSubmissions,
  sourceSubscriptions,
  intelBounties,
  users 
} from '../db/schema';
import { eq, and, desc, inArray, or } from 'drizzle-orm';
import { reviewIntelSubmission, verifyProofSubmission } from '../services/compliance/ai-compliance-agent';
import { notifyBountyFulfilled, notifyNewFeedItem } from '../services/notifications';
import { zkProofSubmissions } from '../db/schema';

const feed = new Hono();

// Helper to get authenticated user from context
function getUser(c: any): { id: string; isAdmin?: boolean } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string; isAdmin?: boolean } : null;
}

// ============================================
// Publish to Feed (Source submits intel)
// ============================================

feed.post('/publish', async (c) => {
  try {
    // TODO: Authenticate via source passkey
    const body = await c.req.json();
    const { 
      sourceId, // Would come from authenticated source session
      title,
      body: content, // 'body' in schema, 'content' in API for clarity
      summary,
      locationRegion,
      eventTag,
      fulfillsBountyId,
      visibility = 'subscribers',
      // ZK Proofs for bounty fulfillment
      proofs = [] // Array of {requirementIndex, proofType, proofData, publicInputs}
    } = body;

    if (!sourceId || !title || !content) {
      return c.json({ success: false, error: 'Source ID, title, and content are required' }, 400);
    }

    // Verify source exists
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, sourceId))
      .limit(1);

    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }

    // If fulfilling a bounty, verify it exists and is open
    let bountyToFulfill = null;
    if (fulfillsBountyId) {
      const [bounty] = await db.select()
        .from(intelBounties)
        .where(and(
          eq(intelBounties.id, fulfillsBountyId),
          eq(intelBounties.status, 'open')
        ))
        .limit(1);

      if (!bounty) {
        return c.json({ success: false, error: 'Bounty not found or not open' }, 404);
      }
      
      bountyToFulfill = bounty;
      
      // Check if bounty has proof requirements
      const requirements = (bounty.proofRequirements as any[]) || [];
      const requiredProofs = requirements.filter(r => r.required);
      
      if (requiredProofs.length > 0 && (!proofs || proofs.length === 0)) {
        return c.json({
          success: false,
          error: 'This bounty requires proof submissions',
          proofRequirements: requirements,
          message: 'Please provide ZK proofs to verify your submission meets the bounty requirements.',
        }, 400);
      }
    }

    // Create the underlying submission record
    // Generate content hash and signature (placeholder for now)
    const contentHash = require('crypto').createHash('sha256').update(content).digest('hex');
    const signature = contentHash; // In production, this would be a proper signature
    
    const [submission] = await db.insert(humintSubmissions)
      .values({
        sourceId,
        title,
        body: content,
        locationRegion,
        eventTag,
        contentHash,
        signature,
        verificationStatus: 'pending',
      })
      .returning();

    // Run AI compliance review
    const complianceResult = await reviewIntelSubmission(submission.id);

    if (complianceResult.status === 'rejected') {
      // Update submission status
      await db.update(humintSubmissions)
        .set({ verificationStatus: 'rejected' })
        .where(eq(humintSubmissions.id, submission.id));

      return c.json({
        success: false,
        error: 'Content rejected by compliance review',
        complianceMessage: complianceResult.message,
        issues: complianceResult.issues,
      }, 400);
    }

    if (complianceResult.status === 'needs_revision') {
      // Update submission status
      await db.update(humintSubmissions)
        .set({ verificationStatus: 'needs_revision' })
        .where(eq(humintSubmissions.id, submission.id));

      return c.json({
        success: false,
        error: 'Content needs revision',
        complianceMessage: complianceResult.message,
        issues: complianceResult.issues,
        reviewId: complianceResult.reviewId,
      }, 400);
    }

    // Verify ZK proofs if fulfilling a bounty
    if (fulfillsBountyId && proofs && proofs.length > 0) {
      try {
        const proofVerification = await verifyProofSubmission(submission.id, fulfillsBountyId, proofs);
        
        if (!proofVerification.allVerified) {
          const failedProofs = proofVerification.results.filter(r => !r.verified);
          
          return c.json({
            success: false,
            error: 'Some proof verifications failed',
            proofResults: proofVerification.results,
            failedRequirements: failedProofs.map(f => ({
              index: f.requirementIndex,
              message: f.message,
            })),
          }, 400);
        }
        
        // Store verified proofs
        for (const proof of proofs) {
          const result = proofVerification.results.find(r => r.requirementIndex === proof.requirementIndex);
          await db.insert(zkProofSubmissions)
            .values({
              submissionId: submission.id,
              bountyId: fulfillsBountyId,
              sourceId,
              requirementIndex: proof.requirementIndex,
              proofType: proof.proofType,
              proofData: proof.proofData,
              publicInputs: proof.publicInputs,
              verificationStatus: result?.verified ? 'verified' : 'failed',
              verifiedAt: new Date(),
              verificationResult: result,
            });
        }
        
        console.log('ZK proofs verified:', { submissionId: submission.id, bountyId: fulfillsBountyId, count: proofs.length });
        
      } catch (proofError) {
        console.error('Proof verification error:', proofError);
        return c.json({
          success: false,
          error: 'Failed to verify proofs',
          details: String(proofError),
        }, 500);
      }
    }

    // Compliance approved - create feed item
    const contentPreview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    
    const [feedItem] = await db.insert(sourceFeedItems)
      .values({
        sourceId,
        submissionId: submission.id,
        title,
        summary: summary || contentPreview,
        contentPreview,
        fulfillsBountyId,
        visibility,
        complianceReviewId: complianceResult.reviewId,
      })
      .returning();

    // Update submission to verified/published
    await db.update(humintSubmissions)
      .set({ verificationStatus: 'verified' })
      .where(eq(humintSubmissions.id, submission.id));

    // Update source stats
    await db.update(humintSources)
      .set({
        totalSubmissions: source.totalSubmissions + 1,
        lastActiveAt: new Date(),
      })
      .where(eq(humintSources.id, sourceId));

    // If fulfilling a bounty, update bounty and notify poster
    if (fulfillsBountyId) {
      await db.update(intelBounties)
        .set({
          status: 'claimed',
          fulfilledBy: sourceId,
          fulfillmentSubmissionId: submission.id,
        })
        .where(eq(intelBounties.id, fulfillsBountyId));

      await notifyBountyFulfilled(fulfillsBountyId, source.codename, feedItem.id);
    }

    // Notify subscribers of new feed item
    const subscribers = await db.select({ userId: sourceSubscriptions.subscriberId })
      .from(sourceSubscriptions)
      .where(and(
        eq(sourceSubscriptions.sourceId, sourceId),
        eq(sourceSubscriptions.status, 'active'),
        eq(sourceSubscriptions.approvalStatus, 'approved')
      ));

    if (subscribers.length > 0) {
      await notifyNewFeedItem(
        subscribers.map(s => s.userId),
        source.codename,
        { id: feedItem.id, title, summary }
      );
    }

    return c.json({
      success: true,
      data: feedItem,
      message: fulfillsBountyId 
        ? 'Intel published and bounty fulfilled! The bounty poster has been notified.'
        : 'Intel published to your feed. Subscribers have been notified.',
    });
  } catch (error) {
    console.error('Publish to feed error:', error);
    return c.json({ success: false, error: 'Failed to publish' }, 500);
  }
});

// ============================================
// Get Feed Items (User - subscribed sources only)
// ============================================

feed.get('/', async (c) => {
  try {
    const user = getUser(c);
    const { sourceId, limit = '20', offset = '0' } = c.req.query();

    // Get user's subscribed sources
    let subscribedSourceIds: string[] = [];
    if (user) {
      const subs = await db.select({ sourceId: sourceSubscriptions.sourceId })
        .from(sourceSubscriptions)
        .where(and(
          eq(sourceSubscriptions.subscriberId, user.id),
          eq(sourceSubscriptions.status, 'active'),
          eq(sourceSubscriptions.approvalStatus, 'approved')
        ));
      subscribedSourceIds = subs.map(s => s.sourceId);
    }

    // Build query conditions
    let conditions = [];
    
    if (sourceId) {
      // Viewing specific source feed
      conditions.push(eq(sourceFeedItems.sourceId, sourceId));
      
      // Check if user has access
      const isSubscribed = subscribedSourceIds.includes(sourceId);
      if (!isSubscribed) {
        // Only show public items
        conditions.push(eq(sourceFeedItems.visibility, 'public'));
      }
    } else if (user && subscribedSourceIds.length > 0) {
      // Aggregated feed from subscribed sources
      conditions.push(inArray(sourceFeedItems.sourceId, subscribedSourceIds));
    } else {
      // No auth or no subscriptions - show public only
      conditions.push(eq(sourceFeedItems.visibility, 'public'));
    }

    const items = await db.select({
      feedItem: sourceFeedItems,
      source: {
        codename: humintSources.codename,
        reputationScore: humintSources.reputationScore,
      },
      bounty: {
        id: intelBounties.id,
        title: intelBounties.title,
        rewardUsdc: intelBounties.rewardUsdc,
      },
    })
    .from(sourceFeedItems)
    .leftJoin(humintSources, eq(sourceFeedItems.sourceId, humintSources.id))
    .leftJoin(intelBounties, eq(sourceFeedItems.fulfillsBountyId, intelBounties.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sourceFeedItems.publishedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

    // Determine what content to show based on subscription status
    const result = items.map(item => {
      const isSubscribed = subscribedSourceIds.includes(item.feedItem.sourceId);
      const isPublic = item.feedItem.visibility === 'public';
      
      return {
        id: item.feedItem.id,
        title: item.feedItem.title,
        summary: item.feedItem.summary,
        // Only show full preview to subscribers (or public items)
        contentPreview: (isSubscribed || isPublic) 
          ? item.feedItem.contentPreview 
          : item.feedItem.summary?.substring(0, 100) + '...',
        publishedAt: item.feedItem.publishedAt,
        visibility: item.feedItem.visibility,
        viewCount: item.feedItem.viewCount,
        source: item.source,
        fulfilledBounty: item.bounty?.id ? {
          id: item.bounty.id,
          title: item.bounty.title,
          reward: item.bounty.rewardUsdc,
        } : null,
        hasFullAccess: isSubscribed || isPublic,
      };
    });

    return c.json({
      success: true,
      data: result,
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: result.length,
        subscribedSources: subscribedSourceIds.length,
      },
    });
  } catch (error) {
    console.error('Get feed error:', error);
    return c.json({ success: false, error: 'Failed to get feed' }, 500);
  }
});

// ============================================
// Get Single Feed Item
// ============================================

feed.get('/:id', async (c) => {
  try {
    const user = getUser(c);
    const { id } = c.req.param();

    const [item] = await db.select({
      feedItem: sourceFeedItems,
      source: humintSources,
      submission: humintSubmissions,
      bounty: intelBounties,
    })
    .from(sourceFeedItems)
    .leftJoin(humintSources, eq(sourceFeedItems.sourceId, humintSources.id))
    .leftJoin(humintSubmissions, eq(sourceFeedItems.submissionId, humintSubmissions.id))
    .leftJoin(intelBounties, eq(sourceFeedItems.fulfillsBountyId, intelBounties.id))
    .where(eq(sourceFeedItems.id, id))
    .limit(1);

    if (!item) {
      return c.json({ success: false, error: 'Feed item not found' }, 404);
    }

    // Check access
    let hasAccess = item.feedItem.visibility === 'public';
    
    if (user && !hasAccess) {
      const [subscription] = await db.select()
        .from(sourceSubscriptions)
        .where(and(
          eq(sourceSubscriptions.sourceId, item.feedItem.sourceId),
          eq(sourceSubscriptions.subscriberId, user.id),
          eq(sourceSubscriptions.status, 'active'),
          eq(sourceSubscriptions.approvalStatus, 'approved')
        ))
        .limit(1);
      
      hasAccess = !!subscription;
    }

    // Increment view count
    await db.update(sourceFeedItems)
      .set({ viewCount: item.feedItem.viewCount + 1 })
      .where(eq(sourceFeedItems.id, id));

    return c.json({
      success: true,
      data: {
        id: item.feedItem.id,
        title: item.feedItem.title,
        summary: item.feedItem.summary,
        // Only show full content to authorized users
        content: hasAccess ? item.submission?.body : null,
        contentPreview: item.feedItem.contentPreview,
        publishedAt: item.feedItem.publishedAt,
        visibility: item.feedItem.visibility,
        viewCount: item.feedItem.viewCount + 1,
        source: {
          codename: item.source?.codename,
          reputationScore: item.source?.reputationScore,
          bio: item.source?.bio,
          domains: item.source?.domains,
          regions: item.source?.regions,
        },
        submission: hasAccess ? {
          region: item.submission?.locationRegion,
          eventType: item.submission?.eventTag,
          verificationStatus: item.submission?.verificationStatus,
        } : null,
        fulfilledBounty: item.bounty ? {
          id: item.bounty.id,
          title: item.bounty.title,
          reward: item.bounty.rewardUsdc,
        } : null,
        hasFullAccess: hasAccess,
      },
    });
  } catch (error) {
    console.error('Get feed item error:', error);
    return c.json({ success: false, error: 'Failed to get feed item' }, 500);
  }
});

// ============================================
// Source's Own Feed (for source dashboard)
// ============================================

feed.get('/source/:sourceId', async (c) => {
  try {
    // TODO: Verify caller owns this source
    const { sourceId } = c.req.param();
    const { limit = '20', offset = '0' } = c.req.query();

    const items = await db.select({
      feedItem: sourceFeedItems,
      bounty: {
        id: intelBounties.id,
        title: intelBounties.title,
        rewardUsdc: intelBounties.rewardUsdc,
        status: intelBounties.status,
      },
    })
    .from(sourceFeedItems)
    .leftJoin(intelBounties, eq(sourceFeedItems.fulfillsBountyId, intelBounties.id))
    .where(eq(sourceFeedItems.sourceId, sourceId))
    .orderBy(desc(sourceFeedItems.publishedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

    return c.json({
      success: true,
      data: items.map(i => ({
        ...i.feedItem,
        bounty: i.bounty?.id ? i.bounty : null,
      })),
    });
  } catch (error) {
    console.error('Get source feed error:', error);
    return c.json({ success: false, error: 'Failed to get source feed' }, 500);
  }
});

export default feed;

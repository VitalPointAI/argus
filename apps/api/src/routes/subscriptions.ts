// Subscription Management Routes
// Handles subscriber approval workflow and feed access

import { Hono } from 'hono';
import { db } from '../db';
import { 
  sourceSubscriptions, 
  humintSources, 
  users, 
  subscriberReputation,
  notifications 
} from '../db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { 
  notifySubscriptionApproved, 
  notifySubscriptionRejected,
  notifySubscriptionRequest 
} from '../services/notifications';

const subscriptions = new Hono();

// Helper to get authenticated user from context
function getUser(c: any): { id: string; isAdmin?: boolean } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string; isAdmin?: boolean } : null;
}

// ============================================
// Request Subscription (User)
// ============================================

subscriptions.post('/request', async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { sourceId, message } = body;

    if (!sourceId) {
      return c.json({ success: false, error: 'Source ID is required' }, 400);
    }

    // Get source
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, sourceId))
      .limit(1);

    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }

    if (!source.isAcceptingSubscribers) {
      return c.json({ success: false, error: 'This source is not accepting new subscribers' }, 400);
    }

    // Check for existing subscription
    const [existing] = await db.select()
      .from(sourceSubscriptions)
      .where(and(
        eq(sourceSubscriptions.sourceId, sourceId),
        eq(sourceSubscriptions.subscriberId, user.id)
      ))
      .limit(1);

    if (existing) {
      if (existing.approvalStatus === 'pending') {
        return c.json({ success: false, error: 'You already have a pending subscription request' }, 400);
      }
      if (existing.approvalStatus === 'approved' && existing.status === 'active') {
        return c.json({ success: false, error: 'You are already subscribed to this source' }, 400);
      }
    }

    // Get subscriber reputation
    const [reputation] = await db.select()
      .from(subscriberReputation)
      .where(eq(subscriberReputation.userId, user.id))
      .limit(1);

    const repScore = reputation?.reputationScore || 10;

    // Check minimum reputation requirement
    if (source.minSubscriberReputation && repScore < source.minSubscriberReputation) {
      return c.json({ 
        success: false, 
        error: `This source requires a minimum reputation of ${source.minSubscriberReputation}. Your current reputation is ${repScore}.`,
        code: 'INSUFFICIENT_REPUTATION'
      }, 400);
    }

    // Determine if auto-approve
    const autoApprove = !source.requireApproval || 
      (source.autoApproveAboveReputation && repScore >= source.autoApproveAboveReputation);

    // Create subscription
    const [subscription] = await db.insert(sourceSubscriptions)
      .values({
        sourceId,
        subscriberId: user.id,
        approvalStatus: autoApprove ? 'approved' : 'pending',
        approvalRequestedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
        subscriberMessage: message,
        startsAt: autoApprove ? new Date() : new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        status: autoApprove ? 'active' : 'pending',
      })
      .returning();

    // Notify source of new request (if not auto-approved)
    if (!autoApprove) {
      await notifySubscriptionRequest(sourceId, user.id, message);
    }

    return c.json({
      success: true,
      data: subscription,
      autoApproved: autoApprove,
      message: autoApprove 
        ? 'Your subscription has been approved! You now have access to this source\'s feed.'
        : 'Your subscription request has been submitted. The source will review your request.',
    });
  } catch (error) {
    console.error('Request subscription error:', error);
    return c.json({ success: false, error: 'Failed to request subscription' }, 500);
  }
});

// ============================================
// List Pending Requests (Source)
// ============================================

subscriptions.get('/pending/:sourceId', async (c) => {
  try {
    // TODO: Verify caller owns this source (via passkey/codename)
    const { sourceId } = c.req.param();

    const pending = await db.select({
      subscription: sourceSubscriptions,
      subscriber: {
        id: users.id,
        email: users.email,
      },
      reputation: subscriberReputation,
    })
    .from(sourceSubscriptions)
    .leftJoin(users, eq(sourceSubscriptions.subscriberId, users.id))
    .leftJoin(subscriberReputation, eq(sourceSubscriptions.subscriberId, subscriberReputation.userId))
    .where(and(
      eq(sourceSubscriptions.sourceId, sourceId),
      eq(sourceSubscriptions.approvalStatus, 'pending')
    ))
    .orderBy(sourceSubscriptions.approvalRequestedAt);

    return c.json({
      success: true,
      data: pending.map(p => ({
        subscriptionId: p.subscription.id,
        subscriberMessage: p.subscription.subscriberMessage,
        requestedAt: p.subscription.approvalRequestedAt,
        subscriber: {
          id: p.subscriber?.id,
          email: p.subscriber?.email,
        },
        reputation: {
          score: p.reputation?.reputationScore || 10,
          accountAgeDays: p.reputation?.accountAgeDays || 0,
          bountiesPosted: p.reputation?.bountiesPosted || 0,
          subscriptionsCount: p.reputation?.subscriptionsCount || 0,
          reportsAgainst: p.reputation?.reportsAgainst || 0,
        },
      })),
    });
  } catch (error) {
    console.error('List pending subscriptions error:', error);
    return c.json({ success: false, error: 'Failed to list pending subscriptions' }, 500);
  }
});

// ============================================
// Approve Subscription (Source)
// ============================================

subscriptions.post('/:subscriptionId/approve', async (c) => {
  try {
    // TODO: Verify caller owns the source
    const { subscriptionId } = c.req.param();

    const [subscription] = await db.select()
      .from(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return c.json({ success: false, error: 'Subscription not found' }, 404);
    }

    if (subscription.approvalStatus !== 'pending') {
      return c.json({ success: false, error: 'Subscription is not pending approval' }, 400);
    }

    const [updated] = await db.update(sourceSubscriptions)
      .set({
        approvalStatus: 'approved',
        approvedAt: new Date(),
        status: 'active',
        startsAt: new Date(),
      })
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .returning();

    // Get source codename for notification
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, subscription.sourceId))
      .limit(1);

    // Notify subscriber
    await notifySubscriptionApproved(subscription.subscriberId, source?.codename || 'Unknown');

    // Update source subscriber count
    await db.update(humintSources)
      .set({ subscriberCount: (source?.subscriberCount || 0) + 1 })
      .where(eq(humintSources.id, subscription.sourceId));

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Approve subscription error:', error);
    return c.json({ success: false, error: 'Failed to approve subscription' }, 500);
  }
});

// ============================================
// Reject Subscription (Source)
// ============================================

subscriptions.post('/:subscriptionId/reject', async (c) => {
  try {
    const { subscriptionId } = c.req.param();
    const body = await c.req.json();
    const { reason } = body;

    const [subscription] = await db.select()
      .from(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return c.json({ success: false, error: 'Subscription not found' }, 404);
    }

    if (subscription.approvalStatus !== 'pending') {
      return c.json({ success: false, error: 'Subscription is not pending approval' }, 400);
    }

    const [updated] = await db.update(sourceSubscriptions)
      .set({
        approvalStatus: 'rejected',
        rejectionReason: reason,
        status: 'cancelled',
      })
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .returning();

    // Get source codename
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, subscription.sourceId))
      .limit(1);

    // Notify subscriber
    await notifySubscriptionRejected(subscription.subscriberId, source?.codename || 'Unknown', reason);

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Reject subscription error:', error);
    return c.json({ success: false, error: 'Failed to reject subscription' }, 500);
  }
});

// ============================================
// Revoke Subscription (Source)
// ============================================

subscriptions.post('/:subscriptionId/revoke', async (c) => {
  try {
    const { subscriptionId } = c.req.param();
    const body = await c.req.json();
    const { reason } = body;

    const [subscription] = await db.select()
      .from(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return c.json({ success: false, error: 'Subscription not found' }, 404);
    }

    if (subscription.status !== 'active') {
      return c.json({ success: false, error: 'Subscription is not active' }, 400);
    }

    const [updated] = await db.update(sourceSubscriptions)
      .set({
        status: 'revoked',
        rejectionReason: reason,
      })
      .where(eq(sourceSubscriptions.id, subscriptionId))
      .returning();

    // Update subscriber reputation (increment revoked count)
    await db.update(subscriberReputation)
      .set({ 
        subscriptionsRevoked: (await db.select().from(subscriberReputation).where(eq(subscriberReputation.userId, subscription.subscriberId)))[0]?.subscriptionsRevoked + 1 || 1
      })
      .where(eq(subscriberReputation.userId, subscription.subscriberId));

    // Decrease source subscriber count
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, subscription.sourceId))
      .limit(1);

    await db.update(humintSources)
      .set({ subscriberCount: Math.max(0, (source?.subscriberCount || 1) - 1) })
      .where(eq(humintSources.id, subscription.sourceId));

    return c.json({ success: true, data: updated, message: 'Subscription revoked' });
  } catch (error) {
    console.error('Revoke subscription error:', error);
    return c.json({ success: false, error: 'Failed to revoke subscription' }, 500);
  }
});

// ============================================
// List My Subscriptions (User)
// ============================================

subscriptions.get('/my', async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const subs = await db.select({
      subscription: sourceSubscriptions,
      source: {
        id: humintSources.id,
        codename: humintSources.codename,
        bio: humintSources.bio,
        domains: humintSources.domains,
        regions: humintSources.regions,
        reputationScore: humintSources.reputationScore,
      },
    })
    .from(sourceSubscriptions)
    .leftJoin(humintSources, eq(sourceSubscriptions.sourceId, humintSources.id))
    .where(eq(sourceSubscriptions.subscriberId, user.id))
    .orderBy(desc(sourceSubscriptions.createdAt));

    return c.json({
      success: true,
      data: subs.map(s => ({
        ...s.subscription,
        source: s.source,
      })),
    });
  } catch (error) {
    console.error('List my subscriptions error:', error);
    return c.json({ success: false, error: 'Failed to list subscriptions' }, 500);
  }
});

// ============================================
// Update Source Settings (Source)
// ============================================

subscriptions.patch('/settings/:sourceId', async (c) => {
  try {
    // TODO: Verify caller owns this source
    const { sourceId } = c.req.param();
    const body = await c.req.json();
    const { 
      minSubscriberReputation,
      requireApproval,
      autoApproveAboveReputation,
      isAcceptingSubscribers 
    } = body;

    const updateData: Record<string, any> = {};
    if (minSubscriberReputation !== undefined) updateData.minSubscriberReputation = minSubscriberReputation;
    if (requireApproval !== undefined) updateData.requireApproval = requireApproval;
    if (autoApproveAboveReputation !== undefined) updateData.autoApproveAboveReputation = autoApproveAboveReputation;
    if (isAcceptingSubscribers !== undefined) updateData.isAcceptingSubscribers = isAcceptingSubscribers;

    const [updated] = await db.update(humintSources)
      .set(updateData)
      .where(eq(humintSources.id, sourceId))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update source settings error:', error);
    return c.json({ success: false, error: 'Failed to update settings' }, 500);
  }
});

export default subscriptions;

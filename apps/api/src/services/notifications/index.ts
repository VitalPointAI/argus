// Notification Service
// Handles in-app notifications and optional email delivery

import { db } from '../../db';
import { notifications, users, intelBounties, humintSources, sourceFeedItems } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
  deliverEmail?: boolean;
}

export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const { userId, type, title, body, data, deliverEmail = false } = params;
  
  const [notification] = await db.insert(notifications)
    .values({
      userId,
      type,
      title,
      body,
      data,
      deliveredVia: ['in_app'],
    })
    .returning();

  // TODO: Email delivery if requested
  if (deliverEmail) {
    // Queue email notification
    console.log('Email notification queued:', { userId, type, title });
  }

  return notification.id;
}

// ============================================
// Notification Types
// ============================================

export async function notifyBountyFulfilled(
  bountyId: string,
  sourceCodename: string,
  feedItemId: string
): Promise<void> {
  // Get bounty and creator
  const [bounty] = await db.select()
    .from(intelBounties)
    .where(eq(intelBounties.id, bountyId))
    .limit(1);

  if (!bounty || !bounty.creatorId) return;

  await createNotification({
    userId: bounty.creatorId,
    type: 'bounty_fulfilled',
    title: '🎯 Your intel bounty was fulfilled!',
    body: `"${bounty.title}" has been fulfilled by ${sourceCodename}. The intel is now available in their feed.`,
    data: {
      bountyId,
      feedItemId,
      sourceCodename,
    },
    deliverEmail: true,
  });
}

export async function notifySubscriptionRequest(
  sourceId: string,
  subscriberUserId: string,
  subscriberMessage?: string
): Promise<void> {
  // Get source owner (HUMINT sources don't have a direct user link in current schema)
  // For now, we'll create a notification for the source's feed
  // This would need the source to have a linked user account
  
  const [source] = await db.select()
    .from(humintSources)
    .where(eq(humintSources.id, sourceId))
    .limit(1);

  if (!source) return;

  // TODO: Link HUMINT sources to user accounts or have separate notification channel
  console.log('Subscription request notification:', {
    sourceCodename: source.codename,
    subscriberUserId,
    message: subscriberMessage,
  });
}

export async function notifySubscriptionApproved(
  userId: string,
  sourceCodename: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'subscription_approved',
    title: '✅ Subscription approved!',
    body: `${sourceCodename} has approved your subscription request. You now have access to their intel feed.`,
    data: { sourceCodename },
  });
}

export async function notifySubscriptionRejected(
  userId: string,
  sourceCodename: string,
  reason?: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'subscription_rejected',
    title: '❌ Subscription request declined',
    body: reason 
      ? `${sourceCodename} declined your subscription request: ${reason}`
      : `${sourceCodename} declined your subscription request.`,
    data: { sourceCodename, reason },
  });
}

export async function notifyNewFeedItem(
  subscriberUserIds: string[],
  sourceCodename: string,
  feedItem: {
    id: string;
    title: string;
    summary?: string;
  }
): Promise<void> {
  for (const userId of subscriberUserIds) {
    await createNotification({
      userId,
      type: 'new_feed_item',
      title: `📰 New intel from ${sourceCodename}`,
      body: feedItem.title,
      data: {
        feedItemId: feedItem.id,
        sourceCodename,
        summary: feedItem.summary,
      },
    });
  }
}

export async function notifyComplianceIssue(
  userId: string,
  contentType: 'bounty_request' | 'intel_submission',
  title: string,
  issues: string[]
): Promise<void> {
  await createNotification({
    userId,
    type: 'compliance_issue',
    title: '⚠️ Content needs revision',
    body: `Your ${contentType === 'bounty_request' ? 'bounty request' : 'intel submission'} "${title}" requires changes before it can be published.`,
    data: {
      contentType,
      issues,
    },
    deliverEmail: true,
  });
}

export async function notifyComplianceApproved(
  userId: string,
  contentType: 'bounty_request' | 'intel_submission',
  title: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'compliance_approved',
    title: '✅ Content approved',
    body: `Your ${contentType === 'bounty_request' ? 'bounty request' : 'intel submission'} "${title}" has been approved and is now live.`,
    data: { contentType },
  });
}

// ============================================
// Get Notifications
// ============================================

export async function getUserNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<typeof notifications.$inferSelect[]> {
  const { unreadOnly = false, limit = 20, offset = 0 } = options;

  let query = db.select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(notifications.createdAt)
    .limit(limit)
    .offset(offset);

  // Note: Can't easily add dynamic where clause with current drizzle setup
  // Would need to use $dynamic() or build query differently
  
  return await query;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await db.update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(eq(notifications.id, notificationId));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(eq(notifications.userId, userId));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db.select()
    .from(notifications)
    .where(eq(notifications.userId, userId));
  
  return result.filter(n => !n.read).length;
}

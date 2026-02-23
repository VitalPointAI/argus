/**
 * Briefing Cron Processor
 * 
 * Endpoint to be called by external cron (e.g., GitHub Actions, cron job)
 * to process scheduled briefing profiles.
 * 
 * Supports delivery via: Web, Telegram, Email, Webhook (multiple)
 */

import { Hono } from 'hono';
import { db, briefingProfiles, briefings, users, sourceListItems } from '../db';
import { eq, sql, inArray } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../services/intelligence/executive-briefing';
import * as crypto from 'crypto';

// Simple auth for cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || process.env.BRIEFING_CRON_SECRET;

export const briefingCronRoutes = new Hono();

// Individual webhook configuration
interface WebhookConfig {
  id: string;           // UUID for identification
  name: string;         // User-friendly name (e.g., "Teams - Security", "Slack - Alerts")
  url: string;          // Webhook URL
  secret?: string;      // Optional HMAC secret
  enabled: boolean;     // Toggle individual webhooks
}

interface ProfileSchedule {
  enabled?: boolean;
  times?: string[];
  timezone?: string;
  days?: string[];
  channels?: string[];
  // Multiple webhooks support
  webhooks?: WebhookConfig[];
  webhooksEnabled?: boolean; // Master toggle to disable all webhooks
  // Legacy single webhook (backwards compatibility)
  webhookUrl?: string;
  webhookSecret?: string;
}

interface ProfileFilterConfig {
  topics?: string[];
  excludeTopics?: string[];
  domains?: string[];
  excludeDomains?: string[];
  topicQuery?: string;
  sourceListIds?: string[]; // Multiple source lists (OR logic)
}

interface ProfileSettings {
  format?: 'executive' | 'summary';
  hoursBack?: number;
  minConfidence?: number;
  maxArticles?: number;
  includeTTS?: boolean;
}

interface WebhookPayload {
  type: 'briefing';
  profileId: string;
  profileName: string;
  briefingId: string;
  title: string;
  content: string;
  summary: string;
  generatedAt: string;
  articleCount?: number;
  filterConfig?: ProfileFilterConfig;
}

interface WebhookResult {
  name: string;
  url: string;
  success: boolean;
  error?: string;
  statusCode?: number;
}

// Map day abbreviations to JS day numbers (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
};

/**
 * Send briefing to a single webhook URL
 * Automatically detects Teams webhooks and formats as Adaptive Card
 */
async function sendWebhookBriefing(
  webhookUrl: string,
  payload: WebhookPayload,
  secret?: string
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    // Detect webhook type
    const isDirectTeamsWebhook = webhookUrl.includes('webhook.office.com');
    const isPowerAutomate = webhookUrl.includes('.logic.azure.com') || 
                            webhookUrl.includes('powerplatform.com') ||
                            webhookUrl.includes('flow.microsoft.com') || 
                            webhookUrl.includes('prod-') && webhookUrl.includes('.azure.com');
    const isMicrosoftWebhook = isDirectTeamsWebhook || isPowerAutomate;
    
    let body: string;
    
    if (isMicrosoftWebhook) {
      // Build Adaptive Card content
      const briefingContent = (payload.content || '').substring(0, 2000);
      const adaptiveCardContent = {
        type: 'AdaptiveCard',
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            text: payload.title || payload.profileName,
            wrap: true
          },
          {
            type: 'TextBlock',
            text: `Profile: ${payload.profileName} | ${payload.generatedAt}`,
            size: 'Small',
            isSubtle: true,
            wrap: true
          },
          {
            type: 'TextBlock',
            text: briefingContent,
            wrap: true
          }
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Full Briefing',
            url: `https://argus.vitalpoint.ai/briefings/${payload.briefingId}`
          }
        ]
      };
      
      if (isPowerAutomate) {
        // Power Automate / Logic Apps expects just the card
        body = JSON.stringify(adaptiveCardContent);
        console.log(`[Webhook] Using Power Automate format (raw adaptive card)`);
      } else {
        // Direct Teams webhook expects message wrapper
        body = JSON.stringify({
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: adaptiveCardContent
            }
          ]
        });
        console.log(`[Webhook] Using direct Teams webhook format (message wrapper)`);
      }
    } else {
      // Generic JSON webhook
      body = JSON.stringify(payload);
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Argus-Briefing/1.0',
    };
    
    // Add HMAC signature if secret provided (for non-Microsoft webhooks)
    if (secret && !isMicrosoftWebhook) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Argus-Signature'] = `sha256=${signature}`;
    }
    
    console.log(`[Webhook] Sending to ${webhookUrl.substring(0, 60)}...`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
    });
    
    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      console.error(`[Webhook] Error response (${response.status}): ${responseText.substring(0, 500)}`);
      return {
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }
    
    console.log(`[Webhook] Delivered successfully (${response.status})`);
    return { success: true, statusCode: response.status };
    
  } catch (error) {
    console.error(`[Webhook] Failed to deliver:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


/**
 * Send briefing to all configured webhooks
 * Handles both new webhooks array and legacy single webhook
 */
async function sendToAllWebhooks(
  schedule: ProfileSchedule,
  payload: WebhookPayload
): Promise<{ results: WebhookResult[]; summary: string }> {
  // Check master toggle
  if (schedule.webhooksEnabled === false) {
    console.log('[Webhook] Webhooks disabled for this profile');
    return { results: [], summary: 'disabled' };
  }

  const results: WebhookResult[] = [];
  
  // Collect all webhooks to send to
  const webhooksToSend: Array<{ name: string; url: string; secret?: string }> = [];
  
  // New format: webhooks array
  if (schedule.webhooks?.length) {
    for (const wh of schedule.webhooks) {
      if (wh.enabled && wh.url) {
        webhooksToSend.push({ name: wh.name, url: wh.url, secret: wh.secret });
      }
    }
  }
  
  // Legacy format: single webhookUrl (backwards compatibility)
  if (schedule.webhookUrl && !schedule.webhooks?.length) {
    webhooksToSend.push({ 
      name: 'Default Webhook', 
      url: schedule.webhookUrl, 
      secret: schedule.webhookSecret 
    });
  }
  
  if (webhooksToSend.length === 0) {
    return { results: [], summary: 'not_configured' };
  }
  
  // Send to all webhooks in parallel
  const promises = webhooksToSend.map(async (wh) => {
    const result = await sendWebhookBriefing(wh.url, payload, wh.secret);
    return {
      name: wh.name,
      url: wh.url,
      success: result.success,
      error: result.error,
      statusCode: result.statusCode,
    };
  });
  
  const allResults = await Promise.all(promises);
  results.push(...allResults);
  
  // Generate summary
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  let summary: string;
  if (failed === 0) {
    summary = `delivered (${succeeded}/${results.length})`;
  } else if (succeeded === 0) {
    summary = `all_failed (0/${results.length})`;
  } else {
    summary = `partial (${succeeded}/${results.length})`;
  }
  
  return { results, summary };
}

/**
 * Get source IDs from multiple source lists
 */
async function getSourceIdsFromLists(sourceListIds: string[]): Promise<string[]> {
  if (!sourceListIds?.length) return [];
  
  const items = await db.select({ sourceId: sourceListItems.sourceId })
    .from(sourceListItems)
    .where(inArray(sourceListItems.sourceListId, sourceListIds));
  
  return [...new Set(items.map(i => i.sourceId))]; // Dedupe
}

/**
 * Check if current time matches a schedule
 */
function shouldRunNow(schedule: ProfileSchedule, nowUtc: Date): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.times?.length) return false;
  if (!schedule.days?.length) return false;
  
  // Convert to profile's timezone
  const tz = schedule.timezone || 'America/New_York';
  let localTime: Date;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(nowUtc);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
    localTime = new Date(
      parseInt(get('year')),
      parseInt(get('month')) - 1,
      parseInt(get('day')),
      parseInt(get('hour')),
      parseInt(get('minute'))
    );
  } catch {
    console.warn(`[Cron] Invalid timezone ${tz}, defaulting to UTC`);
    localTime = nowUtc;
  }
  
  // Check day of week
  const currentDay = localTime.getDay();
  const scheduledDays = schedule.days.map(d => DAY_MAP[d.toLowerCase()]).filter(d => d !== undefined);
  if (!scheduledDays.includes(currentDay)) {
    return false;
  }
  
  // Check time (with 30-minute window)
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  for (const timeStr of schedule.times) {
    const [hour, minute] = timeStr.split(':').map(Number);
    const scheduledTotalMinutes = hour * 60 + (minute || 0);
    
    // Match within 30-minute window (allows for cron running every 30 min)
    if (Math.abs(currentTotalMinutes - scheduledTotalMinutes) <= 30) {
      return true;
    }
  }
  
  return false;
}

/**
 * Main cron endpoint - processes all due schedules
 */
briefingCronRoutes.post('/process', async (c) => {
  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || c.req.query('secret');
  
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  const nowUtc = new Date();
  console.log(`[Cron] Processing at ${nowUtc.toISOString()}`);
  
  try {
    // Get all enabled profiles with their users
    const profiles = await db.select({
      id: briefingProfiles.id,
      name: briefingProfiles.name,
      userId: briefingProfiles.userId,
      filterConfig: briefingProfiles.filterConfig,
      settings: briefingProfiles.settings,
      schedule: briefingProfiles.schedule,
      user: {
        telegramChatId: users.telegramChatId,
        email: users.email,
      },
    })
      .from(briefingProfiles)
      .leftJoin(users, eq(briefingProfiles.userId, users.id))
      .where(sql`(${briefingProfiles.schedule}->>'enabled')::boolean = true`);
    
    console.log(`[Cron] Found ${profiles.length} enabled profiles`);
    
    const results: Array<{
      profileId: string;
      profileName: string;
      status: string;
      webhookStatus?: string;
      webhookResults?: WebhookResult[];
      error?: string;
    }> = [];
    
    for (const profile of profiles) {
      const schedule = profile.schedule as ProfileSchedule;
      
      if (!shouldRunNow(schedule, nowUtc)) {
        continue; // Skip - not due
      }
      
      console.log(`[Cron] Processing profile: ${profile.name}`);
      
      try {
        const filterConfig = profile.filterConfig as ProfileFilterConfig;
        const settings = profile.settings as ProfileSettings;
        
        // Resolve source list IDs to source IDs
        let sourceIds: string[] | undefined;
        if (filterConfig.sourceListIds?.length) {
          sourceIds = await getSourceIdsFromLists(filterConfig.sourceListIds);
          console.log(`[Cron] Resolved ${sourceIds.length} sources from ${filterConfig.sourceListIds.length} source lists`);
        }
        
        // Generate briefing
        const briefing = await generateExecutiveBriefing({
          userId: profile.userId,
          topics: filterConfig.topics,
          excludeTopics: filterConfig.excludeTopics,
          domains: filterConfig.domains,
          excludeDomains: filterConfig.excludeDomains,
          topicQuery: filterConfig.topicQuery,
          sourceIds,
          hoursBack: settings.hoursBack || 24,
          minConfidence: settings.minConfidence || 0.3,
          maxArticles: settings.maxArticles || 50,
          timezone: schedule.timezone || 'America/New_York',
        });
        
        // Save briefing
        const [saved] = await db.insert(briefings).values({
          userId: profile.userId,
          profileId: profile.id,
          type: 'executive',
          title: briefing.title,
          markdownContent: briefing.markdownContent,
          structuredData: briefing,
          contentIds: [],
          deliveryChannels: schedule.channels || ['web'],
        }).returning();
        
        // Update profile stats
        await db.update(briefingProfiles)
          .set({
            lastGeneratedAt: new Date(),
            generationCount: sql`${briefingProfiles.generationCount} + 1`,
          })
          .where(eq(briefingProfiles.id, profile.id));
        
        console.log(`[Cron] Generated briefing ${saved.id} for profile ${profile.name}`);
        
        // Webhook delivery (multiple)
        const webhookPayload: WebhookPayload = {
          type: 'briefing',
          profileId: profile.id,
          profileName: profile.name,
          briefingId: saved.id,
          title: saved.title || profile.name,
          content: briefing.markdownContent || '',
          summary: (briefing.markdownContent || '').substring(0, 500),
          generatedAt: new Date().toISOString(),
          articleCount: briefing.summary?.totalStories,
          filterConfig: filterConfig,
        };
        
        const { results: webhookResults, summary: webhookStatus } = await sendToAllWebhooks(schedule, webhookPayload);
        
        if (webhookResults.length > 0) {
          console.log(`[Cron] Webhook delivery for ${profile.name}: ${webhookStatus}`);
        }
        
        // TODO: Handle telegram delivery
        if (schedule.channels?.includes('telegram')) {
          console.log(`[Cron] TODO: Send to Telegram for profile ${profile.name}`);
        }
        
        results.push({
          profileId: profile.id,
          profileName: profile.name,
          status: 'generated',
          webhookStatus,
          webhookResults: webhookResults.length > 0 ? webhookResults : undefined,
        });
        
      } catch (err) {
        console.error(`[Cron] Failed to process profile ${profile.name}:`, err);
        results.push({
          profileId: profile.id,
          profileName: profile.name,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    
    return c.json({
      success: true,
      processedAt: nowUtc.toISOString(),
      profilesChecked: profiles.length,
      profilesProcessed: results.length,
      results,
    });
    
  } catch (error) {
    console.error('[Cron] Processing failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    }, 500);
  }
});

/**
 * Manual trigger for a specific profile
 */
briefingCronRoutes.post('/trigger/:profileId', async (c) => {
  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || c.req.query('secret');
  
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  const profileId = c.req.param('profileId');
  
  try {
    const [profile] = await db.select({
      id: briefingProfiles.id,
      name: briefingProfiles.name,
      userId: briefingProfiles.userId,
      filterConfig: briefingProfiles.filterConfig,
      settings: briefingProfiles.settings,
      schedule: briefingProfiles.schedule,
    })
      .from(briefingProfiles)
      .where(eq(briefingProfiles.id, profileId));
    
    if (!profile) {
      return c.json({ success: false, error: 'Profile not found' }, 404);
    }
    
    const filterConfig = profile.filterConfig as ProfileFilterConfig;
    const settings = profile.settings as ProfileSettings;
    const schedule = profile.schedule as ProfileSchedule;
    
    // Resolve source list IDs
    let sourceIds: string[] | undefined;
    if (filterConfig.sourceListIds?.length) {
      sourceIds = await getSourceIdsFromLists(filterConfig.sourceListIds);
    }
    
    const briefing = await generateExecutiveBriefing({
      userId: profile.userId,
      topics: filterConfig.topics,
      excludeTopics: filterConfig.excludeTopics,
      domains: filterConfig.domains,
      excludeDomains: filterConfig.excludeDomains,
      topicQuery: filterConfig.topicQuery,
      sourceIds,
      hoursBack: settings.hoursBack || 24,
      minConfidence: settings.minConfidence || 0.3,
      maxArticles: settings.maxArticles || 50,
    });
    
    const [saved] = await db.insert(briefings).values({
      userId: profile.userId,
      profileId: profile.id,
      type: 'executive',
      title: briefing.title,
      markdownContent: briefing.markdownContent,
      structuredData: briefing,
      contentIds: [],
      deliveryChannels: schedule.channels || ['web'],
    }).returning();
    
    await db.update(briefingProfiles)
      .set({
        lastGeneratedAt: new Date(),
        generationCount: sql`${briefingProfiles.generationCount} + 1`,
      })
      .where(eq(briefingProfiles.id, profile.id));
    
    // Webhook delivery (multiple)
    const webhookPayload: WebhookPayload = {
      type: 'briefing',
      profileId: profile.id,
      profileName: profile.name,
      briefingId: saved.id,
      title: saved.title || profile.name,
      content: briefing.markdownContent || '',
      summary: (briefing.markdownContent || '').substring(0, 500),
      generatedAt: new Date().toISOString(),
      articleCount: briefing.summary?.totalStories,
      filterConfig: filterConfig,
    };
    
    const { results: webhookResults, summary: webhookStatus } = await sendToAllWebhooks(schedule, webhookPayload);
    
    return c.json({
      success: true,
      briefingId: saved.id,
      profileName: profile.name,
      webhookStatus,
      webhookResults: webhookResults.length > 0 ? webhookResults : undefined,
    });
    
  } catch (error) {
    console.error('[Cron] Manual trigger failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Generation failed',
    }, 500);
  }
});

/**
 * Get schedule status for all profiles
 */
briefingCronRoutes.get('/status', async (c) => {
  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || c.req.query('secret');
  
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  try {
    const profiles = await db.select({
      id: briefingProfiles.id,
      name: briefingProfiles.name,
      schedule: briefingProfiles.schedule,
      filterConfig: briefingProfiles.filterConfig,
      lastGeneratedAt: briefingProfiles.lastGeneratedAt,
      generationCount: briefingProfiles.generationCount,
    })
      .from(briefingProfiles)
      .where(sql`(${briefingProfiles.schedule}->>'enabled')::boolean = true`);
    
    const now = new Date();
    
    return c.json({
      success: true,
      checkedAt: now.toISOString(),
      profiles: profiles.map(p => {
        const schedule = p.schedule as ProfileSchedule;
        const webhookCount = schedule.webhooks?.filter(w => w.enabled).length || 
                            (schedule.webhookUrl ? 1 : 0);
        return {
          id: p.id,
          name: p.name,
          enabled: schedule.enabled,
          times: schedule.times,
          timezone: schedule.timezone,
          days: schedule.days,
          channels: schedule.channels,
          webhookCount,
          lastGeneratedAt: p.lastGeneratedAt,
          generationCount: p.generationCount,
          wouldRunNow: shouldRunNow(schedule, now),
        };
      }),
    });
    
  } catch (error) {
    console.error('[Cron] Status check failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Status check failed',
    }, 500);
  }
});

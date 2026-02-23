/**
 * Briefing Cron Processor
 * 
 * Endpoint to be called by external cron (e.g., GitHub Actions, cron job)
 * to process scheduled briefing profiles.
 * 
 * Supports delivery via: Web, Telegram, Email, Webhook
 */

import { Hono } from 'hono';
import { db, briefingProfiles, briefings, users, sourceListItems } from '../db';
import { eq, sql, inArray } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../services/intelligence/executive-briefing';
import * as crypto from 'crypto';

// Simple auth for cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || process.env.BRIEFING_CRON_SECRET;

export const briefingCronRoutes = new Hono();

interface ProfileSchedule {
  enabled?: boolean;
  times?: string[];
  timezone?: string;
  days?: string[];
  channels?: string[];
  webhookUrl?: string;      // Profile-level webhook
  webhookSecret?: string;   // Optional HMAC secret for webhook
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

// Map day abbreviations to JS day numbers (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
};

/**
 * Send briefing to webhook URL
 */
/**
 * Send briefing to webhook URL
 * Automatically detects Teams webhooks and formats as Adaptive Card
 */
async function sendWebhookBriefing(
  webhookUrl: string,
  payload: WebhookPayload,
  secret?: string
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    // Detect if this is a Microsoft Teams webhook
    const isTeamsWebhook = webhookUrl.includes('webhook.office.com') || 
                           webhookUrl.includes('microsoft.com') ||
                           webhookUrl.includes('.logic.azure.com');
    
    let body: string;
    
    if (isTeamsWebhook) {
      // Format as Teams Adaptive Card
      const briefingContent = (payload.content || '').substring(0, 2000);
      const teamsPayload = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
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
            }
          }
        ]
      };
      body = JSON.stringify(teamsPayload);
    } else {
      // Generic JSON webhook
      body = JSON.stringify(payload);
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Argus-Briefing/1.0',
    };
    
    // Add HMAC signature if secret provided (for non-Teams webhooks)
    if (secret && !isTeamsWebhook) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Argus-Signature'] = `sha256=${signature}`;
    }
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
    });
    
    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      console.error(`[Webhook] Error response: ${responseText}`);
      return {
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }
    
    console.log(`[Webhook] Delivered to ${webhookUrl} (Teams: ${isTeamsWebhook})`);
    return { success: true, statusCode: response.status };
    
  } catch (error) {
    console.error(`[Webhook] Failed to deliver to ${webhookUrl}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
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
    console.warn(`[Cron] Invalid timezone: ${tz}, falling back to UTC`);
    localTime = nowUtc;
  }
  
  // Check day
  const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][localTime.getDay()];
  if (!schedule.days.includes(dayName)) {
    return false;
  }
  
  // Check time (within 5 min window)
  const currentHHMM = `${String(localTime.getHours()).padStart(2, '0')}:${String(localTime.getMinutes()).padStart(2, '0')}`;
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();
  
  for (const schedTime of schedule.times) {
    const [h, m] = schedTime.split(':').map(Number);
    const schedMinutes = h * 60 + m;
    const diff = Math.abs(currentMinutes - schedMinutes);
    // Allow 5 minute window (in case cron runs slightly off)
    if (diff <= 5 || diff >= (24 * 60 - 5)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Process all scheduled briefings
 * Called by external cron every 5-10 minutes
 */
briefingCronRoutes.post('/process', async (c) => {
  // Verify cron secret
  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || c.req.query('secret');
  
  if (!CRON_SECRET) {
    console.warn('[Cron] No CRON_SECRET configured, skipping auth check');
  } else if (providedSecret !== CRON_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  const nowUtc = new Date();
  console.log(`[Cron] Processing scheduled briefings at ${nowUtc.toISOString()}`);
  
  try {
    // Get all profiles with enabled schedules
    const profiles = await db.select()
      .from(briefingProfiles)
      .where(sql`(${briefingProfiles.schedule}->>'enabled')::boolean = true`);
    
    console.log(`[Cron] Found ${profiles.length} profiles with enabled schedules`);
    
    const results: { profileId: string; profileName: string; status: string; error?: string; webhookStatus?: string }[] = [];
    
    for (const profile of profiles) {
      const schedule = profile.schedule as ProfileSchedule;
      
      if (!shouldRunNow(schedule, nowUtc)) {
        continue;
      }
      
      console.log(`[Cron] Processing profile: ${profile.name} (${profile.id})`);
      
      try {
        const filterConfig = profile.filterConfig as ProfileFilterConfig;
        const settings = profile.settings as ProfileSettings;
        
        // Get source IDs from source lists if specified
        const sourceIds = filterConfig.sourceListIds?.length 
          ? await getSourceIdsFromLists(filterConfig.sourceListIds)
          : undefined;
        
        if (sourceIds?.length) {
          console.log(`[Cron] Using ${sourceIds.length} sources from ${filterConfig.sourceListIds?.length} source lists`);
        }
        
        // Generate briefing
        const briefing = await generateExecutiveBriefing({
          type: 'morning',
          hoursBack: settings.hoursBack || 14,
          minConfidence: settings.minConfidence || 45,
          maxArticles: settings.maxArticles || 100,
          includeTTS: settings.includeTTS || false,
          topics: filterConfig.topics,
          excludeTopics: filterConfig.excludeTopics,
          domainSlugs: filterConfig.domains,
          excludeDomainSlugs: filterConfig.excludeDomains,
          topicQuery: filterConfig.topicQuery,
          sourceIds: sourceIds,
        });
        
        // Save briefing
        const [saved] = await db.insert(briefings).values({
          userId: profile.userId,
          profileId: profile.id,
          type: 'morning',
          title: `${profile.name} - ${nowUtc.toLocaleDateString()}`,
          content: briefing.markdownContent || '',
          summary: (briefing.markdownContent || '').substring(0, 500),
          changes: [],
          forecasts: [],
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
        
        let webhookStatus = 'not_configured';
        
        // Webhook delivery
        if (schedule.webhookUrl) {
          const webhookResult = await sendWebhookBriefing(schedule.webhookUrl, {
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
          }, schedule.webhookSecret);
          
          if (webhookResult.success) {
            webhookStatus = 'delivered';
            console.log(`[Cron] Webhook delivered for profile ${profile.name}`);
          } else {
            webhookStatus = `failed: ${webhookResult.error}`;
            console.error(`[Cron] Webhook failed for profile ${profile.name}: ${webhookResult.error}`);
          }
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
 * Manual trigger for a specific profile (for testing)
 */
briefingCronRoutes.post('/trigger/:profileId', async (c) => {
  const authHeader = c.req.header('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || c.req.query('secret');
  
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  
  const profileId = c.req.param('profileId');
  
  try {
    const [profile] = await db.select()
      .from(briefingProfiles)
      .where(eq(briefingProfiles.id, profileId))
      .limit(1);
    
    if (!profile) {
      return c.json({ success: false, error: 'Profile not found' }, 404);
    }
    
    const filterConfig = profile.filterConfig as ProfileFilterConfig;
    const settings = profile.settings as ProfileSettings;
    const schedule = profile.schedule as ProfileSchedule;
    
    // Get source IDs from source lists if specified
    const sourceIds = filterConfig.sourceListIds?.length 
      ? await getSourceIdsFromLists(filterConfig.sourceListIds)
      : undefined;
    
    const briefing = await generateExecutiveBriefing({
      type: 'morning',
      hoursBack: settings.hoursBack || 14,
      minConfidence: settings.minConfidence || 45,
      maxArticles: settings.maxArticles || 100,
      includeTTS: settings.includeTTS || false,
      topics: filterConfig.topics,
      excludeTopics: filterConfig.excludeTopics,
      domainSlugs: filterConfig.domains,
      excludeDomainSlugs: filterConfig.excludeDomains,
      topicQuery: filterConfig.topicQuery,
      sourceIds: sourceIds,
    });
    
    const [saved] = await db.insert(briefings).values({
      userId: profile.userId,
      profileId: profile.id,
      type: 'morning',
      title: `${profile.name} - ${new Date().toLocaleDateString()}`,
      content: briefing.markdownContent || '',
      summary: (briefing.markdownContent || '').substring(0, 500),
      changes: [],
      forecasts: [],
      contentIds: [],
      deliveryChannels: schedule.channels || ['web'],
    }).returning();
    
    await db.update(briefingProfiles)
      .set({
        lastGeneratedAt: new Date(),
        generationCount: sql`${briefingProfiles.generationCount} + 1`,
      })
      .where(eq(briefingProfiles.id, profile.id));
    
    let webhookStatus = 'not_configured';
    
    // Webhook delivery
    if (schedule.webhookUrl) {
      const webhookResult = await sendWebhookBriefing(schedule.webhookUrl, {
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
      }, schedule.webhookSecret);
      
      webhookStatus = webhookResult.success ? 'delivered' : `failed: ${webhookResult.error}`;
    }
    
    return c.json({
      success: true,
      briefingId: saved.id,
      profileName: profile.name,
      webhookStatus,
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
    
    return c.json({
      success: true,
      enabledProfiles: profiles.length,
      profiles: profiles.map(p => ({
        id: p.id,
        name: p.name,
        schedule: p.schedule,
        filterConfig: p.filterConfig,
        lastGenerated: p.lastGeneratedAt,
        totalGenerated: p.generationCount,
      })),
    });
    
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

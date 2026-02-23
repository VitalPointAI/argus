/**
 * Briefing Cron Processor
 * 
 * Endpoint to be called by external cron (e.g., GitHub Actions, cron job)
 * to process scheduled briefing profiles.
 */

import { Hono } from 'hono';
import { db, briefingProfiles, briefings, users } from '../db';
import { eq, sql } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../services/intelligence/executive-briefing';

// Simple auth for cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || process.env.BRIEFING_CRON_SECRET;

export const briefingCronRoutes = new Hono();

interface ProfileSchedule {
  enabled?: boolean;
  times?: string[];
  timezone?: string;
  days?: string[];
  channels?: string[];
}

interface ProfileFilterConfig {
  topics?: string[];
  excludeTopics?: string[];
  domains?: string[];
  excludeDomains?: string[];
  topicQuery?: string;
}

interface ProfileSettings {
  format?: 'executive' | 'summary';
  hoursBack?: number;
  minConfidence?: number;
  maxArticles?: number;
  includeTTS?: boolean;
}

// Map day abbreviations to JS day numbers (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
};

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
    
    const results: { profileId: string; profileName: string; status: string; error?: string }[] = [];
    
    for (const profile of profiles) {
      const schedule = profile.schedule as ProfileSchedule;
      
      if (!shouldRunNow(schedule, nowUtc)) {
        continue;
      }
      
      console.log(`[Cron] Processing profile: ${profile.name} (${profile.id})`);
      
      try {
        const filterConfig = profile.filterConfig as ProfileFilterConfig;
        const settings = profile.settings as ProfileSettings;
        
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
        
        // TODO: Handle delivery channels (telegram, email, etc.)
        if (schedule.channels?.includes('telegram')) {
          console.log(`[Cron] TODO: Send to Telegram for profile ${profile.name}`);
        }
        
        results.push({
          profileId: profile.id,
          profileName: profile.name,
          status: 'generated',
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
    
    return c.json({
      success: true,
      briefingId: saved.id,
      profileName: profile.name,
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
        lastGenerated: p.lastGeneratedAt,
        totalGenerated: p.generationCount,
      })),
    });
    
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

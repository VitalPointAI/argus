import { Hono } from 'hono';
import { db, briefingProfiles, briefings, users, sourceListItems } from '../db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../services/intelligence/executive-briefing';

interface FilterConfig {
  topics?: string[];
  excludeTopics?: string[];
  domains?: string[];
  excludeDomains?: string[];
  topicQuery?: string;
  sourceListId?: string;
}

interface ProfileSettings {
  format?: 'executive' | 'summary';
  hoursBack?: number;
  minConfidence?: number;
  maxArticles?: number;
  includeTTS?: boolean;
}

interface ProfileSchedule {
  enabled?: boolean;
  times?: string[];
  timezone?: string;
  days?: string[];
  channels?: string[];
}

export const briefingProfileRoutes = new Hono();

// List all profiles for current user
briefingProfileRoutes.get('/', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const profiles = await db.select()
      .from(briefingProfiles)
      .where(eq(briefingProfiles.userId, user.id))
      .orderBy(desc(briefingProfiles.updatedAt));

    return c.json({ success: true, data: profiles });
  } catch (error) {
    console.error('[Profiles] List error:', error);
    return c.json({ success: false, error: 'Failed to fetch profiles' }, 500);
  }
});

// Get a single profile with its history
briefingProfileRoutes.get('/:id', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const [profile] = await db.select()
      .from(briefingProfiles)
      .where(and(
        eq(briefingProfiles.id, id),
        eq(briefingProfiles.userId, user.id)
      ))
      .limit(1);

    if (!profile) {
      return c.json({ success: false, error: 'Profile not found' }, 404);
    }

    // Get history for this profile
    const history = await db.select({
      id: briefings.id,
      title: briefings.title,
      type: briefings.type,
      createdAt: briefings.createdAt,
    })
      .from(briefings)
      .where(eq(briefings.profileId, id))
      .orderBy(desc(briefings.createdAt))
      .limit(20);

    return c.json({ 
      success: true, 
      data: {
        ...profile,
        history,
      }
    });
  } catch (error) {
    console.error('[Profiles] Get error:', error);
    return c.json({ success: false, error: 'Failed to fetch profile' }, 500);
  }
});

// Create a new profile
briefingProfileRoutes.post('/', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, filterConfig, settings, schedule, filterUrl } = body;

  if (!name) {
    return c.json({ success: false, error: 'Profile name is required' }, 400);
  }

  // Parse filter URL if provided
  let parsedFilters: FilterConfig = filterConfig || {};
  if (filterUrl && !filterConfig) {
    try {
      const url = new URL(filterUrl);
      const params = url.searchParams;
      if (params.get('topics')) parsedFilters.topics = params.get('topics')!.split(',').map(t => t.trim());
      if (params.get('excludeTopics')) parsedFilters.excludeTopics = params.get('excludeTopics')!.split(',').map(t => t.trim());
      if (params.get('domains')) parsedFilters.domains = params.get('domains')!.split(',').map(t => t.trim());
      if (params.get('excludeDomains')) parsedFilters.excludeDomains = params.get('excludeDomains')!.split(',').map(t => t.trim());
      if (params.get('topicQuery')) parsedFilters.topicQuery = params.get('topicQuery')!;
    } catch (e) {
      console.warn('[Profiles] Failed to parse filter URL:', filterUrl);
    }
  }

  try {
    const [profile] = await db.insert(briefingProfiles).values({
      userId: user.id,
      name,
      filterConfig: parsedFilters,
      settings: settings || { format: 'executive', hoursBack: 14, minConfidence: 45, maxArticles: 100 },
      schedule: schedule || { enabled: false, times: ['05:00', '18:00'], timezone: 'America/New_York', days: ['mon', 'tue', 'wed', 'thu', 'fri'], channels: ['web'] },
    }).returning();

    return c.json({ success: true, data: profile });
  } catch (error) {
    console.error('[Profiles] Create error:', error);
    return c.json({ success: false, error: 'Failed to create profile' }, 500);
  }
});

// Update a profile
briefingProfileRoutes.patch('/:id', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, filterConfig, settings, schedule, filterUrl } = body;

  // Verify ownership
  const [existing] = await db.select({ id: briefingProfiles.id })
    .from(briefingProfiles)
    .where(and(
      eq(briefingProfiles.id, id),
      eq(briefingProfiles.userId, user.id)
    ))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: 'Profile not found' }, 404);
  }

  // Parse filter URL if provided
  let parsedFilters: FilterConfig | undefined;
  if (filterUrl) {
    parsedFilters = {};
    try {
      const url = new URL(filterUrl);
      const params = url.searchParams;
      if (params.get('topics')) parsedFilters.topics = params.get('topics')!.split(',').map(t => t.trim());
      if (params.get('excludeTopics')) parsedFilters.excludeTopics = params.get('excludeTopics')!.split(',').map(t => t.trim());
      if (params.get('domains')) parsedFilters.domains = params.get('domains')!.split(',').map(t => t.trim());
      if (params.get('excludeDomains')) parsedFilters.excludeDomains = params.get('excludeDomains')!.split(',').map(t => t.trim());
      if (params.get('topicQuery')) parsedFilters.topicQuery = params.get('topicQuery')!;
    } catch (e) {
      console.warn('[Profiles] Failed to parse filter URL:', filterUrl);
    }
  }

  const updates: Partial<typeof briefingProfiles.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (filterConfig !== undefined) updates.filterConfig = filterConfig;
  if (parsedFilters) updates.filterConfig = parsedFilters;
  if (settings !== undefined) updates.settings = settings;
  if (schedule !== undefined) updates.schedule = schedule;

  try {
    const [updated] = await db.update(briefingProfiles)
      .set(updates)
      .where(eq(briefingProfiles.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Profiles] Update error:', error);
    return c.json({ success: false, error: 'Failed to update profile' }, 500);
  }
});

// Delete a profile
briefingProfileRoutes.delete('/:id', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const result = await db.delete(briefingProfiles)
      .where(and(
        eq(briefingProfiles.id, id),
        eq(briefingProfiles.userId, user.id)
      ))
      .returning({ id: briefingProfiles.id });

    if (result.length === 0) {
      return c.json({ success: false, error: 'Profile not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('[Profiles] Delete error:', error);
    return c.json({ success: false, error: 'Failed to delete profile' }, 500);
  }
});

// Generate briefing for a specific profile
briefingProfileRoutes.post('/:id/generate', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  // Get the profile
  const [profile] = await db.select()
    .from(briefingProfiles)
    .where(and(
      eq(briefingProfiles.id, id),
      eq(briefingProfiles.userId, user.id)
    ))
    .limit(1);

  if (!profile) {
    return c.json({ success: false, error: 'Profile not found' }, 404);
  }

  const filterConfig = profile.filterConfig as FilterConfig;
  const settings = profile.settings as ProfileSettings;

  try {
    console.log(`[Profiles] Generating briefing for profile: ${profile.name}`);
    
    const briefing = await generateExecutiveBriefing({
      type: 'morning',
      hoursBack: settings.hoursBack || 14,
      minConfidence: settings.minConfidence || 45,
      maxArticles: settings.maxArticles || 100,
      includeTTS: settings.includeTTS || false,
      // Apply profile filters
      topics: filterConfig.topics,
      excludeTopics: filterConfig.excludeTopics,
      domainSlugs: filterConfig.domains,
      excludeDomainSlugs: filterConfig.excludeDomains,
      topicQuery: filterConfig.topicQuery,
    });

    // Save the briefing with profile reference
    const [saved] = await db.insert(briefings).values({
      userId: user.id,
      profileId: profile.id,
      type: 'morning',
      title: briefing.title || profile.name,
      content: briefing.markdownContent || '',
      summary: (briefing.markdownContent || '').substring(0, 500) || 'No content',
      changes: [],
      forecasts: [],
      contentIds: [],
      deliveryChannels: ['web'],
    }).returning();

    // Update profile stats
    await db.update(briefingProfiles)
      .set({
        lastGeneratedAt: new Date(),
        generationCount: sql`${briefingProfiles.generationCount} + 1`,
      })
      .where(eq(briefingProfiles.id, profile.id));

    console.log(`[Profiles] Saved briefing ${saved.id} for profile ${profile.name}`);

    // Webhook delivery (if configured on profile)
    let webhookStatus = 'not_configured';
    const schedule = profile.schedule as { webhookUrl?: string; webhookSecret?: string } | null;
    
    if (schedule?.webhookUrl) {
      try {
        const payload = {
          type: 'briefing',
          profileName: profile.name,
          briefingId: saved.id,
          title: briefing.title || profile.name,
          content: briefing.markdownContent || '',
          generatedAt: new Date().toISOString(),
          source: 'manual',
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (schedule.webhookSecret) {
          const crypto = await import('crypto');
          const signature = crypto.createHmac('sha256', schedule.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
          headers['X-Argus-Signature'] = signature;
        }

        const response = await fetch(schedule.webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          webhookStatus = 'delivered';
          console.log(`[Profiles] Webhook delivered to ${schedule.webhookUrl}`);
        } else {
          webhookStatus = `failed: ${response.status}`;
          console.error(`[Profiles] Webhook failed: ${response.status}`);
        }
      } catch (error) {
        webhookStatus = `error: ${error}`;
        console.error(`[Profiles] Webhook error:`, error);
      }
    }

    return c.json({ 
      success: true, 
      data: {
        ...briefing,
        saved: true,
        briefingId: saved.id,
        profileId: profile.id,
        profileName: profile.name,
        webhookStatus,
      }
    });
  } catch (error) {
    console.error('[Profiles] Generate error:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate briefing' 
    }, 500);
  }
});

// Get history for a profile
briefingProfileRoutes.get('/:id/history', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  // Verify ownership
  const [profile] = await db.select({ id: briefingProfiles.id })
    .from(briefingProfiles)
    .where(and(
      eq(briefingProfiles.id, id),
      eq(briefingProfiles.userId, user.id)
    ))
    .limit(1);

  if (!profile) {
    return c.json({ success: false, error: 'Profile not found' }, 404);
  }

  try {
    const history = await db.select({
      id: briefings.id,
      title: briefings.title,
      type: briefings.type,
      createdAt: briefings.createdAt,
    })
      .from(briefings)
      .where(eq(briefings.profileId, id))
      .orderBy(desc(briefings.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(briefings)
      .where(eq(briefings.profileId, id));

    return c.json({ 
      success: true, 
      data: history,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + history.length < count,
      }
    });
  } catch (error) {
    console.error('[Profiles] History error:', error);
    return c.json({ success: false, error: 'Failed to fetch history' }, 500);
  }
});

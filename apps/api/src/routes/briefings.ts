import { Hono } from 'hono';
import { db, briefings, users } from '../db';
import { eq, desc, sql, and } from 'drizzle-orm';
import { generateBriefing, createBriefing } from '../services/intelligence/briefing';
import { generateLLMBriefing, generateFactCheckedBriefing } from '../services/intelligence/llm-briefing';
import { generateExecutiveBriefing } from '../services/intelligence/executive-briefing';
import { generateBriefingAudio, getStatus as getTTSStatus, getVoices } from '../services/tts/index.js';

export const briefingsRoutes = new Hono();

// Debug endpoint to check article fetching (placed first to avoid route conflicts)
briefingsRoutes.get('/debug/articles', async (c) => {
  try {
    const hoursBack = parseInt(c.req.query('hoursBack') || '24');
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    // Import db and content table
    const { db, content, sources, domains } = await import('../db');
    const { sql, gte, desc, eq } = await import('drizzle-orm');
    
    // Simple count
    const [totalCount] = await db.select({ count: sql<number>`count(*)::int` }).from(content);
    
    // Count with date filter
    const [recentCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(content)
      .where(gte(content.fetchedAt, since));
    
    // Get some actual articles
    const articles = await db
      .select({
        id: content.id,
        title: content.title,
        fetchedAt: content.fetchedAt,
        sourceName: sources.name,
        domain: domains.name,
      })
      .from(content)
      .leftJoin(sources, eq(content.sourceId, sources.id))
      .leftJoin(domains, eq(sources.domainId, domains.id))
      .where(gte(content.fetchedAt, since))
      .orderBy(desc(content.fetchedAt))
      .limit(5);
    
    return c.json({
      success: true,
      data: {
        hoursBack,
        since: since.toISOString(),
        now: new Date().toISOString(),
        totalArticles: totalCount?.count,
        recentArticles: recentCount?.count,
        sampleArticles: articles.map(a => ({
          title: a.title?.substring(0, 50),
          fetchedAt: a.fetchedAt,
          source: a.sourceName,
          domain: a.domain,
        })),
      }
    });
  } catch (error) {
    console.error('Debug articles error:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});

// Get latest executive briefing for current user
briefingsRoutes.get('/executive/current', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const [latest] = await db.select()
      .from(briefings)
      .where(eq(briefings.userId, user.id))
      .orderBy(desc(briefings.createdAt))
      .limit(1);

    if (!latest) {
      return c.json({ 
        success: true, 
        data: null,
        message: 'No briefing found. Generate your first executive briefing.',
      });
    }

    return c.json({ 
      success: true, 
      data: {
        id: latest.id,
        title: latest.title,
        type: latest.type,
        content: latest.content,
        createdAt: latest.createdAt,
      },
    });
  } catch (error) {
    console.error('Get current briefing error:', error);
    return c.json({ success: false, error: 'Failed to fetch briefing' }, 500);
  }
});

// Get executive briefing history for current user
briefingsRoutes.get('/executive/history', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = parseInt(c.req.query('offset') || '0');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const history = await db.select({
      id: briefings.id,
      title: briefings.title,
      type: briefings.type,
      createdAt: briefings.createdAt,
    })
      .from(briefings)
      .where(eq(briefings.userId, user.id))
      .orderBy(desc(briefings.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(briefings)
      .where(eq(briefings.userId, user.id));

    return c.json({ 
      success: true, 
      data: history,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + history.length < count,
      },
    });
  } catch (error) {
    console.error('Get briefing history error:', error);
    return c.json({ success: false, error: 'Failed to fetch history' }, 500);
  }
});

// Get a specific briefing by ID
briefingsRoutes.get('/executive/:id', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const id = c.req.param('id');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const [briefing] = await db.select()
      .from(briefings)
      .where(and(
        eq(briefings.id, id),
        eq(briefings.userId, user.id)
      ))
      .limit(1);

    if (!briefing) {
      return c.json({ success: false, error: 'Briefing not found' }, 404);
    }

    return c.json({ 
      success: true, 
      data: {
        id: briefing.id,
        title: briefing.title,
        type: briefing.type,
        content: briefing.content,
        createdAt: briefing.createdAt,
      },
    });
  } catch (error) {
    console.error('Get briefing error:', error);
    return c.json({ success: false, error: 'Failed to fetch briefing' }, 500);
  }
});

// Generate LLM-powered briefing (new!)
briefingsRoutes.post('/llm', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { 
    type = 'morning', 
    hoursBack = 12, 
    minConfidence = 50,
    maxArticles = 50,
    save = false,
    userId,
  } = body;

  try {
    console.log(`Generating ${type} LLM briefing...`);
    
    const result = await generateLLMBriefing({
      type,
      hoursBack,
      minConfidence,
      maxArticles,
    });

    // Optionally save to database
    if (save && userId) {
      const [saved] = await db.insert(briefings).values({
        userId,
        type,
        summary: result.content, // LLM briefing returns 'content' as summary
        changes: [],
        forecasts: [],
        contentIds: [],
        deliveryChannels: ['web'],
      }).returning();

      return c.json({ 
        success: true, 
        data: {
          ...result,
          saved: true,
          briefingId: saved.id,
        }
      });
    }

    return c.json({ 
      success: true, 
      data: result,
    });
  } catch (error) {
    console.error('LLM briefing error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Generate fact-checked briefing with review capability
briefingsRoutes.post('/factcheck', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { 
    type = 'morning', 
    hoursBack = 12, 
    minConfidence = 50,
  } = body;

  try {
    console.log(`Generating fact-checked ${type} briefing...`);
    
    const result = await generateFactCheckedBriefing({
      type,
      hoursBack,
      minConfidence,
    });

    return c.json({ 
      success: true, 
      data: {
        ...result,
        // Include review instructions
        reviewInstructions: {
          description: 'Review each claim and mark as approved/disputed/needs_more_sources',
          endpoint: 'POST /api/briefings/review',
          actions: ['approve', 'dispute', 'needs_more_sources', 'remove'],
        }
      }
    });
  } catch (error) {
    console.error('Fact-checked briefing error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Generate executive briefing (new structured format)
// Always saves when user is authenticated
briefingsRoutes.post('/executive', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  const body = await c.req.json().catch(() => ({}));
  const { 
    type = 'morning', 
    hoursBack = 14, 
    minConfidence = 45,
    maxArticles = 100,
    includeTTS = false,
  } = body;

  try {
    console.log(`[Briefing] Generating executive ${type} briefing...`);
    console.log(`[Briefing] Options: hoursBack=${hoursBack}, minConfidence=${minConfidence}, maxArticles=${maxArticles}`);
    
    const briefing = await generateExecutiveBriefing({
      type,
      hoursBack,
      minConfidence,
      maxArticles,
      includeTTS,
    });

    console.log(`[Briefing] Generated: ${briefing.summary?.totalStories || 0} stories, ${briefing.summary?.totalArticles || 0} articles`);

    // Always save when user is authenticated
    if (user) {
      const markdownContent = briefing.markdownContent || '';
      
      console.log(`[Briefing] Saving for user ${user.id}...`);
      
      const [saved] = await db.insert(briefings).values({
        userId: user.id,
        type,
        title: briefing.title || 'Executive Briefing',
        content: markdownContent,
        summary: markdownContent.substring(0, 500) || 'No content generated',
        changes: [],
        forecasts: [],
        contentIds: [],
        deliveryChannels: ['web'],
      }).returning();

      console.log(`[Briefing] Saved with ID: ${saved.id}`);

      return c.json({ 
        success: true, 
        data: {
          ...briefing,
          saved: true,
          briefingId: saved.id,
        }
      });
    }

    // Not authenticated - return without saving
    return c.json({ 
      success: true, 
      data: briefing,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Briefing] Executive briefing error:', errorMessage);
    if (errorStack) console.error('[Briefing] Stack:', errorStack);
    return c.json({
      success: false,
      error: errorMessage || 'Unknown error generating briefing',
    }, 500);
  }
});

// Generate TTS audio for a briefing
briefingsRoutes.post('/executive/tts', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { 
    type = 'morning', 
    hoursBack = 14,
    generateAudio = false, // If true, actually generate audio (costs API credits)
  } = body;

  try {
    const briefing = await generateExecutiveBriefing({
      type,
      hoursBack,
      includeTTS: true,
    });

    if (!briefing.ttsScript) {
      return c.json({ success: false, error: 'TTS script generation failed' }, 500);
    }

    // If generateAudio is true and ElevenLabs is configured, generate actual audio
    if (generateAudio) {
      const audio = await generateBriefingAudio(briefing.ttsScript);
      
      if (audio) {
        return c.json({ 
          success: true, 
          data: {
            title: briefing.title,
            audioBase64: audio.audioBase64,
            contentType: audio.contentType,
            durationEstimate: audio.durationEstimate,
            readTimeMinutes: briefing.readTimeMinutes,
          }
        });
      } else {
        return c.json({ 
          success: false, 
          error: 'Audio generation failed. Check ELEVENLABS_API_KEY configuration.',
        }, 500);
      }
    }

    // Return script only (for client-side TTS or preview)
    return c.json({ 
      success: true, 
      data: {
        title: briefing.title,
        ttsScript: briefing.ttsScript,
        readTimeMinutes: briefing.readTimeMinutes,
        summary: briefing.summary,
        instructions: 'Set generateAudio=true to get audio, or use this script with your TTS provider',
      }
    });
  } catch (error) {
    console.error('TTS generation error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Review/approve claims in a briefing
briefingsRoutes.post('/review', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { briefingId, actions } = body;
  
  // Actions format: [{ claimId: string, action: 'approve'|'dispute'|'remove', note?: string }]
  
  if (!actions || !Array.isArray(actions)) {
    return c.json({ success: false, error: 'actions array required' }, 400);
  }

  // In a full implementation, this would update the database
  // For now, return the processed actions
  const processed = actions.map((a: any) => ({
    claimId: a.claimId,
    action: a.action,
    status: 'processed',
    note: a.note,
  }));

  return c.json({ 
    success: true, 
    data: {
      briefingId,
      reviewedAt: new Date().toISOString(),
      actionsProcessed: processed.length,
      actions: processed,
    }
  });
});

// Generate a briefing preview (without saving)
briefingsRoutes.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { userId, type = 'morning', minConfidence = 50, hoursBack = 12 } = body;

  // For demo, use a default user if none provided
  let targetUserId = userId;
  
  if (!targetUserId) {
    // Get first user or create demo user
    const [user] = await db.select().from(users).limit(1);
    if (user) {
      targetUserId = user.id;
    } else {
      return c.json({ 
        success: false, 
        error: 'No users found. Create a user first.' 
      }, 400);
    }
  }

  try {
    const content = await generateBriefing(targetUserId, type, {
      minConfidence,
      hoursBack,
    });

    return c.json({ success: true, data: content });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Generate and save a briefing
briefingsRoutes.post('/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { userId, type = 'morning' } = body;

  if (!userId) {
    return c.json({ success: false, error: 'userId required' }, 400);
  }

  try {
    const result = await createBriefing(userId, type);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List briefings for a user
briefingsRoutes.get('/user/:userId', async (c) => {
  const userId = c.req.param('userId');
  const limit = parseInt(c.req.query('limit') || '20');

  const userBriefings = await db
    .select()
    .from(briefings)
    .where(eq(briefings.userId, userId))
    .orderBy(desc(briefings.generatedAt))
    .limit(limit);

  return c.json({ success: true, data: userBriefings });
});

// Get a specific briefing
briefingsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const [briefing] = await db
    .select()
    .from(briefings)
    .where(eq(briefings.id, id));

  if (!briefing) {
    return c.json({ success: false, error: 'Briefing not found' }, 404);
  }

  return c.json({ success: true, data: briefing });
});

// Get latest briefing (for any user - demo endpoint)
briefingsRoutes.get('/latest/any', async (c) => {
  const [latest] = await db
    .select()
    .from(briefings)
    .orderBy(desc(briefings.generatedAt))
    .limit(1);

  if (!latest) {
    return c.json({ success: false, error: 'No briefings yet' }, 404);
  }

  return c.json({ success: true, data: latest });
});

// Mark briefing as delivered
briefingsRoutes.post('/:id/delivered', async (c) => {
  const id = c.req.param('id');

  await db
    .update(briefings)
    .set({ deliveredAt: new Date() })
    .where(eq(briefings.id, id));

  return c.json({ success: true });
});

// TTS status and voices
briefingsRoutes.get('/tts/status', async (c) => {
  try {
    const status = await getTTSStatus();
    return c.json({ success: true, data: status });
  } catch (error) {
    console.error('TTS status error:', error);
    return c.json({ success: false, error: 'Failed to get TTS status' }, 500);
  }
});

briefingsRoutes.get('/tts/voices', async (c) => {
  try {
    const voices = await getVoices();
    return c.json({ success: true, data: voices });
  } catch (error) {
    console.error('TTS voices error:', error);
    return c.json({ success: false, error: 'Failed to get TTS voices' }, 500);
  }
});

// Get briefing stats
briefingsRoutes.get('/stats/overview', async (c) => {
  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(briefings);

  const [delivered] = await db
    .select({ count: sql<number>`count(*)` })
    .from(briefings)
    .where(sql`${briefings.deliveredAt} IS NOT NULL`);

  const byType = await db
    .select({
      type: briefings.type,
      count: sql<number>`count(*)`,
    })
    .from(briefings)
    .groupBy(briefings.type);

  return c.json({
    success: true,
    data: {
      total: Number(total.count),
      delivered: Number(delivered.count),
      byType: byType.map(t => ({ type: t.type, count: Number(t.count) })),
    },
  });
});

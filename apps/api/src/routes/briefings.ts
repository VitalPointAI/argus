import { Hono } from 'hono';
import { db, briefings, users } from '../db';
import { eq, desc, sql } from 'drizzle-orm';
import { generateBriefing, createBriefing } from '../services/intelligence/briefing';
import { generateLLMBriefing, generateFactCheckedBriefing } from '../services/intelligence/llm-briefing';

export const briefingsRoutes = new Hono();

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

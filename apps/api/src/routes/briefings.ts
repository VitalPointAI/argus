import { Hono } from 'hono';
import { db, briefings } from '../db';
import { eq, desc } from 'drizzle-orm';

export const briefingsRoutes = new Hono();

// List user's briefings
briefingsRoutes.get('/', async (c) => {
  // TODO: Require auth, get user from session
  // For now, return empty
  return c.json({ success: true, data: [] });
});

// Get specific briefing
briefingsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, id)).limit(1);
  
  if (!briefing) {
    return c.json({ success: false, error: 'Briefing not found' }, 404);
  }
  
  // TODO: Verify user owns this briefing
  return c.json({ success: true, data: briefing });
});

// Generate on-demand briefing
briefingsRoutes.post('/generate', async (c) => {
  // TODO: Require auth
  // TODO: Trigger briefing generation job
  return c.json({ success: false, error: 'Not implemented' }, 501);
});

// Get latest briefing
briefingsRoutes.get('/latest', async (c) => {
  // TODO: Require auth, filter by user
  const [latest] = await db.select()
    .from(briefings)
    .orderBy(desc(briefings.generatedAt))
    .limit(1);
  
  if (!latest) {
    return c.json({ success: false, error: 'No briefings yet' }, 404);
  }
  
  return c.json({ success: true, data: latest });
});

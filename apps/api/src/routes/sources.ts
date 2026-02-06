import { Hono } from 'hono';
import { db, sources, sourceLists, sourceListItems } from '../db';
import { eq } from 'drizzle-orm';

export const sourcesRoutes = new Hono();

// List sources (optionally filter by domain)
sourcesRoutes.get('/', async (c) => {
  const domainId = c.req.query('domainId');
  
  let query = db.select().from(sources);
  if (domainId) {
    query = query.where(eq(sources.domainId, domainId)) as typeof query;
  }
  
  const allSources = await query;
  return c.json({ success: true, data: allSources });
});

// Get source by ID
sourcesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  return c.json({ success: true, data: source });
});

// List user's source lists
sourcesRoutes.get('/lists', async (c) => {
  // TODO: Require auth, get user's lists
  return c.json({ success: false, error: 'Not implemented' }, 501);
});

// Create source list
sourcesRoutes.post('/lists', async (c) => {
  // TODO: Require auth
  return c.json({ success: false, error: 'Not implemented' }, 501);
});

// AI suggest sources for a topic
sourcesRoutes.post('/suggest', async (c) => {
  // TODO: Call LLM to suggest sources for a given topic
  return c.json({ success: false, error: 'Not implemented' }, 501);
});

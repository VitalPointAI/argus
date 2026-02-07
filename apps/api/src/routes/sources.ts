import { Hono } from 'hono';
import { db, sources, domains, sourceLists, sourceListItems } from '../db';
import { eq } from 'drizzle-orm';
import { suggestSourcesForTopic, suggestSourcesForDomain, validateRSSUrl } from '../services/intelligence/source-suggestions';

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
  const body = await c.req.json().catch(() => ({}));
  const { topic, domainSlug, validate = false } = body;
  
  if (!topic && !domainSlug) {
    return c.json({ success: false, error: 'topic or domainSlug required' }, 400);
  }
  
  try {
    let result;
    
    if (domainSlug) {
      // Get domain info
      const [domain] = await db.select().from(domains).where(eq(domains.slug, domainSlug)).limit(1);
      if (domain) {
        result = await suggestSourcesForDomain(domainSlug, domain.name);
      } else {
        result = await suggestSourcesForTopic(domainSlug);
      }
    } else {
      result = await suggestSourcesForTopic(topic);
    }
    
    // Optionally validate RSS URLs
    if (validate && result.suggestions.length > 0) {
      const validated = await Promise.all(
        result.suggestions.map(async (s) => ({
          ...s,
          validated: s.type === 'rss' ? await validateRSSUrl(s.url) : null,
        }))
      );
      result.suggestions = validated as any;
    }
    
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Add a suggested source to the database
sourcesRoutes.post('/add-suggested', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, url, type, domainId, reliabilityScore } = body;
  
  if (!name || !url || !type || !domainId) {
    return c.json({ success: false, error: 'name, url, type, and domainId required' }, 400);
  }
  
  try {
    const [inserted] = await db.insert(sources).values({
      name,
      url,
      type,
      domainId,
      reliabilityScore: reliabilityScore || 50,
    }).returning();
    
    return c.json({ success: true, data: inserted });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

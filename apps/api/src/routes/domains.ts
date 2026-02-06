import { Hono } from 'hono';
import { db, domains } from '../db';
import { eq } from 'drizzle-orm';

export const domainsRoutes = new Hono();

// List all domains
domainsRoutes.get('/', async (c) => {
  const allDomains = await db.select().from(domains);
  return c.json({ success: true, data: allDomains });
});

// Get domain by slug
domainsRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const [domain] = await db.select().from(domains).where(eq(domains.slug, slug)).limit(1);
  
  if (!domain) {
    return c.json({ success: false, error: 'Domain not found' }, 404);
  }
  
  return c.json({ success: true, data: domain });
});

// Create custom domain (authenticated users)
domainsRoutes.post('/', async (c) => {
  // TODO: Require auth
  // TODO: Validate input
  // TODO: Create domain and trigger AI source generation
  return c.json({ success: false, error: 'Not implemented' }, 501);
});

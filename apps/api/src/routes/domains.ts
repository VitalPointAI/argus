import { Hono } from 'hono';
import { db, domains } from '../db';
import { eq, or, ilike } from 'drizzle-orm';

export const domainsRoutes = new Hono();

// Generate URL-safe slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Multiple hyphens to single
    .replace(/^-|-$/g, ''); // Trim hyphens
}

// List all domains
domainsRoutes.get('/', async (c) => {
  const allDomains = await db.select().from(domains).orderBy(domains.name);
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

// Create new domain (any authenticated user can add)
domainsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  
  if (!userId) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, description } = body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return c.json({ success: false, error: 'Domain name required (min 2 characters)' }, 400);
  }

  const trimmedName = name.trim();
  const slug = generateSlug(trimmedName);

  if (!slug) {
    return c.json({ success: false, error: 'Invalid domain name' }, 400);
  }

  // Check for duplicates (case-insensitive name or matching slug)
  const existing = await db.select()
    .from(domains)
    .where(or(
      ilike(domains.name, trimmedName),
      eq(domains.slug, slug)
    ))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ 
      success: false, 
      error: `Domain "${existing[0].name}" already exists`,
      existingDomain: existing[0],
    }, 409);
  }

  // Create the new domain
  try {
    const [newDomain] = await db.insert(domains).values({
      name: trimmedName,
      slug,
      description: description?.trim() || null,
    }).returning();

    console.log(`[Domains] New domain created: "${trimmedName}" (${slug}) by user ${userId}`);

    return c.json({ 
      success: true, 
      data: newDomain,
      message: 'Domain created! You can now add sources to this domain.',
    });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return c.json({ success: false, error: 'Domain already exists' }, 409);
    }
    throw error;
  }
});

// Check if domain name is available
domainsRoutes.get('/check/:name', async (c) => {
  const name = c.req.param('name');
  const slug = generateSlug(name);

  const existing = await db.select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(or(
      ilike(domains.name, name),
      eq(domains.slug, slug)
    ))
    .limit(1);

  return c.json({
    success: true,
    data: {
      available: existing.length === 0,
      suggestedSlug: slug,
      existingMatch: existing[0] || null,
    },
  });
});

/**
 * Argus Public API v1
 * 
 * This is the external API for integrating with Bastion and other consumers.
 * Designed to be OpenAPI compliant.
 */

import { Hono } from 'hono';
import { db, content, sources, domains, briefings, verifications } from '../db';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

export const apiV1Routes = new Hono();

// API Info
apiV1Routes.get('/', (c) => {
  return c.json({
    name: 'Argus API',
    version: '1.0.0',
    description: 'Strategic Intelligence Platform API',
    endpoints: {
      intelligence: '/api/v1/intelligence',
      content: '/api/v1/content',
      sources: '/api/v1/sources',
      domains: '/api/v1/domains',
      briefings: '/api/v1/briefings',
    },
    documentation: 'https://argus.vitalpoint.ai/docs',
  });
});

/**
 * Intelligence Feed
 * Primary endpoint for OSINT consumers like Bastion
 */
apiV1Routes.get('/intelligence', async (c) => {
  const since = c.req.query('since'); // ISO timestamp
  const domainSlug = c.req.query('domain'); // domain slug
  const minConfidence = parseInt(c.req.query('minConfidence') || '50');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);
  const offset = parseInt(c.req.query('offset') || '0');

  // Build all conditions first
  const conditions: any[] = [gte(content.confidenceScore, minConfidence)];

  if (since) {
    conditions.push(gte(content.fetchedAt, new Date(since)));
  }

  if (domainSlug) {
    conditions.push(eq(domains.slug, domainSlug));
  }

  const items = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      url: content.url,
      author: content.author,
      publishedAt: content.publishedAt,
      fetchedAt: content.fetchedAt,
      confidenceScore: content.confidenceScore,
      source: {
        id: sources.id,
        name: sources.name,
        type: sources.type,
        reliability: sources.reliabilityScore,
      },
      domain: {
        slug: domains.slug,
        name: domains.name,
      },
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(and(...conditions))
    .orderBy(desc(content.fetchedAt))
    .limit(limit)
    .offset(offset);

  // Get total count with same conditions
  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(and(...conditions));

  const [countResult] = await countQuery;

  return c.json({
    success: true,
    data: items,
    meta: {
      total: Number(countResult.count),
      limit,
      offset,
      hasMore: offset + items.length < Number(countResult.count),
    },
  });
});

/**
 * Intelligence by ID with full verification
 */
apiV1Routes.get('/intelligence/:id', async (c) => {
  const id = c.req.param('id');

  const [item] = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      url: content.url,
      author: content.author,
      publishedAt: content.publishedAt,
      fetchedAt: content.fetchedAt,
      confidenceScore: content.confidenceScore,
      verificationId: content.verificationId,
      source: {
        id: sources.id,
        name: sources.name,
        type: sources.type,
        url: sources.url,
        reliability: sources.reliabilityScore,
      },
      domain: {
        slug: domains.slug,
        name: domains.name,
      },
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(eq(content.id, id));

  if (!item) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }

  // Get verification if exists
  let verification = null;
  if (item.verificationId) {
    const [v] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.id, item.verificationId));
    verification = v;
  }

  return c.json({
    success: true,
    data: {
      ...item,
      verification,
    },
  });
});

/**
 * List all domains
 */
apiV1Routes.get('/domains', async (c) => {
  const allDomains = await db.select().from(domains);
  return c.json({ success: true, data: allDomains });
});

/**
 * Get domain with content stats
 */
apiV1Routes.get('/domains/:slug', async (c) => {
  const slug = c.req.param('slug');

  const [domain] = await db.select().from(domains).where(eq(domains.slug, slug));

  if (!domain) {
    return c.json({ success: false, error: 'Domain not found' }, 404);
  }

  // Get content count for this domain
  const [contentCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .where(eq(sources.domainId, domain.id));

  // Get source count
  const [sourceCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sources)
    .where(eq(sources.domainId, domain.id));

  return c.json({
    success: true,
    data: {
      ...domain,
      stats: {
        contentCount: Number(contentCount.count),
        sourceCount: Number(sourceCount.count),
      },
    },
  });
});

/**
 * List sources
 */
apiV1Routes.get('/sources', async (c) => {
  const domain = c.req.query('domain');

  let query = db
    .select({
      id: sources.id,
      name: sources.name,
      type: sources.type,
      url: sources.url,
      reliability: sources.reliabilityScore,
      isActive: sources.isActive,
      lastFetchedAt: sources.lastFetchedAt,
      domain: {
        slug: domains.slug,
        name: domains.name,
      },
    })
    .from(sources)
    .leftJoin(domains, eq(sources.domainId, domains.id));

  if (domain) {
    query = query.where(eq(domains.slug, domain)) as typeof query;
  }

  const allSources = await query;
  return c.json({ success: true, data: allSources });
});

/**
 * Generate LLM-powered briefing
 */
apiV1Routes.post('/briefings/generate', async (c) => {
  // Import dynamically to avoid circular deps
  const { generateLLMBriefing } = await import('../services/intelligence/llm-briefing');
  
  const body = await c.req.json().catch(() => ({}));
  const { 
    type = 'morning', 
    hoursBack = 12, 
    minConfidence = 50,
  } = body;

  try {
    const result = await generateLLMBriefing({
      type,
      hoursBack,
      minConfidence,
    });

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Briefing generation failed',
    }, 500);
  }
});

/**
 * List all briefings (history)
 */
apiV1Routes.get('/briefings', async (c) => {
  const type = c.req.query('type') as 'morning' | 'evening' | 'alert' | undefined;
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions: any[] = [];
  if (type) {
    conditions.push(eq(briefings.type, type));
  }

  const query = conditions.length > 0
    ? db.select().from(briefings).where(and(...conditions)).orderBy(desc(briefings.generatedAt)).limit(limit).offset(offset)
    : db.select().from(briefings).orderBy(desc(briefings.generatedAt)).limit(limit).offset(offset);

  const items = await query;

  // Get total count
  const countQuery = conditions.length > 0
    ? db.select({ count: sql<number>`count(*)` }).from(briefings).where(and(...conditions))
    : db.select({ count: sql<number>`count(*)` }).from(briefings);
  
  const [countResult] = await countQuery;

  return c.json({
    success: true,
    data: items,
    meta: {
      total: Number(countResult.count),
      limit,
      offset,
      hasMore: offset + items.length < Number(countResult.count),
    },
  });
});

/**
 * Get latest briefing
 */
apiV1Routes.get('/briefings/latest', async (c) => {
  const type = c.req.query('type') as 'morning' | 'evening' | 'alert' | undefined;

  let query = db
    .select()
    .from(briefings)
    .orderBy(desc(briefings.generatedAt))
    .limit(1);

  if (type) {
    query = query.where(eq(briefings.type, type)) as typeof query;
  }

  const [latest] = await query;

  if (!latest) {
    return c.json({ success: false, error: 'No briefings found' }, 404);
  }

  return c.json({ success: true, data: latest });
});

/**
 * Get briefing by ID
 */
apiV1Routes.get('/briefings/:id', async (c) => {
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

/**
 * Platform stats
 */
apiV1Routes.get('/stats', async (c) => {
  const [contentTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content);

  const [sourceTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sources);

  const [domainTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(domains);

  const [verified] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NOT NULL`);

  const [avgConf] = await db
    .select({ avg: sql<number>`AVG(${content.confidenceScore})` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NOT NULL`);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [last24h] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(gte(content.fetchedAt, yesterday));

  return c.json({
    success: true,
    data: {
      content: {
        total: Number(contentTotal.count),
        verified: Number(verified.count),
        last24h: Number(last24h.count),
        averageConfidence: avgConf.avg ? Math.round(Number(avgConf.avg)) : null,
      },
      sources: Number(sourceTotal.count),
      domains: Number(domainTotal.count),
      lastUpdated: new Date().toISOString(),
    },
  });
});

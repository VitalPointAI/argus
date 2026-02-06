import { Hono } from 'hono';
import { db, content, sources, domains } from '../db';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

export const contentRoutes = new Hono();

// List content with filters
contentRoutes.get('/', async (c) => {
  const domainSlug = c.req.query('domain');
  const sourceId = c.req.query('sourceId');
  const minConfidence = c.req.query('minConfidence');
  const since = c.req.query('since'); // ISO date string
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let query = db
    .select({
      id: content.id,
      title: content.title,
      url: content.url,
      author: content.author,
      publishedAt: content.publishedAt,
      fetchedAt: content.fetchedAt,
      confidenceScore: content.confidenceScore,
      sourceName: sources.name,
      sourceType: sources.type,
      domainSlug: domains.slug,
      domainName: domains.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .orderBy(desc(content.publishedAt))
    .limit(limit)
    .offset(offset);

  // Apply filters
  const conditions = [];

  if (domainSlug) {
    conditions.push(eq(domains.slug, domainSlug));
  }

  if (sourceId) {
    conditions.push(eq(content.sourceId, sourceId));
  }

  if (minConfidence) {
    conditions.push(gte(content.confidenceScore, parseFloat(minConfidence)));
  }

  if (since) {
    conditions.push(gte(content.publishedAt, new Date(since)));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const items = await query;

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content);

  return c.json({
    success: true,
    data: items,
    pagination: {
      total: Number(countResult.count),
      limit,
      offset,
    },
  });
});

// Get single content item with full body
contentRoutes.get('/:id', async (c) => {
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
      sourceName: sources.name,
      sourceType: sources.type,
      sourceReliability: sources.reliabilityScore,
      domainSlug: domains.slug,
      domainName: domains.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(eq(content.id, id));

  if (!item) {
    return c.json({ success: false, error: 'Content not found' }, 404);
  }

  return c.json({ success: true, data: item });
});

// Get content stats
contentRoutes.get('/stats/overview', async (c) => {
  // Total content
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content);

  // Content by domain
  const byDomain = await db
    .select({
      domain: domains.name,
      slug: domains.slug,
      count: sql<number>`count(*)`,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .groupBy(domains.name, domains.slug);

  // Content in last 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [last24h] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(gte(content.fetchedAt, yesterday));

  // Verified vs unverified
  const [verified] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NOT NULL`);

  return c.json({
    success: true,
    data: {
      total: Number(totalResult.count),
      last24h: Number(last24h.count),
      verified: Number(verified.count),
      unverified: Number(totalResult.count) - Number(verified.count),
      byDomain: byDomain.map((d) => ({
        domain: d.domain,
        slug: d.slug,
        count: Number(d.count),
      })),
    },
  });
});

// Get recent content for a domain
contentRoutes.get('/domain/:slug/recent', async (c) => {
  const slug = c.req.param('slug');
  const limit = parseInt(c.req.query('limit') || '20');

  const items = await db
    .select({
      id: content.id,
      title: content.title,
      url: content.url,
      publishedAt: content.publishedAt,
      confidenceScore: content.confidenceScore,
      sourceName: sources.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(eq(domains.slug, slug))
    .orderBy(desc(content.publishedAt))
    .limit(limit);

  return c.json({ success: true, data: items });
});

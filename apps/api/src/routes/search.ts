import { Hono } from 'hono';
import { db, content, sources, domains } from '../db';
import { eq, desc, sql } from 'drizzle-orm';

export const searchRoutes = new Hono();

// Get available topics for filtering
searchRoutes.get('/topics', async (c) => {
  try {
    // Get all unique topics from articles
    const result = await db.execute(sql`
      SELECT DISTINCT jsonb_array_elements_text(topics) as topic
      FROM content
      WHERE topics != '[]'::jsonb
      ORDER BY topic
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const topics = rows.map((r: any) => r.topic);
    
    return c.json({
      success: true,
      data: { topics },
    });
  } catch (error) {
    console.error('Topics error:', error);
    return c.json({ success: false, error: 'Failed to get topics' }, 500);
  }
});

// Get articles by topic
searchRoutes.get('/by-topic/:topic', async (c) => {
  const topic = c.req.param('topic');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const hoursBack = parseInt(c.req.query('hours') || '72');
  
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    const results = await db.execute(sql`
      SELECT 
        c.id,
        c.title,
        c.summary,
        c.topics,
        c.url,
        c.published_at,
        c.confidence_score,
        s.name as source_name,
        d.name as domain_name,
        d.slug as domain_slug
      FROM content c
      LEFT JOIN sources s ON c.source_id = s.id
      LEFT JOIN domains d ON s.domain_id = d.id
      WHERE c.topics @> ${JSON.stringify([topic])}::jsonb
        AND c.fetched_at >= ${since}
      ORDER BY c.published_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
    
    const rows = Array.isArray(results) ? results : (results as any).rows || [];
    
    return c.json({
      success: true,
      data: {
        topic,
        articles: rows,
        pagination: { limit, offset },
      },
    });
  } catch (error) {
    console.error('By-topic error:', error);
    return c.json({ success: false, error: 'Failed to get articles by topic' }, 500);
  }
});

// Full-text search for articles
searchRoutes.get('/', async (c) => {
  const query = c.req.query('q');
  const domainSlug = c.req.query('domain'); // Source region/perspective
  const topic = c.req.query('topic'); // What the article is about
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  if (!query || query.length < 2) {
    return c.json({
      success: false,
      error: 'Query must be at least 2 characters',
    }, 400);
  }

  try {
    // Build the search query using PostgreSQL full-text search
    const searchQuery = query
      .trim()
      .split(/\s+/)
      .map(term => term + ':*')  // Prefix matching
      .join(' & ');

    // Search with ranking
    const results = await db.execute(sql`
      SELECT 
        c.id,
        c.title,
        c.summary,
        c.topics,
        c.url,
        c.published_at,
        c.confidence_score,
        ts_rank(c.search_vector, to_tsquery('english', ${searchQuery})) as rank,
        ts_headline('english', c.body, to_tsquery('english', ${searchQuery}), 
          'MaxWords=50, MinWords=20, StartSel=**, StopSel=**') as snippet,
        s.name as source_name,
        d.name as domain_name,
        d.slug as domain_slug
      FROM content c
      LEFT JOIN sources s ON c.source_id = s.id
      LEFT JOIN domains d ON s.domain_id = d.id
      WHERE c.search_vector @@ to_tsquery('english', ${searchQuery})
      ${domainSlug ? sql`AND d.slug = ${domainSlug}` : sql``}
      ${topic ? sql`AND c.topics @> ${JSON.stringify([topic])}::jsonb` : sql``}
      ORDER BY rank DESC, c.confidence_score DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM content c
      LEFT JOIN sources s ON c.source_id = s.id
      LEFT JOIN domains d ON s.domain_id = d.id
      WHERE c.search_vector @@ to_tsquery('english', ${searchQuery})
      ${domainSlug ? sql`AND d.slug = ${domainSlug}` : sql``}
    `);

    const total = (countResult as any)?.[0]?.total || 0;

    // Handle different Drizzle return types
    const rows = Array.isArray(results) ? results : (results as any).rows || [];

    return c.json({
      success: true,
      data: {
        query,
        total,
        results: rows,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    }, 500);
  }
});

// Search suggestions (autocomplete)
searchRoutes.get('/suggest', async (c) => {
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json({ success: true, data: { suggestions: [] } });
  }

  try {
    // Get distinct matching titles
    const results = await db.execute(sql`
      SELECT DISTINCT title
      FROM content
      WHERE title ILIKE ${`%${query}%`}
      ORDER BY title
      LIMIT 10
    `);

    return c.json({
      success: true,
      data: {
        suggestions: results.rows.map((r: any) => r.title),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Suggestion failed',
    }, 500);
  }
});

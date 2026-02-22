/**
 * Global Intelligence Map API
 */

import { Hono } from 'hono';
import { db, content, sources } from '../db';
import { desc, sql, gte, and } from 'drizzle-orm';
import { 
  extractLocations, 
  getLocationCoords, 
  getLocationName,
  MapDataPoint,
  LOCATION_COORDS 
} from '../services/intelligence/location-extractor';

const mapRoutes = new Hono();

/**
 * Get aggregated map data for visualization
 */
mapRoutes.get('/data', async (c) => {
  const hoursBack = parseInt(c.req.query('hours') || '48');
  const topic = c.req.query('topic'); // Optional topic filter
  
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  try {
    // Get recent articles with locations
    let query = db.select({
      id: content.id,
      title: content.title,
      topics: content.topics,
      locations: content.locations,
      publishedAt: content.publishedAt,
    })
    .from(content)
    .where(and(
      gte(content.fetchedAt, since),
      sql`${content.locations} != '[]'::jsonb`
    ))
    .orderBy(desc(content.publishedAt))
    .limit(1000);

    const articles = await query;
    
    // Aggregate by location
    const locationMap = new Map<string, {
      articleCount: number;
      topics: Map<string, number>;
      articles: Array<{ id: string; title: string; topic: string; date: string }>;
    }>();
    
    for (const article of articles) {
      const locations = (article.locations as string[]) || [];
      const topics = (article.topics as string[]) || [];
      const primaryTopic = topics[0] || 'General';
      
      // Filter by topic if specified
      if (topic && !topics.includes(topic)) continue;
      
      for (const loc of locations) {
        if (!locationMap.has(loc)) {
          locationMap.set(loc, { articleCount: 0, topics: new Map(), articles: [] });
        }
        const data = locationMap.get(loc)!;
        data.articleCount++;
        
        // Count topics
        for (const t of topics) {
          data.topics.set(t, (data.topics.get(t) || 0) + 1);
        }
        
        // Keep recent articles (max 10)
        if (data.articles.length < 10) {
          data.articles.push({
            id: article.id,
            title: article.title,
            topic: primaryTopic,
            date: article.publishedAt?.toISOString() || '',
          });
        }
      }
    }
    
    // Calculate trends (compare to previous period)
    const previousPeriodStart = new Date(since.getTime() - hoursBack * 60 * 60 * 1000);
    const previousArticles = await db.select({
      locations: content.locations,
    })
    .from(content)
    .where(and(
      gte(content.fetchedAt, previousPeriodStart),
      sql`${content.fetchedAt} < ${since}`,
      sql`${content.locations} != '[]'::jsonb`
    ))
    .limit(1000);
    
    const previousCounts = new Map<string, number>();
    for (const article of previousArticles) {
      const locations = (article.locations as string[]) || [];
      for (const loc of locations) {
        previousCounts.set(loc, (previousCounts.get(loc) || 0) + 1);
      }
    }
    
    // Build response
    const mapData: MapDataPoint[] = [];
    
    for (const [code, data] of locationMap) {
      const coords = getLocationCoords(code);
      if (!coords) continue;
      
      const prevCount = previousCounts.get(code) || 0;
      const trend = data.articleCount > prevCount * 1.2 ? 'up' 
                  : data.articleCount < prevCount * 0.8 ? 'down' 
                  : 'stable';
      
      // Calculate importance based on article count and topic mix
      const hasConflict = data.topics.has('Military') || data.topics.has('Defense') || data.topics.has('Nuclear');
      const importance = data.articleCount >= 50 || (data.articleCount >= 20 && hasConflict) ? 'critical'
                       : data.articleCount >= 20 || hasConflict ? 'high'
                       : data.articleCount >= 5 ? 'medium'
                       : 'low';
      
      mapData.push({
        code,
        name: getLocationName(code),
        lat: coords[0],
        lng: coords[1],
        articleCount: data.articleCount,
        topics: Object.fromEntries(data.topics),
        trend,
        importance,
        recentArticles: data.articles.slice(0, 5),
      });
    }
    
    // Sort by article count
    mapData.sort((a, b) => b.articleCount - a.articleCount);
    
    // Get topic summary
    const topicCounts = new Map<string, { current: number; previous: number }>();
    for (const article of articles) {
      const topics = (article.topics as string[]) || [];
      for (const t of topics) {
        if (!topicCounts.has(t)) {
          topicCounts.set(t, { current: 0, previous: 0 });
        }
        topicCounts.get(t)!.current++;
      }
    }
    for (const article of previousArticles) {
      // We don't have topics from previous query, skip for now
    }
    
    const topicSummary = Array.from(topicCounts.entries())
      .map(([topic, counts]) => ({
        topic,
        count: counts.current,
        trend: 'stable' as const, // Would need previous topics to calculate
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    
    return c.json({
      success: true,
      data: {
        locations: mapData,
        topicSummary,
        meta: {
          hoursAnalyzed: hoursBack,
          totalArticles: articles.length,
          uniqueLocations: mapData.length,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[Map] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Get articles for a specific location
 */
mapRoutes.get('/location/:code', async (c) => {
  const code = c.req.param('code');
  const limit = parseInt(c.req.query('limit') || '20');
  
  try {
    const articles = await db.select({
      id: content.id,
      title: content.title,
      url: content.url,
      topics: content.topics,
      summary: content.summary,
      publishedAt: content.publishedAt,
      confidenceScore: content.confidenceScore,
      sourceName: sources.name,
    })
    .from(content)
    .leftJoin(sources, sql`${content.sourceId} = ${sources.id}`)
    .where(sql`${content.locations} @> ${JSON.stringify([code])}::jsonb`)
    .orderBy(desc(content.publishedAt))
    .limit(limit);
    
    return c.json({
      success: true,
      data: {
        code,
        name: getLocationName(code),
        coords: getLocationCoords(code),
        articles,
      },
    });
  } catch (error) {
    console.error('[Map] Location error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Backfill locations for existing articles
 */
mapRoutes.post('/backfill', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  
  try {
    // Get articles without locations
    const articles = await db.select({
      id: content.id,
      title: content.title,
      body: content.body,
    })
    .from(content)
    .where(sql`${content.locations} = '[]'::jsonb`)
    .limit(limit);
    
    let updated = 0;
    for (const article of articles) {
      const { locations } = extractLocations(article.title, article.body);
      if (locations.length > 0) {
        await db.execute(
          sql`UPDATE content SET locations = ${JSON.stringify(locations)}::jsonb WHERE id = ${article.id}`
        );
        updated++;
      }
    }
    
    return c.json({
      success: true,
      data: {
        processed: articles.length,
        updated,
      },
    });
  } catch (error) {
    console.error('[Map] Backfill error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default mapRoutes;

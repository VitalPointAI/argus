import { Hono } from 'hono';
import { ingestRSSSource, ingestAllRSSSources } from '../services/ingestion/rss';
import { db, sources } from '../db';
import { eq } from 'drizzle-orm';

export const ingestionRoutes = new Hono();

// Ingest a specific source
ingestionRoutes.post('/:sourceId', async (c) => {
  const sourceId = c.req.param('sourceId');
  
  try {
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    let count = 0;
    if (source.type === 'rss') {
      count = await ingestRSSSource(sourceId);
    } else {
      return c.json({ success: false, error: `Ingestion not implemented for type: ${source.type}` }, 501);
    }
    
    return c.json({ success: true, data: { sourceId, itemsIngested: count } });
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// Ingest all RSS sources
ingestionRoutes.post('/rss/all', async (c) => {
  try {
    const results = await ingestAllRSSSources();
    const totalIngested = results.reduce((sum, r) => sum + r.count, 0);
    
    return c.json({ 
      success: true, 
      data: { 
        sourcesProcessed: results.length,
        totalItemsIngested: totalIngested,
        details: results 
      } 
    });
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// Get ingestion status
ingestionRoutes.get('/status', async (c) => {
  const allSources = await db.select().from(sources);
  
  const byType = allSources.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const lastFetched = allSources
    .filter(s => s.lastFetchedAt)
    .sort((a, b) => (b.lastFetchedAt?.getTime() || 0) - (a.lastFetchedAt?.getTime() || 0))
    .slice(0, 5)
    .map(s => ({ id: s.id, name: s.name, lastFetchedAt: s.lastFetchedAt }));
  
  return c.json({
    success: true,
    data: {
      totalSources: allSources.length,
      byType,
      recentlyFetched: lastFetched,
    }
  });
});

import { Hono } from 'hono';
import { ingestRSSSource, ingestAllRSSSources } from '../services/ingestion/rss';
import { ingestYouTubeVideo, ingestAllYouTubeSources } from '../services/ingestion/youtube';
import { ingestWebSource, ingestAllWebSources } from '../services/ingestion/web';
import { db, sources } from '../db';
import { eq } from 'drizzle-orm';

export const ingestionRoutes = new Hono();

// ============================================
// SPECIFIC ROUTES FIRST (before :sourceId)
// ============================================

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

// Ingest all YouTube sources
ingestionRoutes.post('/youtube/all', async (c) => {
  try {
    const results = await ingestAllYouTubeSources();
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

// Ingest all Web sources
ingestionRoutes.post('/web/all', async (c) => {
  try {
    const results = await ingestAllWebSources();
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

// Ingest a single YouTube video by URL
ingestionRoutes.post('/youtube/video', async (c) => {
  try {
    const { url, sourceId: targetSourceId } = await c.req.json();
    
    if (!url) {
      return c.json({ success: false, error: 'YouTube URL is required' }, 400);
    }
    
    const result = await ingestYouTubeVideo(url, targetSourceId);
    
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    
    return c.json({ success: true, data: result.video });
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// Ingest ALL sources (RSS + YouTube + Web)
ingestionRoutes.post('/all', async (c) => {
  try {
    const [rssResults, ytResults, webResults] = await Promise.all([
      ingestAllRSSSources(),
      ingestAllYouTubeSources(),
      ingestAllWebSources(),
    ]);
    
    return c.json({ 
      success: true, 
      data: { 
        rss: {
          sourcesProcessed: rssResults.length,
          totalItemsIngested: rssResults.reduce((sum, r) => sum + r.count, 0),
        },
        youtube: {
          sourcesProcessed: ytResults.length,
          totalItemsIngested: ytResults.reduce((sum, r) => sum + r.count, 0),
        },
        web: {
          sourcesProcessed: webResults.length,
          totalItemsIngested: webResults.reduce((sum, r) => sum + r.count, 0),
        },
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

// ============================================
// PARAMETERIZED ROUTE LAST
// ============================================

// Ingest a specific source by ID
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
    } else if (source.type === 'youtube') {
      const result = await ingestYouTubeVideo(source.url, sourceId);
      count = result.success ? 1 : 0;
    } else if (source.type === 'web') {
      count = await ingestWebSource(sourceId);
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

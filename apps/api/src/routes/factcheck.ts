import { Hono } from 'hono';
import { 
  factCheckArticle, 
  extractClaims, 
  searchEvidence, 
  embedContent,
  embedUnembeddedContent 
} from '../services/factcheck';
import { db, content } from '../db';
import { eq, sql } from 'drizzle-orm';

export const factcheckRoutes = new Hono();

// Fact-check a specific article
factcheckRoutes.post('/article/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const results = await factCheckArticle(contentId);
    return c.json({ 
      success: true, 
      data: {
        contentId,
        claimsChecked: results.length,
        results,
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Extract claims from an article (without full fact-check)
factcheckRoutes.post('/extract/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const [article] = await db.select().from(content).where(eq(content.id, contentId));
    
    if (!article) {
      return c.json({ success: false, error: 'Article not found' }, 404);
    }

    const claims = await extractClaims(article.title, article.body);
    return c.json({ 
      success: true, 
      data: {
        contentId,
        title: article.title,
        claims,
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Search for evidence related to a claim
factcheckRoutes.post('/search', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { claim, limit = 10 } = body;

  if (!claim) {
    return c.json({ success: false, error: 'claim is required' }, 400);
  }

  try {
    const evidence = await searchEvidence(claim, limit);
    return c.json({ 
      success: true, 
      data: {
        claim,
        evidenceCount: evidence.length,
        evidence,
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Embed a single article
factcheckRoutes.post('/embed/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const success = await embedContent(contentId);
    return c.json({ success, data: { contentId, embedded: success } });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Batch embed content without embeddings
factcheckRoutes.post('/embed/batch', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const count = await embedUnembeddedContent(limit);
    return c.json({ 
      success: true, 
      data: { 
        embedded: count,
        requested: limit,
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get embedding stats
factcheckRoutes.get('/embed/stats', async (c) => {
  const [embedded] = await db.execute(sql`
    SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL
  `) as any[];
  
  const [total] = await db.execute(sql`
    SELECT COUNT(*) as count FROM content
  `) as any[];

  return c.json({
    success: true,
    data: {
      embedded: Number(embedded?.count || 0),
      total: Number(total?.count || 0),
      remaining: Number(total?.count || 0) - Number(embedded?.count || 0),
    },
  });
});

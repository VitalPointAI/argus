import { Hono } from 'hono';
import { verifyContent, verifyUnverifiedContent } from '../services/verification/engine';
import { db, verifications, content } from '../db';
import { eq, sql } from 'drizzle-orm';

export const verificationRoutes = new Hono();

// Verify a specific content item
verificationRoutes.post('/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const result = await verifyContent(contentId);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Batch verify unverified content
verificationRoutes.post('/batch', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const result = await verifyUnverifiedContent(limit);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get verification details for a content item
verificationRoutes.get('/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  const [item] = await db
    .select()
    .from(content)
    .where(eq(content.id, contentId));

  if (!item) {
    return c.json({ success: false, error: 'Content not found' }, 404);
  }

  if (!item.verificationId) {
    return c.json({ success: false, error: 'Content not yet verified' }, 404);
  }

  const [verification] = await db
    .select()
    .from(verifications)
    .where(eq(verifications.id, item.verificationId));

  return c.json({
    success: true,
    data: {
      contentId,
      contentTitle: item.title,
      verification,
    },
  });
});

// Get verification stats
verificationRoutes.get('/stats/overview', async (c) => {
  // Total verified
  const [verified] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NOT NULL`);

  // Total unverified
  const [unverified] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NULL`);

  // Average confidence
  const [avgConf] = await db
    .select({ avg: sql<number>`AVG(${content.confidenceScore})` })
    .from(content)
    .where(sql`${content.confidenceScore} IS NOT NULL`);

  // Distribution by confidence range
  const highConf = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} >= 70`);

  const medConf = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} >= 40 AND ${content.confidenceScore} < 70`);

  const lowConf = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(sql`${content.confidenceScore} < 40`);

  return c.json({
    success: true,
    data: {
      verified: Number(verified.count),
      unverified: Number(unverified.count),
      averageConfidence: avgConf.avg ? Math.round(Number(avgConf.avg)) : null,
      distribution: {
        high: Number(highConf[0].count),
        medium: Number(medConf[0].count),
        low: Number(lowConf[0].count),
      },
    },
  });
});

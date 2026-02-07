import { Hono } from 'hono';
import { verifyContent, verifyUnverifiedContent } from '../services/verification/engine';
import { llmVerifyContent, llmBatchVerify } from '../services/verification/llm-verify';
import { db, verifications, content, articleClaims, sources } from '../db';
import { eq, sql } from 'drizzle-orm';

export const verificationRoutes = new Hono();

// On-demand claim extraction - only runs when user explicitly requests
// This is the primary endpoint for user-initiated verification
verificationRoutes.post('/verify-claims/:contentId', async (c) => {
  const contentId = c.req.param('contentId');
  const forceRefresh = c.req.query('force') === 'true';

  try {
    // Get content with source info
    const [item] = await db
      .select({
        id: content.id,
        title: content.title,
        confidenceScore: content.confidenceScore,
        sourceId: content.sourceId,
        sourceName: sources.name,
        sourceReliability: sources.reliabilityScore,
      })
      .from(content)
      .leftJoin(sources, eq(content.sourceId, sources.id))
      .where(eq(content.id, contentId));

    if (!item) {
      return c.json({ success: false, error: 'Content not found' }, 404);
    }

    // Check if claims already exist (cache hit) - don't re-extract unless forced
    if (!forceRefresh) {
      const existingClaims = await db
        .select()
        .from(articleClaims)
        .where(eq(articleClaims.contentId, contentId));

      if (existingClaims.length > 0) {
        return c.json({
          success: true,
          cached: true,
          data: {
            contentId,
            contentTitle: item.title,
            overallConfidence: item.confidenceScore,
            claims: existingClaims.map(claim => ({
              id: claim.id,
              text: claim.claimText,
              confidence: claim.confidence,
              status: claim.verificationStatus,
              method: claim.verificationMethod,
              verifiedBy: claim.verifiedBy,
              contradictedBy: claim.contradictedBy,
              extractedAt: claim.extractedAt,
            })),
          },
        });
      }
    }

    // Skip suggestion for high-confidence articles from trusted sources
    const isTrustedSource = (item.sourceReliability || 0) >= 70;
    const isHighConfidence = (item.confidenceScore || 0) >= 80;

    if (isTrustedSource && isHighConfidence && !forceRefresh) {
      return c.json({
        success: true,
        skipSuggested: true,
        reason: 'Article has high confidence score from trusted source',
        data: {
          contentId,
          contentTitle: item.title,
          overallConfidence: item.confidenceScore,
          sourceName: item.sourceName,
          sourceReliability: item.sourceReliability,
          message: 'Verification may not be necessary for this high-confidence article from a trusted source. Use ?force=true to verify anyway.',
        },
      });
    }

    // Extract claims using LLM
    const result = await llmVerifyContent(contentId);

    // Fetch the newly inserted claims
    const newClaims = await db
      .select()
      .from(articleClaims)
      .where(eq(articleClaims.contentId, contentId));

    return c.json({
      success: true,
      cached: false,
      data: {
        contentId,
        contentTitle: item.title,
        overallConfidence: result.confidenceScore,
        summary: result.summary,
        reasoning: result.reasoning,
        credibilityIndicators: result.credibilityIndicators,
        biasIndicators: result.biasIndicators,
        claims: newClaims.map(claim => ({
          id: claim.id,
          text: claim.claimText,
          confidence: claim.confidence,
          status: claim.verificationStatus,
          method: claim.verificationMethod,
          verifiedBy: claim.verifiedBy,
          contradictedBy: claim.contradictedBy,
          extractedAt: claim.extractedAt,
        })),
      },
    });
  } catch (error) {
    console.error(`Verify claims error for ${contentId}:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Batch verify unverified content (must be before :contentId route)
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

// LLM-powered batch verification (more thorough but expensive)
verificationRoutes.post('/llm/batch', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');

  try {
    const result = await llmBatchVerify(limit);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// LLM-powered verification for a specific content item
verificationRoutes.post('/llm/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const result = await llmVerifyContent(contentId);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Verify a specific content item (heuristic)
verificationRoutes.post('/content/:contentId', async (c) => {
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

// Get verification details for a content item
verificationRoutes.get('/content/:contentId', async (c) => {
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

// Extract claims from recent content that doesn't have claims yet
verificationRoutes.post('/claims/extract-recent', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const minConfidence = parseInt(c.req.query('minConfidence') || '60');

  try {
    // Find recent content with confidence scores but no claims
    const recentContent = await db
      .select({ id: content.id, title: content.title })
      .from(content)
      .where(sql`${content.confidenceScore} >= ${minConfidence} 
        AND ${content.id} NOT IN (SELECT DISTINCT content_id FROM article_claims)
        AND LENGTH(${content.body}) > 200`)
      .orderBy(sql`${content.publishedAt} DESC`)
      .limit(limit);

    let extracted = 0;
    let errors = 0;
    const results: any[] = [];

    for (const item of recentContent) {
      try {
        const result = await llmVerifyContent(item.id);
        extracted++;
        results.push({ 
          id: item.id, 
          title: item.title,
          claimsCount: result.factualClaims?.length || 0 
        });
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`Claim extraction error for ${item.id}:`, e);
        errors++;
      }
    }

    return c.json({ 
      success: true, 
      data: { 
        extracted, 
        errors, 
        totalFound: recentContent.length,
        results 
      } 
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get claims for a content item
verificationRoutes.get('/claims/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  // Get content info
  const [item] = await db
    .select({
      id: content.id,
      title: content.title,
      confidenceScore: content.confidenceScore,
    })
    .from(content)
    .where(eq(content.id, contentId));

  if (!item) {
    return c.json({ success: false, error: 'Content not found' }, 404);
  }

  // Get claims
  const claims = await db
    .select()
    .from(articleClaims)
    .where(eq(articleClaims.contentId, contentId));

  return c.json({
    success: true,
    data: {
      contentId,
      contentTitle: item.title,
      overallConfidence: item.confidenceScore,
      claims: claims.map(claim => ({
        id: claim.id,
        text: claim.claimText,
        confidence: claim.confidence,
        status: claim.verificationStatus,
        method: claim.verificationMethod,
        verifiedBy: claim.verifiedBy,
        contradictedBy: claim.contradictedBy,
        extractedAt: claim.extractedAt,
      })),
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

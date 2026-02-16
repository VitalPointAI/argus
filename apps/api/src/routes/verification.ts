import { Hono } from 'hono';
import { verifyContent, verifyUnverifiedContent } from '../services/verification/engine';
import { llmVerifyContent, llmBatchVerify } from '../services/verification/llm-verify';
import { crossReferenceClaim, crossReferenceContent, batchCrossReference, GROUND_TRUTH_SOURCES } from '../services/verification/cross-reference';
import { analyzeContentBias, batchBiasAnalysis, getSourceBiasSummary } from '../services/verification/bias-detection';
import { generateVerificationTrail, getVerificationSummary } from '../services/verification/trail';
import { ensureFullText } from '../services/verification/full-text';
import { db, verifications, content, articleClaims, sources, crossReferenceResults } from '../db';
import { eq, sql, desc } from 'drizzle-orm';

export const verificationRoutes = new Hono();

// URL-based deep verification - accepts a URL and finds/verifies the content
verificationRoutes.post('/deep', async (c) => {
  const body = await c.req.json();
  const { url } = body;

  if (!url) {
    return c.json({ success: false, error: 'URL is required' }, 400);
  }

  try {
    // Find content by URL
    const [item] = await db
      .select({
        id: content.id,
        title: content.title,
        url: content.url,
        confidenceScore: content.confidenceScore,
        sourceId: content.sourceId,
      })
      .from(content)
      .where(eq(content.url, url))
      .limit(1);

    if (!item) {
      // URL not in our database - do a basic external verification
      // For now, return a simulated result based on URL analysis
      const domain = new URL(url).hostname.replace('www.', '');
      
      // Check if it's a known reliable source
      const knownSources: Record<string, number> = {
        'reuters.com': 85,
        'apnews.com': 85,
        'bbc.com': 80,
        'bbc.co.uk': 80,
        'npr.org': 75,
        'pbs.org': 75,
        'economist.com': 75,
        'ft.com': 75,
        'wsj.com': 70,
        'nytimes.com': 70,
        'washingtonpost.com': 70,
        'theguardian.com': 70,
      };
      
      const baseScore = knownSources[domain] || 50;
      
      return c.json({
        success: true,
        data: {
          url,
          title: `Article from ${domain}`,
          confidence: baseScore,
          verificationStatus: baseScore >= 70 ? 'Trusted Source' : baseScore >= 50 ? 'Unverified' : 'Unknown Source',
          crossReferences: [],
          sourceReliability: {
            name: domain,
            score: baseScore,
            articlesAnalyzed: 0,
          },
          biasAnalysis: null,
          note: 'URL not in database - showing source-level trust only',
        },
      });
    }

    // Get source info
    const [source] = await db
      .select({
        name: sources.name,
        reliabilityScore: sources.reliabilityScore,
      })
      .from(sources)
      .where(eq(sources.id, item.sourceId));

    // Get cross-reference results if any
    const crossRefs = await db
      .select({
        verificationSource: crossReferenceResults.verificationSource,
        matchType: crossReferenceResults.matchType,
        matchedUrl: crossReferenceResults.matchedUrl,
        matchedTitle: crossReferenceResults.matchedTitle,
      })
      .from(crossReferenceResults)
      .where(eq(crossReferenceResults.contentId, item.id))
      .limit(5);

    return c.json({
      success: true,
      data: {
        url: item.url,
        title: item.title,
        confidence: item.confidenceScore || 50,
        verificationStatus: (item.confidenceScore || 50) >= 70 ? 'Verified' : (item.confidenceScore || 50) >= 40 ? 'Partially Verified' : 'Unverified',
        crossReferences: crossRefs.map(ref => ({
          source: ref.verificationSource,
          title: ref.matchedTitle || 'Related article',
          url: ref.matchedUrl || '#',
          agrees: ref.matchType === 'confirms' || ref.matchType === 'corroborates',
        })),
        sourceReliability: source ? {
          name: source.name,
          score: source.reliabilityScore || 50,
          articlesAnalyzed: 100, // TODO: get actual count
        } : null,
        biasAnalysis: null, // TODO: include if available
      },
    });
  } catch (error) {
    console.error('URL verification error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    }, 500);
  }
});

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

// ============ PHASE 4: Enhanced Verification ============

// Cross-reference a single claim across other sources
verificationRoutes.post('/cross-reference/claim/:claimId', async (c) => {
  const claimId = c.req.param('claimId');
  const daysBack = parseInt(c.req.query('daysBack') || '7');

  try {
    const result = await crossReferenceClaim(claimId, daysBack);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Cross-reference all claims for a content item
verificationRoutes.post('/cross-reference/content/:contentId', async (c) => {
  const contentId = c.req.param('contentId');
  const daysBack = parseInt(c.req.query('daysBack') || '7');

  try {
    const result = await crossReferenceContent(contentId, daysBack);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Batch cross-reference unverified claims
verificationRoutes.post('/cross-reference/batch', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const daysBack = parseInt(c.req.query('daysBack') || '7');

  try {
    const result = await batchCrossReference(limit, daysBack);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get cross-reference stats
verificationRoutes.get('/cross-reference/stats', async (c) => {
  try {
    const [total] = await db
      .select({ count: sql<number>`count(*)` })
      .from(crossReferenceResults);

    const [accurate] = await db
      .select({ count: sql<number>`count(*)` })
      .from(crossReferenceResults)
      .where(sql`was_accurate = true`);

    const recentRefs = await db
      .select({
        verificationSource: crossReferenceResults.verificationSource,
        count: sql<number>`count(*)`,
      })
      .from(crossReferenceResults)
      .groupBy(crossReferenceResults.verificationSource)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return c.json({
      success: true,
      data: {
        totalReferences: Number(total.count),
        accurateReferences: Number(accurate.count),
        accuracyRate: total.count ? Math.round((Number(accurate.count) / Number(total.count)) * 100) : 0,
        topCorroboratingSources: recentRefs,
        groundTruthSources: GROUND_TRUTH_SOURCES,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Analyze content for bias
verificationRoutes.post('/bias/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const result = await analyzeContentBias(contentId);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Batch bias analysis
verificationRoutes.post('/bias/batch', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');

  try {
    const result = await batchBiasAnalysis(limit);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get source bias summary
verificationRoutes.get('/bias/source/:sourceId', async (c) => {
  const sourceId = c.req.param('sourceId');

  try {
    const result = await getSourceBiasSummary(sourceId);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get full verification trail (explains confidence score)
verificationRoutes.get('/trail/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const trail = await generateVerificationTrail(contentId);
    return c.json({ success: true, data: trail });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get verification summary (lightweight for lists)
verificationRoutes.get('/summary/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    const summary = await getVerificationSummary(contentId);
    return c.json({ success: true, data: summary });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Deep verification: extract claims + cross-reference + bias analysis
verificationRoutes.post('/deep/:contentId', async (c) => {
  const contentId = c.req.param('contentId');

  try {
    // Step 0: Ensure we have full article text
    const fullTextResult = await ensureFullText(contentId);
    
    // Step 1: Extract claims via LLM
    const claimResult = await llmVerifyContent(contentId);
    
    // Step 2: Cross-reference claims (skip if no claims extracted)
    let crossRefResult = null;
    try {
      crossRefResult = await crossReferenceContent(contentId, 7);
    } catch (e) {
      // No claims to cross-reference - that's okay for short articles
      crossRefResult = {
        contentId,
        claimsProcessed: 0,
        verified: 0,
        partiallyVerified: 0,
        unverified: 0,
        contradicted: 0,
        overallConfidence: claimResult.confidenceScore || 50,
        claims: [],
        note: 'No claims extracted for cross-referencing',
      };
    }
    
    // Step 3: Analyze bias
    const biasResult = await analyzeContentBias(contentId);
    
    // Step 4: Generate trail
    const trail = await generateVerificationTrail(contentId);

    return c.json({
      success: true,
      data: {
        contentId,
        fullTextFetched: fullTextResult.wasFetched,
        bodyLength: fullTextResult.newLength,
        claims: claimResult,
        crossReference: crossRefResult,
        bias: biasResult,
        trail,
        finalConfidence: trail.finalConfidenceScore,
        recommendation: trail.summary.recommendation,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

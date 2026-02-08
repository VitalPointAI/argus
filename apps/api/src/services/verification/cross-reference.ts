/**
 * Cross-Reference Verification Engine
 * 
 * Searches for corroborating sources for claims across the article database.
 * Claims verified by 3+ independent sources get high confidence.
 * Wire services (AP, Reuters) count as ground truth.
 */

import { db, content, sources, articleClaims, crossReferenceResults } from '../../db';
import { eq, sql, and, ne, gte, desc, ilike, or } from 'drizzle-orm';

const NEARAI_API_KEY = process.env.NEARAI_API_KEY;

// Ground truth sources get extra weight
const GROUND_TRUTH_SOURCES = [
  'Associated Press',
  'AP News', 
  'Reuters',
  'Reuters Business',
  'AFP',
  'Agence France-Presse',
];

interface CrossReferenceResult {
  claimId: string;
  claimText: string;
  originalSource: string;
  verifiedBy: Array<{
    sourceName: string;
    sourceId: string;
    contentId: string;
    title: string;
    similarity: number;
    isGroundTruth: boolean;
  }>;
  contradictedBy: Array<{
    sourceName: string;
    sourceId: string;
    contentId: string;
    title: string;
    contradiction: string;
  }>;
  verificationStatus: 'verified' | 'partially_verified' | 'unverified' | 'contradicted';
  confidence: number;
  groundTruthMatch: boolean;
}

/**
 * Extract key terms from a claim for search
 */
function extractSearchTerms(claim: string): string[] {
  // Remove common words, keep substantive terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'that', 'which', 'who', 'whom', 'this', 'these', 'those', 'it', 'its',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'also', 'than', 'when', 'where', 'why', 'how', 'all',
    'each', 'every', 'any', 'some', 'such', 'more', 'most', 'other',
    'said', 'says', 'according', 'reported', 'announced', 'stated',
  ]);

  const words = claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Return top unique terms
  return [...new Set(words)].slice(0, 10);
}

/**
 * Search for articles containing similar claims
 */
async function findCorroboratingSources(
  claim: string,
  excludeContentId: string,
  excludeSourceId: string,
  daysBack: number = 7
): Promise<Array<{
  contentId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  body: string;
  isGroundTruth: boolean;
}>> {
  const terms = extractSearchTerms(claim);
  if (terms.length < 2) return [];

  // Build full-text search query
  const searchQuery = terms.join(' & ');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Search for articles from different sources
  const matches = await db
    .select({
      contentId: content.id,
      sourceId: content.sourceId,
      sourceName: sources.name,
      title: content.title,
      body: content.body,
    })
    .from(content)
    .innerJoin(sources, eq(content.sourceId, sources.id))
    .where(
      and(
        ne(content.id, excludeContentId),
        ne(content.sourceId, excludeSourceId),
        gte(content.publishedAt, cutoffDate),
        sql`to_tsvector('english', ${content.title} || ' ' || ${content.body}) @@ to_tsquery('english', ${searchQuery})`
      )
    )
    .orderBy(desc(content.publishedAt))
    .limit(20);

  return matches.map(m => ({
    ...m,
    isGroundTruth: GROUND_TRUTH_SOURCES.some(gt => 
      m.sourceName.toLowerCase().includes(gt.toLowerCase())
    ),
  }));
}

/**
 * Use LLM to check if a candidate article corroborates or contradicts a claim
 */
async function checkClaimMatch(
  claim: string,
  candidateTitle: string,
  candidateBody: string
): Promise<{
  corroborates: boolean;
  contradicts: boolean;
  similarity: number;
  contradiction?: string;
}> {
  if (!NEARAI_API_KEY) {
    // Fallback: simple keyword matching
    const claimTerms = extractSearchTerms(claim);
    const bodyLower = candidateBody.toLowerCase();
    const matchCount = claimTerms.filter(t => bodyLower.includes(t)).length;
    const similarity = matchCount / claimTerms.length;
    
    return {
      corroborates: similarity > 0.6,
      contradicts: false,
      similarity,
    };
  }

  const prompt = `Analyze if this article corroborates or contradicts the given claim.

CLAIM: "${claim}"

ARTICLE TITLE: ${candidateTitle}
ARTICLE EXCERPT: ${candidateBody.substring(0, 1500)}

Respond with JSON only:
{
  "corroborates": true/false,
  "contradicts": true/false,
  "similarity": 0.0-1.0,
  "contradiction": "if contradicts, explain how" 
}

- corroborates = article supports the same factual claim
- contradicts = article states the opposite or incompatible facts
- similarity = how closely the article discusses the same topic/claim
- Both can be false if article is unrelated`;

  try {
    const response = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEARAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3.1',
        messages: [
          { role: 'system', content: 'You are a fact-checking analyst. Compare claims and article content precisely.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const llmContent = data.choices?.[0]?.message?.content || '';
    const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Claim match check failed:', error);
  }

  return { corroborates: false, contradicts: false, similarity: 0 };
}

/**
 * Cross-reference a single claim across the database
 */
export async function crossReferenceClaim(
  claimId: string,
  daysBack: number = 7
): Promise<CrossReferenceResult> {
  // Get the claim and its source
  const [claim] = await db
    .select({
      id: articleClaims.id,
      contentId: articleClaims.contentId,
      claimText: articleClaims.claimText,
      sourceId: content.sourceId,
      sourceName: sources.name,
    })
    .from(articleClaims)
    .innerJoin(content, eq(articleClaims.contentId, content.id))
    .innerJoin(sources, eq(content.sourceId, sources.id))
    .where(eq(articleClaims.id, claimId));

  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }

  // Find potential corroborating sources
  const candidates = await findCorroboratingSources(
    claim.claimText,
    claim.contentId,
    claim.sourceId,
    daysBack
  );

  const verifiedBy: CrossReferenceResult['verifiedBy'] = [];
  const contradictedBy: CrossReferenceResult['contradictedBy'] = [];
  let groundTruthMatch = false;

  // Check each candidate
  for (const candidate of candidates) {
    const result = await checkClaimMatch(
      claim.claimText,
      candidate.title,
      candidate.body
    );

    if (result.corroborates && result.similarity > 0.5) {
      verifiedBy.push({
        sourceName: candidate.sourceName,
        sourceId: candidate.sourceId,
        contentId: candidate.contentId,
        title: candidate.title,
        similarity: result.similarity,
        isGroundTruth: candidate.isGroundTruth,
      });

      if (candidate.isGroundTruth) {
        groundTruthMatch = true;
      }

      // Store in database
      await db.insert(crossReferenceResults).values({
        sourceId: claim.sourceId,
        contentId: claim.contentId,
        claimId: claim.id,
        wasAccurate: true,
        verificationSource: candidate.sourceName,
        confidence: result.similarity,
      });
    }

    if (result.contradicts) {
      contradictedBy.push({
        sourceName: candidate.sourceName,
        sourceId: candidate.sourceId,
        contentId: candidate.contentId,
        title: candidate.title,
        contradiction: result.contradiction || 'Conflicting information',
      });

      await db.insert(crossReferenceResults).values({
        sourceId: claim.sourceId,
        contentId: claim.contentId,
        claimId: claim.id,
        wasAccurate: false,
        verificationSource: candidate.sourceName,
        confidence: result.similarity,
      });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  // Determine verification status
  // Key insight: "unverified" means we couldn't find corroboration, NOT that it's false
  // Only contradictions should lower confidence; lack of corroboration is neutral
  let verificationStatus: CrossReferenceResult['verificationStatus'];
  let confidence: number;

  if (contradictedBy.length > verifiedBy.length) {
    verificationStatus = 'contradicted';
    confidence = 30; // Actively contradicted = low confidence
  } else if (verifiedBy.length >= 3 || groundTruthMatch) {
    verificationStatus = 'verified';
    confidence = groundTruthMatch ? 95 : 85; // Strong corroboration = high confidence
  } else if (verifiedBy.length >= 1) {
    verificationStatus = 'partially_verified';
    confidence = 70 + (verifiedBy.length * 5); // Some corroboration = good confidence
  } else {
    verificationStatus = 'unverified';
    confidence = 65; // No corroboration found = neutral (not bad), trust the source
  }

  // Update the claim in database
  await db.update(articleClaims)
    .set({
      verificationStatus,
      confidence,
      verifiedBy: verifiedBy.map(v => v.sourceName),
      contradictedBy: contradictedBy.map(c => c.sourceName),
      verificationMethod: groundTruthMatch 
        ? 'Verified by wire service (ground truth)'
        : verifiedBy.length >= 3 
          ? 'Cross-referenced with 3+ independent sources'
          : verifiedBy.length > 0
            ? `Partially verified by ${verifiedBy.length} source(s)`
            : 'No corroborating sources found',
    })
    .where(eq(articleClaims.id, claimId));

  return {
    claimId,
    claimText: claim.claimText,
    originalSource: claim.sourceName,
    verifiedBy,
    contradictedBy,
    verificationStatus,
    confidence,
    groundTruthMatch,
  };
}

/**
 * Cross-reference all claims for a content item
 */
export async function crossReferenceContent(
  contentId: string,
  daysBack: number = 7
): Promise<{
  contentId: string;
  claimsProcessed: number;
  verified: number;
  partiallyVerified: number;
  unverified: number;
  contradicted: number;
  overallConfidence: number;
  claims: CrossReferenceResult[];
}> {
  const claims = await db
    .select()
    .from(articleClaims)
    .where(eq(articleClaims.contentId, contentId));

  if (claims.length === 0) {
    throw new Error('No claims found for this content. Extract claims first.');
  }

  const results: CrossReferenceResult[] = [];
  let verified = 0, partiallyVerified = 0, unverified = 0, contradicted = 0;

  for (const claim of claims) {
    const result = await crossReferenceClaim(claim.id, daysBack);
    results.push(result);

    switch (result.verificationStatus) {
      case 'verified': verified++; break;
      case 'partially_verified': partiallyVerified++; break;
      case 'unverified': unverified++; break;
      case 'contradicted': contradicted++; break;
    }
  }

  // Calculate overall confidence - smarter logic
  // Verified/partially_verified claims boost confidence
  // Unverified claims are neutral (don't penalize)
  // Contradicted claims lower confidence
  
  // Get current content score
  const [currentContent] = await db
    .select({ confidenceScore: content.confidenceScore })
    .from(content)
    .where(eq(content.id, contentId));
  
  const baseScore = currentContent?.confidenceScore || 60;
  
  // Calculate adjustment based on verification results
  let scoreAdjustment = 0;
  scoreAdjustment += verified * 5;           // +5 per verified claim
  scoreAdjustment += partiallyVerified * 3;  // +3 per partially verified
  // unverified = 0 adjustment (neutral)
  scoreAdjustment -= contradicted * 10;      // -10 per contradicted claim
  
  // Apply adjustment, capped at reasonable bounds
  const overallConfidence = Math.max(20, Math.min(95, baseScore + scoreAdjustment));

  // Update content confidence score
  await db.update(content)
    .set({ confidenceScore: overallConfidence })
    .where(eq(content.id, contentId));

  return {
    contentId,
    claimsProcessed: claims.length,
    verified,
    partiallyVerified,
    unverified,
    contradicted,
    overallConfidence,
    claims: results,
  };
}

/**
 * Batch cross-reference unverified claims
 */
export async function batchCrossReference(
  limit: number = 20,
  daysBack: number = 7
): Promise<{
  processed: number;
  verified: number;
  errors: number;
}> {
  // Find claims that haven't been cross-referenced yet
  const unverifiedClaims = await db
    .select({
      id: articleClaims.id,
    })
    .from(articleClaims)
    .where(
      and(
        eq(articleClaims.verificationStatus, 'unverified'),
        sql`${articleClaims.id} NOT IN (SELECT DISTINCT claim_id FROM cross_reference_results WHERE claim_id IS NOT NULL)`
      )
    )
    .limit(limit);

  let processed = 0;
  let verified = 0;
  let errors = 0;

  for (const claim of unverifiedClaims) {
    try {
      const result = await crossReferenceClaim(claim.id, daysBack);
      processed++;
      if (result.verificationStatus === 'verified') verified++;
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`Cross-reference error for claim ${claim.id}:`, error);
      errors++;
    }
  }

  return { processed, verified, errors };
}

/**
 * Check if a source is a ground truth source
 */
export function isGroundTruthSource(sourceName: string): boolean {
  return GROUND_TRUTH_SOURCES.some(gt => 
    sourceName.toLowerCase().includes(gt.toLowerCase())
  );
}

export { GROUND_TRUTH_SOURCES };

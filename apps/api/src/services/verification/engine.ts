import { db, content, verifications, sources } from '../../db';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface VerificationResult {
  confidenceScore: number;
  crossReferenceCount: number;
  misinfoMarkers: string[];
  factCheckResults: FactCheckResult[];
  reasoning: string;
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'mixed' | 'unverified';
  sources: string[];
  confidence: number;
}

// Known misinformation patterns
const MISINFO_PATTERNS = [
  { pattern: /breaking.*exclusive/i, marker: 'clickbait_headline' },
  { pattern: /\b(shocking|unbelievable|you won\'t believe)\b/i, marker: 'sensational_language' },
  { pattern: /\b(mainstream media|msm|they don\'t want you to know)\b/i, marker: 'conspiracy_language' },
  { pattern: /\b(100%|guaranteed|proven)\b/i, marker: 'absolute_claims' },
  { pattern: /\b(anonymous sources?|sources? say)\b/i, marker: 'unverified_sources' },
];

// Reliable source domains (simplified - would be more comprehensive)
const RELIABLE_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'npr.org',
  'nytimes.com', 'washingtonpost.com', 'wsj.com',
  'theguardian.com', 'economist.com', 'foreignaffairs.com',
];

/**
 * Verify a single piece of content
 * This is the core verification engine
 */
export async function verifyContent(contentId: string): Promise<VerificationResult> {
  // Get the content
  const [item] = await db
    .select()
    .from(content)
    .where(eq(content.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  // Get source info
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, item.sourceId));

  const fullText = `${item.title} ${item.body}`;
  
  // 1. Check for misinformation patterns
  const misinfoMarkers: string[] = [];
  for (const { pattern, marker } of MISINFO_PATTERNS) {
    if (pattern.test(fullText)) {
      misinfoMarkers.push(marker);
    }
  }

  // 2. Cross-reference with other sources
  const crossRefs = await findCrossReferences(item.title, item.publishedAt);
  
  // 3. Check source reliability
  const sourceUrl = new URL(item.url);
  const isReliableSource = RELIABLE_DOMAINS.some(d => sourceUrl.hostname.includes(d));

  // 4. Calculate confidence score
  let confidenceScore = 50; // Start neutral

  // Boost for reliable sources
  if (isReliableSource) {
    confidenceScore += 20;
  }

  // Boost for source's historical reliability
  if (source && source.reliabilityScore > 70) {
    confidenceScore += 10;
  }

  // Boost for cross-references
  confidenceScore += Math.min(crossRefs.length * 5, 20);

  // Penalty for misinfo markers
  confidenceScore -= misinfoMarkers.length * 10;

  // Clamp to 0-100
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  // 5. Generate reasoning
  const reasoning = generateReasoning({
    isReliableSource,
    sourceReliability: source?.reliabilityScore || 50,
    crossRefCount: crossRefs.length,
    misinfoMarkers,
    confidenceScore,
  });

  const result: VerificationResult = {
    confidenceScore,
    crossReferenceCount: crossRefs.length,
    misinfoMarkers,
    factCheckResults: [], // TODO: Integrate with fact-check APIs
    reasoning,
  };

  // Save verification to database
  const [verification] = await db.insert(verifications).values({
    contentId,
    confidenceScore: result.confidenceScore,
    crossReferenceCount: result.crossReferenceCount,
    misinfoMarkers: result.misinfoMarkers,
    factCheckResults: result.factCheckResults,
    reasoning: result.reasoning,
  }).returning();

  // Update content with verification
  await db.update(content)
    .set({ 
      confidenceScore: result.confidenceScore,
      verificationId: verification.id,
    })
    .where(eq(content.id, contentId));

  return result;
}

/**
 * Find articles with similar titles published around the same time
 */
async function findCrossReferences(title: string, publishedAt: Date): Promise<{ id: string; title: string }[]> {
  // Extract key terms from title (simplified)
  const terms = title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 4);

  if (terms.length === 0) {
    return [];
  }

  // Look for similar content within 24 hours
  const timeWindow = new Date(publishedAt.getTime() - 24 * 60 * 60 * 1000);
  
  // Simple similarity: find articles containing at least 2 key terms
  const similar = await db
    .select({ id: content.id, title: content.title })
    .from(content)
    .where(
      and(
        gte(content.publishedAt, timeWindow),
        sql`LOWER(${content.title}) LIKE ${'%' + terms[0] + '%'}`
      )
    )
    .limit(10);

  // Filter to those with multiple term matches
  return similar.filter(item => {
    const lowerTitle = item.title.toLowerCase();
    const matchCount = terms.filter(t => lowerTitle.includes(t)).length;
    return matchCount >= 2;
  });
}

function generateReasoning(params: {
  isReliableSource: boolean;
  sourceReliability: number;
  crossRefCount: number;
  misinfoMarkers: string[];
  confidenceScore: number;
}): string {
  const parts: string[] = [];

  if (params.isReliableSource) {
    parts.push('Source is from a known reliable outlet.');
  }

  if (params.sourceReliability > 70) {
    parts.push(`Source has high historical reliability (${params.sourceReliability}%).`);
  } else if (params.sourceReliability < 40) {
    parts.push(`Source has low historical reliability (${params.sourceReliability}%).`);
  }

  if (params.crossRefCount > 0) {
    parts.push(`Found ${params.crossRefCount} similar article(s) from other sources.`);
  } else {
    parts.push('No corroborating articles found from other sources.');
  }

  if (params.misinfoMarkers.length > 0) {
    parts.push(`Warning: Content contains potential misinformation markers: ${params.misinfoMarkers.join(', ')}.`);
  }

  parts.push(`Overall confidence: ${params.confidenceScore}%.`);

  return parts.join(' ');
}

/**
 * Batch verify unverified content
 */
export async function verifyUnverifiedContent(limit: number = 50): Promise<{ verified: number; errors: number }> {
  const unverified = await db
    .select({ id: content.id })
    .from(content)
    .where(sql`${content.confidenceScore} IS NULL`)
    .limit(limit);

  let verified = 0;
  let errors = 0;

  for (const item of unverified) {
    try {
      await verifyContent(item.id);
      verified++;
    } catch (error) {
      console.error(`Error verifying ${item.id}:`, error);
      errors++;
    }
  }

  return { verified, errors };
}

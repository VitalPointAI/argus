/**
 * LLM-Powered Verification Engine
 * 
 * Uses AI to analyze content for reliability, bias, and factual accuracy.
 */

import { db, content as contentTable, sources, verifications, articleClaims } from '../../db';
import { eq } from 'drizzle-orm';

const NEARAI_API_KEY = process.env.NEARAI_API_KEY;

interface LLMVerificationResult {
  confidenceScore: number;
  credibilityIndicators: {
    hasMultipleSources: boolean;
    usesSpecificFacts: boolean;
    citesExperts: boolean;
    includesDates: boolean;
    hasVerifiableData: boolean;
  };
  biasIndicators: {
    emotionalLanguage: 'none' | 'low' | 'medium' | 'high';
    politicalSlant: 'none' | 'left' | 'right' | 'neutral';
    sensationalism: 'none' | 'low' | 'medium' | 'high';
  };
  factualClaims: Array<{
    claim: string;
    verifiable: boolean;
    confidence: number;
  }>;
  summary: string;
  reasoning: string;
}

/**
 * Analyze content with LLM for verification
 */
export async function llmVerifyContent(contentId: string): Promise<LLMVerificationResult> {
  // Get content
  const [item] = await db
    .select({
      id: contentTable.id,
      title: contentTable.title,
      body: contentTable.body,
      url: contentTable.url,
      author: contentTable.author,
      sourceName: sources.name,
      sourceReliability: sources.reliabilityScore,
    })
    .from(contentTable)
    .leftJoin(sources, eq(contentTable.sourceId, sources.id))
    .where(eq(contentTable.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  // If body is too short, return basic verification
  if (!item.body || item.body.length < 100) {
    return getBasicVerification(item);
  }

  // If no LLM API key, use heuristic verification
  if (!NEARAI_API_KEY) {
    return getHeuristicVerification(item);
  }

  const prompt = `Analyze this news article for reliability and factual accuracy. Extract all key factual claims.

TITLE: ${item.title}
SOURCE: ${item.sourceName || 'Unknown'}
AUTHOR: ${item.author || 'Unknown'}

CONTENT:
${item.body.substring(0, 3000)}

Analyze and respond with JSON:
{
  "confidenceScore": <0-100, how reliable is this article>,
  "credibilityIndicators": {
    "hasMultipleSources": <true if article cites multiple sources>,
    "usesSpecificFacts": <true if includes specific verifiable facts>,
    "citesExperts": <true if quotes named experts>,
    "includesDates": <true if includes specific dates/times>,
    "hasVerifiableData": <true if includes data that can be fact-checked>
  },
  "biasIndicators": {
    "emotionalLanguage": "<none|low|medium|high>",
    "politicalSlant": "<none|left|right|neutral>",
    "sensationalism": "<none|low|medium|high>"
  },
  "factualClaims": [
    {
      "claim": "A specific, standalone factual claim from the article",
      "verifiable": true,
      "confidence": 85,
      "verificationMethod": "How this could be verified (e.g., 'can be cross-referenced with official sources', 'quote from named expert', 'statistical claim needs data source')",
      "status": "verified|partially_verified|unverified|contradicted"
    }
  ],
  "summary": "One sentence summary of what this article claims",
  "reasoning": "Brief explanation of why you gave this confidence score"
}

IMPORTANT for factualClaims:
- Extract 3-7 key factual claims from the article
- Each claim should be a specific, verifiable statement
- Assess if the article provides evidence for each claim
- Status: "verified" if sourced/evidenced, "partially_verified" if some evidence, "unverified" if no evidence, "contradicted" if self-contradicting

Be objective. Focus on factual accuracy, not political agreement.`;

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
          { role: 'system', content: 'You are a fact-checking analyst. Be objective and precise. Always extract specific factual claims from articles.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error('LLM verification failed:', response.status);
      return getHeuristicVerification(item);
    }

    const data = await response.json();
    const llmContent = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Update content confidence score
      await db.update(contentTable)
        .set({ confidenceScore: parsed.confidenceScore })
        .where(eq(contentTable.id, contentId));
      
      // Store extracted claims in the database
      if (parsed.factualClaims && Array.isArray(parsed.factualClaims)) {
        // Delete existing claims for this content (to allow re-verification)
        await db.delete(articleClaims).where(eq(articleClaims.contentId, contentId));
        
        // Insert new claims
        for (const claim of parsed.factualClaims) {
          if (claim.claim && claim.claim.length > 10) {
            await db.insert(articleClaims).values({
              contentId,
              claimText: claim.claim,
              confidence: claim.confidence || 50,
              verificationStatus: claim.status || 'unverified',
              verificationMethod: claim.verificationMethod || null,
              verifiedBy: claim.verifiedBy || [],
              contradictedBy: claim.contradictedBy || [],
            });
          }
        }
      }
      
      return parsed as LLMVerificationResult;
    }
    
    return getHeuristicVerification(item);
  } catch (error) {
    console.error('LLM verification error:', error);
    return getHeuristicVerification(item);
  }
}

/**
 * Basic verification for short content
 */
function getBasicVerification(item: any): LLMVerificationResult {
  const baseScore = item.sourceReliability || 50;
  
  return {
    confidenceScore: Math.min(baseScore, 60), // Cap at 60 for short content
    credibilityIndicators: {
      hasMultipleSources: false,
      usesSpecificFacts: false,
      citesExperts: false,
      includesDates: true,
      hasVerifiableData: false,
    },
    biasIndicators: {
      emotionalLanguage: 'none',
      politicalSlant: 'neutral',
      sensationalism: 'none',
    },
    factualClaims: [],
    summary: item.title,
    reasoning: 'Content too short for detailed analysis. Score based on source reliability.',
  };
}

/**
 * Heuristic verification when LLM unavailable
 */
function getHeuristicVerification(item: any): LLMVerificationResult {
  const text = `${item.title} ${item.body}`.toLowerCase();
  let score = item.sourceReliability || 50;
  
  // Credibility indicators
  const hasMultipleSources = /according to|sources say|reports indicate|confirmed by/i.test(text);
  const usesSpecificFacts = /\d+%|\$\d|million|billion|\d{4}/i.test(text);
  const citesExperts = /professor|dr\.|expert|analyst|official said/i.test(text);
  const includesDates = /january|february|march|april|may|june|july|august|september|october|november|december|\d{4}/i.test(text);
  const hasVerifiableData = /study|research|data shows|statistics/i.test(text);
  
  // Adjust score
  if (hasMultipleSources) score += 5;
  if (usesSpecificFacts) score += 5;
  if (citesExperts) score += 5;
  if (hasVerifiableData) score += 5;
  
  // Bias detection
  const emotionalWords = ['shocking', 'outrage', 'unbelievable', 'devastating', 'incredible'];
  const emotionalCount = emotionalWords.filter(w => text.includes(w)).length;
  const emotionalLanguage = emotionalCount === 0 ? 'none' : emotionalCount === 1 ? 'low' : emotionalCount <= 3 ? 'medium' : 'high';
  
  if (emotionalCount > 0) score -= emotionalCount * 3;
  
  // Sensationalism
  const clickbaitPatterns = ['you won\'t believe', 'breaking', 'exclusive', 'secret', 'revealed'];
  const clickbaitCount = clickbaitPatterns.filter(p => text.includes(p)).length;
  const sensationalism = clickbaitCount === 0 ? 'none' : clickbaitCount === 1 ? 'low' : 'medium';
  
  if (clickbaitCount > 0) score -= clickbaitCount * 5;
  
  // Clamp score
  score = Math.max(20, Math.min(95, score));
  
  return {
    confidenceScore: score,
    credibilityIndicators: {
      hasMultipleSources,
      usesSpecificFacts,
      citesExperts,
      includesDates,
      hasVerifiableData,
    },
    biasIndicators: {
      emotionalLanguage,
      politicalSlant: 'neutral', // Hard to detect without LLM
      sensationalism,
    },
    factualClaims: [], // Would need LLM
    summary: item.title,
    reasoning: 'Heuristic analysis based on content patterns. LLM verification unavailable.',
  };
}

/**
 * Batch verify unverified content with LLM
 */
export async function llmBatchVerify(limit: number = 20): Promise<{ verified: number; errors: number }> {
  // This is expensive, so we process fewer items than heuristic verification
  const unverified = await db
    .select({ id: contentTable.id })
    .from(contentTable)
    .where(eq(contentTable.confidenceScore, null as any))
    .limit(limit);

  let verified = 0;
  let errors = 0;

  for (const item of unverified) {
    try {
      await llmVerifyContent(item.id);
      verified++;
      
      // Rate limit - don't hammer the API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`LLM verification error for ${item.id}:`, error);
      errors++;
    }
  }

  return { verified, errors };
}

/**
 * Fact-Check Service
 * Extracts claims, searches for evidence, generates verdicts with citations
 */

import { db, content, sources, domains } from '../../db';
import { eq, sql, desc } from 'drizzle-orm';
import { generateEmbedding, formatForPgVector } from '../embeddings';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export interface Claim {
  text: string;
  type: 'factual' | 'prediction' | 'opinion';
  verifiable: boolean;
}

export interface Evidence {
  contentId: string;
  title: string;
  url: string;
  sourceName: string;
  sourceReliability: number;
  quote: string;
  relevanceScore: number;
  supports: boolean | null; // true = supports, false = contradicts, null = neutral/unclear
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'mixed' | 'unverified';
  confidence: number;
  reasoning: string;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
}

/**
 * Extract verifiable claims from an article using Claude
 */
export async function extractClaims(title: string, body: string): Promise<Claim[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `Analyze this article and extract specific, verifiable factual claims. 
Focus on claims that can be verified against other news sources.

Article Title: ${title}

Article Body: ${body.slice(0, 4000)}

Extract up to 5 key factual claims. For each claim:
1. State the claim clearly and specifically
2. Classify as: factual, prediction, or opinion
3. Indicate if it's verifiable (can be checked against other sources)

Respond in JSON format:
{
  "claims": [
    {"text": "claim text", "type": "factual|prediction|opinion", "verifiable": true|false}
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.claims || [];
  } catch {
    return [];
  }
}

/**
 * Search for evidence using semantic similarity
 */
export async function searchEvidence(claim: string, limit: number = 10): Promise<Evidence[]> {
  // Generate embedding for the claim
  const { embedding } = await generateEmbedding(claim);
  const vectorStr = formatForPgVector(embedding);

  // Search for similar content using cosine similarity
  const results = await db.execute(sql`
    SELECT 
      c.id,
      c.title,
      c.body,
      c.url,
      c.confidence_score,
      s.name as source_name,
      s.reliability_score as source_reliability,
      1 - (c.embedding <=> ${vectorStr}::vector) as similarity
    FROM content c
    LEFT JOIN sources s ON c.source_id = s.id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `);

  return (results as any[]).map(row => ({
    contentId: row.id,
    title: row.title,
    url: row.url,
    sourceName: row.source_name,
    sourceReliability: row.source_reliability || 50,
    quote: row.body?.slice(0, 300) + '...',
    relevanceScore: Math.round((row.similarity || 0) * 100),
    supports: null, // Will be determined by reasoning
  }));
}

/**
 * Analyze evidence and generate verdict using Claude
 */
export async function analyzeEvidence(
  claim: string,
  evidence: Evidence[]
): Promise<{ verdict: 'true' | 'false' | 'mixed' | 'unverified'; confidence: number; reasoning: string; supporting: Evidence[]; contradicting: Evidence[] }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  if (evidence.length === 0) {
    return {
      verdict: 'unverified',
      confidence: 0,
      reasoning: 'No relevant evidence found in our corpus.',
      supporting: [],
      contradicting: [],
    };
  }

  const evidenceText = evidence
    .slice(0, 5) // Top 5 most relevant
    .map((e, i) => `
[Source ${i + 1}]: ${e.sourceName} (Reliability: ${e.sourceReliability}%)
Title: ${e.title}
Excerpt: ${e.quote}
`)
    .join('\n');

  const prompt = `You are a fact-checker. Analyze whether the following claim is supported or contradicted by the evidence.

CLAIM TO VERIFY:
"${claim}"

EVIDENCE FROM NEWS SOURCES:
${evidenceText}

Analyze the evidence and determine:
1. Does each source SUPPORT, CONTRADICT, or have NO CLEAR STANCE on the claim?
2. Overall verdict: true, false, mixed, or unverified
3. Confidence level (0-100) based on evidence quality and agreement
4. Brief reasoning

Respond in JSON:
{
  "verdict": "true|false|mixed|unverified",
  "confidence": 0-100,
  "reasoning": "explanation",
  "source_analysis": [
    {"source_index": 1, "stance": "supports|contradicts|neutral", "key_point": "why"}
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Classify evidence based on analysis
    const supporting: Evidence[] = [];
    const contradicting: Evidence[] = [];
    
    if (parsed.source_analysis) {
      for (const analysis of parsed.source_analysis) {
        const idx = analysis.source_index - 1;
        if (idx >= 0 && idx < evidence.length) {
          const e = { ...evidence[idx] };
          if (analysis.stance === 'supports') {
            e.supports = true;
            supporting.push(e);
          } else if (analysis.stance === 'contradicts') {
            e.supports = false;
            contradicting.push(e);
          }
        }
      }
    }

    return {
      verdict: parsed.verdict || 'unverified',
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || 'Analysis inconclusive.',
      supporting,
      contradicting,
    };
  } catch {
    return {
      verdict: 'unverified',
      confidence: 0,
      reasoning: 'Failed to analyze evidence.',
      supporting: [],
      contradicting: [],
    };
  }
}

/**
 * Full fact-check pipeline for an article
 */
export async function factCheckArticle(contentId: string): Promise<FactCheckResult[]> {
  // Get the article
  const [article] = await db
    .select()
    .from(content)
    .where(eq(content.id, contentId));

  if (!article) {
    throw new Error('Article not found');
  }

  // Extract claims
  const claims = await extractClaims(article.title, article.body);
  const verifiableClaims = claims.filter(c => c.verifiable && c.type === 'factual');

  if (verifiableClaims.length === 0) {
    return [];
  }

  // Fact-check each claim
  const results: FactCheckResult[] = [];

  for (const claim of verifiableClaims) {
    // Search for evidence
    const evidence = await searchEvidence(claim.text);
    
    // Analyze and get verdict
    const analysis = await analyzeEvidence(claim.text, evidence);

    results.push({
      claim: claim.text,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      supportingEvidence: analysis.supporting,
      contradictingEvidence: analysis.contradicting,
    });
  }

  return results;
}

/**
 * Generate embeddings for content that doesn't have them
 */
export async function embedContent(contentId: string): Promise<boolean> {
  const [article] = await db
    .select()
    .from(content)
    .where(eq(content.id, contentId));

  if (!article) return false;

  const text = `${article.title}\n\n${article.body}`;
  const { embedding } = await generateEmbedding(text);
  const vectorStr = formatForPgVector(embedding);

  await db.execute(sql`
    UPDATE content 
    SET embedding = ${vectorStr}::vector 
    WHERE id = ${contentId}
  `);

  return true;
}

/**
 * Batch embed content without embeddings
 */
export async function embedUnembeddedContent(limit: number = 50): Promise<number> {
  const unembedded = await db.execute(sql`
    SELECT id, title, body FROM content 
    WHERE embedding IS NULL 
    LIMIT ${limit}
  `);

  let count = 0;
  for (const row of unembedded as any[]) {
    try {
      const text = `${row.title}\n\n${row.body}`;
      const { embedding } = await generateEmbedding(text);
      const vectorStr = formatForPgVector(embedding);

      await db.execute(sql`
        UPDATE content 
        SET embedding = ${vectorStr}::vector 
        WHERE id = ${row.id}
      `);
      count++;
    } catch (error) {
      console.error(`Failed to embed ${row.id}:`, error);
    }
  }

  return count;
}

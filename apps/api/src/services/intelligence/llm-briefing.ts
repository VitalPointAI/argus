/**
 * LLM-Powered Briefing Generator
 * 
 * Generates intelligent briefings using LLM summarization.
 * Supports multiple providers: Near AI, OpenAI, Anthropic
 */

import { db, content, sources, domains } from '../../db';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

// Environment-based config
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'nearai'; // nearai, openai, anthropic
const NEARAI_API_KEY = process.env.NEARAI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

interface Article {
  id: string;
  title: string;
  body: string;
  url: string;
  source: string;
  domain: string;
  publishedAt: Date;
  confidenceScore: number;
}

interface BriefingOptions {
  type: 'morning' | 'evening' | 'flash' | 'weekly';
  hoursBack?: number;
  minConfidence?: number;
  maxArticles?: number;
  domains?: string[];
}

/**
 * Fetch top articles for briefing
 */
async function fetchTopArticles(options: BriefingOptions): Promise<Article[]> {
  const hoursBack = options.hoursBack || (options.type === 'morning' ? 12 : 8);
  const minConfidence = options.minConfidence || 50;
  const maxArticles = options.maxArticles || 50;
  
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  const conditions: any[] = [
    gte(content.fetchedAt, since),
    gte(content.confidenceScore, minConfidence),
  ];

  const articles = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      url: content.url,
      publishedAt: content.publishedAt,
      confidenceScore: content.confidenceScore,
      source: sources.name,
      domain: domains.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(and(...conditions))
    .orderBy(desc(content.confidenceScore))
    .limit(maxArticles);

  return articles as Article[];
}

/**
 * Group articles by domain
 */
function groupByDomain(articles: Article[]): Record<string, Article[]> {
  return articles.reduce((acc, article) => {
    const domain = article.domain || 'Other';
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(article);
    return acc;
  }, {} as Record<string, Article[]>);
}

/**
 * Build the prompt for LLM summarization
 */
function buildBriefingPrompt(articles: Article[], options: BriefingOptions): string {
  const grouped = groupByDomain(articles);
  
  const articleSummaries = Object.entries(grouped)
    .map(([domain, domainArticles]) => {
      const articleList = domainArticles
        .slice(0, 5) // Top 5 per domain
        .map(a => `- "${a.title}" (${a.source}, ${a.confidenceScore}% confidence)`)
        .join('\n');
      return `## ${domain}\n${articleList}`;
    })
    .join('\n\n');

  const typeInstructions = {
    morning: 'comprehensive overnight summary',
    evening: 'end-of-day developments summary',
    flash: 'urgent breaking news - single critical development only',
    weekly: 'weekly factual summary',
  };

  return `You are a FACT-CHECKING intelligence analyst. Your output must be 100% FACTUAL.

STRICT RULES - FOLLOW EXACTLY:
1. ONLY report information DIRECTLY stated in the provided sources
2. NEVER add speculation, interpretation, or your own analysis
3. NEVER infer or assume anything not explicitly stated
4. Include source name in parentheses for EVERY claim
5. If confidence < 70%, mark explicitly as [UNVERIFIED]
6. Use exact wording from sources where possible
7. If sources conflict, report BOTH views with sources

ARTICLES (${articles.length} total):
${articleSummaries}

Generate a ${typeInstructions[options.type]} using ONLY the facts above.

FORMAT EXACTLY AS:
---
**VERIFIED INTELLIGENCE BRIEFING**
Type: ${options.type}
Sources: ${articles.length} articles
Confidence: [calculate average]%

**VERIFIED DEVELOPMENTS**
• [Exact claim from article] (Source Name) [confidence%]
• [Exact claim from article] (Source Name) [confidence%]

**UNVERIFIED REPORTS** (confidence < 70%)
• ⚠ [Claim] (Source) [confidence%]

**CITATIONS**
• "Article Title" - Source - URL
---

REMEMBER: Zero speculation. Facts only. Source everything.`;
}

/**
 * Call Near AI inference API
 */
async function callNearAI(prompt: string): Promise<string> {
  if (!NEARAI_API_KEY) {
    throw new Error('NEARAI_API_KEY not configured');
  }

  // Use the correct Near AI Cloud endpoint
  const endpoint = 'https://cloud-api.near.ai/v1/chat/completions';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEARAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3.1',
        messages: [
          { role: 'system', content: 'You are an expert intelligence analyst.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.05,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Near AI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('Near AI call failed:', e);
    throw e;
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert intelligence analyst.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.05,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Anthropic API
 */
async function callAnthropic(prompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt },
      ],
      system: 'You are an expert intelligence analyst.',
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Generate LLM-powered briefing
 */
export async function generateLLMBriefing(options: BriefingOptions): Promise<{
  content: string;
  articleCount: number;
  domainCount: number;
  provider: string;
}> {
  // Fetch articles
  const articles = await fetchTopArticles(options);
  
  if (articles.length === 0) {
    return {
      content: 'No new intelligence available for this period.',
      articleCount: 0,
      domainCount: 0,
      provider: 'none',
    };
  }

  const grouped = groupByDomain(articles);
  const prompt = buildBriefingPrompt(articles, options);

  // Try providers in order of preference
  const providers = [
    { name: 'nearai', fn: callNearAI, available: !!NEARAI_API_KEY },
    { name: 'openai', fn: callOpenAI, available: !!OPENAI_API_KEY },
    { name: 'anthropic', fn: callAnthropic, available: !!ANTHROPIC_API_KEY },
  ];

  let briefingContent = '';
  let usedProvider = 'fallback';

  for (const provider of providers) {
    if (!provider.available) continue;
    
    try {
      console.log(`Trying ${provider.name} for briefing generation...`);
      briefingContent = await provider.fn(prompt);
      usedProvider = provider.name;
      console.log(`Successfully generated briefing with ${provider.name}`);
      break;
    } catch (e) {
      console.log(`${provider.name} failed:`, e);
    }
  }

  // Fallback: basic extraction without LLM
  if (!briefingContent) {
    console.log('All LLM providers failed, using fallback');
    briefingContent = generateFallbackBriefing(articles, options);
  }

  return {
    content: briefingContent,
    articleCount: articles.length,
    domainCount: Object.keys(grouped).length,
    provider: usedProvider,
  };
}

/**
 * Fallback briefing when no LLM is available
 * Uses strict factual format with source attribution
 */
function generateFallbackBriefing(articles: Article[], options: BriefingOptions): string {
  const grouped = groupByDomain(articles);
  const timestamp = new Date().toISOString();
  const sources = [...new Set(articles.map(a => a.source))];
  const avgConfidence = articles.length > 0
    ? Math.round(articles.reduce((sum, a) => sum + a.confidenceScore, 0) / articles.length)
    : 0;
  
  const lines = [
    '---',
    '**VERIFIED INTELLIGENCE BRIEFING**',
    `Generated: ${timestamp}`,
    `Sources: ${articles.length} articles from ${sources.length} sources`,
    `Overall Confidence: ${avgConfidence}%`,
    '',
    '**KEY DEVELOPMENTS** (by domain)',
    '',
  ];
  
  for (const [domain, domainArticles] of Object.entries(grouped)) {
    const verified = domainArticles.filter(a => a.confidenceScore >= 70);
    const unverified = domainArticles.filter(a => a.confidenceScore < 70);
    
    if (verified.length > 0) {
      lines.push(`**${domain}** [${verified.length} verified]`);
      verified.slice(0, 3).forEach(a => {
        lines.push(`• ${a.title} (${a.source}) [${a.confidenceScore}%]`);
      });
      lines.push('');
    }
    
    if (unverified.length > 0 && verified.length === 0) {
      lines.push(`**${domain}** [UNVERIFIED]`);
      unverified.slice(0, 2).forEach(a => {
        lines.push(`• ⚠ ${a.title} (${a.source}) [${a.confidenceScore}%]`);
      });
      lines.push('');
    }
  }
  
  lines.push('**CITATIONS**');
  articles.slice(0, 10).forEach(a => {
    lines.push(`• "${a.title}" - ${a.source} - ${a.url}`);
  });
  lines.push('---');
  
  return lines.join('\n');
}

/**
 * Generate briefing with fact-checking and review support
 */
export async function generateFactCheckedBriefing(options: BriefingOptions): Promise<{
  content: string;
  claims: any[];
  articleCount: number;
  domainCount: number;
  overallConfidence: number;
  provider: string;
  reviewStatus: 'pending';
}> {
  const articles = await fetchTopArticles(options);
  
  if (articles.length === 0) {
    return {
      content: 'No verified intelligence available for this period.',
      claims: [],
      articleCount: 0,
      domainCount: 0,
      overallConfidence: 0,
      provider: 'none',
      reviewStatus: 'pending',
    };
  }

  const grouped = groupByDomain(articles);
  
  // Build claims from articles
  const claims = articles.map(a => ({
    id: `claim-${a.id}`,
    claim: a.title,
    sourceUrl: a.url,
    source: a.source,
    domain: a.domain,
    confidenceScore: a.confidenceScore,
    verificationStatus: a.confidenceScore >= 70 ? 'verified' : 'unverified',
  }));

  const avgConfidence = Math.round(
    articles.reduce((sum, a) => sum + a.confidenceScore, 0) / articles.length
  );

  // Generate briefing content
  const result = await generateLLMBriefing(options);

  return {
    content: result.content,
    claims,
    articleCount: articles.length,
    domainCount: Object.keys(grouped).length,
    overallConfidence: avgConfidence,
    provider: result.provider,
    reviewStatus: 'pending',
  };
}

export { fetchTopArticles, groupByDomain };

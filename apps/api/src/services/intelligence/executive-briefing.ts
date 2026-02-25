/**
 * Executive Briefing Generator
 * 
 * Produces structured, readable intelligence briefings with:
 * - Clear sections by domain/topic
 * - Context + latest updates for each story
 * - Confidence levels (High/Medium/Low) and verification links
 * - Article citations
 * - TTS-ready format option
 */

import { validateArticleContent } from './content-validator';
import { classifyArticleTopics } from './topic-classifier';
import { db, content, sources, domains, sourceDomains } from '../../db';
import { eq, desc, gte, and, sql, inArray } from 'drizzle-orm';

const NEARAI_API_KEY = process.env.NEARAI_API_KEY || process.env.NEAR_AI_API_KEY;
const ARGUS_BASE_URL = process.env.ARGUS_BASE_URL || 'https://argus.vitalpoint.ai';

/**
 * Convert confidence score to human-readable label
 * High >= 80, Medium 60-79, Low < 60
 */
function getConfidenceLabel(score: number): string {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Medium';
  return 'Low';
}

/**
 * Strip HTML tags from text and clean up whitespace
 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp;
    .replace(/&amp;/g, '&') // Replace &amp;
    .replace(/&lt;/g, '<') // Replace &lt;
    .replace(/&gt;/g, '>') // Replace &gt;
    .replace(/&quot;/g, '"') // Replace &quot;
    .replace(/&#\d+;/g, '') // Remove numeric HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

interface Article {
  id: string;
  title: string;
  body: string;
  url: string;
  source: string;
  sourceName: string;
  domain: string;
  domainSlug: string;
  publishedAt: Date;
  confidenceScore: number;
  hasDeepVerification?: boolean;
  topics?: string[]; // On-demand classified topics
}

interface StoryCluster {
  id: string;
  headline: string;
  context: string;
  latestUpdate: string;
  significance: 'high' | 'medium' | 'low';
  articles: {
    id: string;
    title: string;
    source: string;
    url: string;
    confidenceScore: number;
    confidenceLabel: string;
    verificationUrl: string;
  }[];
  avgConfidence: number;
  confidenceLabel: string;
  deepVerified: boolean;
}

interface BriefingSection {
  domain: string;
  domainSlug: string;
  icon: string;
  stories: StoryCluster[];
}

interface ExecutiveBriefing {
  id: string;
  title: string;
  subtitle: string;
  generatedAt: Date;
  readTimeMinutes: number;
  sections: BriefingSection[];
  summary: {
    totalArticles: number;
    totalStories: number;
    avgConfidence: number;
    confidenceLabel: string;
    topDomains: string[];
  };
  // For TTS
  ttsScript?: string;
  // Formatted content
  htmlContent: string;
  markdownContent: string;
}

const DOMAIN_ICONS: Record<string, string> = {
  'defense': '🛡️',
  'geopolitics': '🌍',
  'technology': '💻',
  'economics': '📊',
  'energy': '⚡',
  'cybersecurity': '🔒',
  'climate': '🌡️',
  'health': '🏥',
  'china': '🇨🇳',
  'russia': '🇷🇺',
  'middle-east': '🕌',
  'europe': '🇪🇺',
  'default': '📰',
};

interface BriefingOptions {
  type: 'morning' | 'evening' | 'weekly';
  hoursBack?: number;
  minConfidence?: number;
  maxArticles?: number;
  domains?: string[]; // Domain slugs to filter by
  domainIds?: string[]; // Domain IDs to filter by (from user preferences)
  sourceIds?: string[]; // Source IDs to filter by (from active source list)
  includeTTS?: boolean;
  // Custom filter parameters (from dashboard filters)
  topics?: string[]; // Topic names to include (OR logic)
  excludeTopics?: string[]; // Topic names to exclude
  domainSlugs?: string[]; // Domain slugs to include (source perspective)
  excludeDomainSlugs?: string[]; // Domain slugs to exclude
  topicQuery?: string; // Free-text search in articles
  timezone?: string; // User's timezone for time-of-day title
}

/**
 * Fetch articles with full metadata
 * Optionally filtered by user's domain preferences
 */
async function fetchArticles(options: BriefingOptions): Promise<Article[]> {
  console.log(`[FetchArticles] OPTIONS:`, JSON.stringify({ topics: options.topics, sourceIds: options.sourceIds?.length, excludeTopics: options.excludeTopics }));
  const hoursBack = options.hoursBack || (options.type === 'morning' ? 14 : 10);
  const minConfidence = options.minConfidence || 45;
  const maxArticles = options.maxArticles || 100;
  
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  console.log(`[FetchArticles] hoursBack=${hoursBack}, since=${since.toISOString()}, maxArticles=${maxArticles}`);
  
  // First, check total article count for debugging
  try {
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(content);
    console.log(`[FetchArticles] Total articles in database: ${countResult?.count}`);
    
    const [recentCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(content)
      .where(gte(content.publishedAt, since));
    console.log(`[FetchArticles] Articles published since ${since.toISOString()}: ${recentCount?.count}`);
  } catch (countError) {
    console.error('[FetchArticles] Count query failed:', countError);
  }
  
  // Build conditions
  const conditions = [
    gte(content.publishedAt, since),
  ];
  
  // Add source list filter if specified
  if (options.sourceIds && options.sourceIds.length > 0) {
    console.log(`[FetchArticles] Filtering by ${options.sourceIds.length} sources from active source list`);
    conditions.push(inArray(content.sourceId, options.sourceIds));
  }
  
  // Add domain filter - filters by ARTICLE's classified domain, not source
  if (options.domainIds && options.domainIds.length > 0) {
    console.log(`[FetchArticles] Filtering by ${options.domainIds.length} article domains`);
    conditions.push(inArray(content.domainId, options.domainIds));
  }
  
  // NOTE: Topic filtering now happens AFTER fetching via on-demand classification
  // This saves ~2400 LLM calls/day by not classifying during RSS ingestion
  // We'll classify only the articles needed for this briefing
  const needsTopicFilter = (options.topics && options.topics.length > 0) || 
                           (options.excludeTopics && options.excludeTopics.length > 0);
  
  if (needsTopicFilter) {
    console.log(`[FetchArticles] Topic filter requested - will classify on-demand after fetch`);
    console.log(`[FetchArticles] Include topics: ${options.topics?.join(', ') || 'none'}`);
    console.log(`[FetchArticles] Exclude topics: ${options.excludeTopics?.join(', ') || 'none'}`);
  }
  
  // Custom filter: domainSlugs (source perspective - OR logic)
  if (options.domainSlugs && options.domainSlugs.length > 0) {
    console.log(`[FetchArticles] Filtering by source domains: ${options.domainSlugs.join(', ')}`);
    conditions.push(inArray(domains.slug, options.domainSlugs));
  }
  
  // Custom filter: excludeDomainSlugs (NOT logic)
  if (options.excludeDomainSlugs && options.excludeDomainSlugs.length > 0) {
    console.log(`[FetchArticles] Excluding source domains: ${options.excludeDomainSlugs.join(', ')}`);
    conditions.push(sql`${domains.slug} NOT IN (${sql.join(options.excludeDomainSlugs.map(s => sql`${s}`), sql`, `)})`);
  }
  
  // Custom filter: topicQuery (free-text search)
  if (options.topicQuery) {
    console.log(`[FetchArticles] Searching for: ${options.topicQuery}`);
    const searchTerms = options.topicQuery.toLowerCase().split(/\s+/).filter(Boolean);
    for (const term of searchTerms) {
      conditions.push(sql`(LOWER(${content.title}) LIKE ${'%' + term + '%'} OR LOWER(${content.body}) LIKE ${'%' + term + '%'})`);
    }
  }
  
  try {
    // Join domains on article's classified domain_id, not source's domain
    const articles = await db
      .select({
        id: content.id,
        title: content.title,
        body: content.body,
        url: content.url,
        publishedAt: content.publishedAt,
        confidenceScore: content.confidenceScore,
        sourceId: sources.id,
        sourceName: sources.name,
        domain: domains.name,
        domainSlug: domains.slug,
        domainId: domains.id,
      })
      .from(content)
      .leftJoin(sources, eq(content.sourceId, sources.id))
      .leftJoin(domains, eq(content.domainId, domains.id))
      .where(and(...conditions))
      .orderBy(desc(content.publishedAt))
      .limit(maxArticles);

    console.log(`[FetchArticles] Query returned ${articles.length} articles`);
    
    if (articles.length > 0) {
      console.log(`[FetchArticles] First article: "${articles[0].title?.substring(0, 50)}..." from ${articles[0].sourceName}`);
    }

    // Source diversity: limit to max 3 articles per source to prevent one source dominating
    const MAX_PER_SOURCE = 3;
    const sourceCount: Record<string, number> = {};
    const diverseArticles = articles.filter(a => {
      const sourceId = a.sourceId || 'unknown';
      sourceCount[sourceId] = (sourceCount[sourceId] || 0) + 1;
      return sourceCount[sourceId] <= MAX_PER_SOURCE;
    });
    
    console.log(`[FetchArticles] After diversity filter: ${diverseArticles.length} articles (from ${Object.keys(sourceCount).length} sources)`);

    let mappedArticles = diverseArticles.map(a => ({
      id: a.id,
      title: a.title,
      body: a.body || '',
      url: a.url,
      source: a.sourceId || '',
      sourceName: a.sourceName || 'Unknown',
      domain: a.domain || 'Other',
      domainSlug: a.domainSlug || 'other',
      publishedAt: a.publishedAt,
      confidenceScore: a.confidenceScore || 50,
      topics: [] as string[], // Will be populated by on-demand classification if needed
    }));

    // ON-DEMAND TOPIC CLASSIFICATION
    // Only classify if topic filtering is requested - saves LLM calls
    if (needsTopicFilter && mappedArticles.length > 0) {
      console.log(`[FetchArticles] Running on-demand topic classification for ${mappedArticles.length} articles...`);
      
      // Classify articles in parallel (with concurrency limit)
      const CONCURRENCY = 5;
      const classified: typeof mappedArticles = [];
      
      for (let i = 0; i < mappedArticles.length; i += CONCURRENCY) {
        const batch = mappedArticles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (article) => {
            try {
              const result = await classifyArticleTopics(article.title, article.body);
              return { ...article, topics: result.topics };
            } catch (err) {
              console.warn(`[FetchArticles] Classification failed for "${article.title.substring(0, 30)}...":`, err);
              return { ...article, topics: [] };
            }
          })
        );
        classified.push(...results);
      }
      
      console.log(`[FetchArticles] Classified ${classified.length} articles`);
      
      // Apply topic filters
      let filteredArticles = classified;
      
      // Include filter (OR logic)
      if (options.topics && options.topics.length > 0) {
        const includeTopics = options.topics.map(t => t.toLowerCase());
        filteredArticles = filteredArticles.filter(a => 
          a.topics.some(t => includeTopics.includes(t.toLowerCase()))
        );
        console.log(`[FetchArticles] After include filter (${options.topics.join(', ')}): ${filteredArticles.length} articles`);
      }
      
      // Exclude filter
      if (options.excludeTopics && options.excludeTopics.length > 0) {
        const excludeTopics = options.excludeTopics.map(t => t.toLowerCase());
        filteredArticles = filteredArticles.filter(a => 
          !a.topics.some(t => excludeTopics.includes(t.toLowerCase()))
        );
        console.log(`[FetchArticles] After exclude filter: ${filteredArticles.length} articles`);
      }
      
      mappedArticles = filteredArticles;
    }

    return mappedArticles;
  } catch (queryError) {
    console.error('[FetchArticles] Query failed:', queryError);
    throw queryError;
  }
}

/**
 * Call LLM to cluster and summarize articles into stories
 */
async function clusterIntoStories(articles: Article[], domain: string): Promise<StoryCluster[]> {
  if (!NEARAI_API_KEY || articles.length === 0) {
    console.log(`[ClusterStories] Fallback mode - NEARAI_API_KEY: ${NEARAI_API_KEY ? 'set' : 'missing'}, articles: ${articles.length}`);
    // Fallback: treat each article as its own story
    return articles.slice(0, 5).map((a, i) => {
      const cleanBody = stripHtml(a.body);
      // Split into sentences for better context/latest separation
      const sentences = cleanBody.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const contextSentences = sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ').trim();
      const latestSentences = sentences.slice(Math.ceil(sentences.length / 2)).join('. ').trim();
      const label = getConfidenceLabel(a.confidenceScore);
      
      return {
        id: `story-${domain}-${i}`,
        headline: a.title,
        context: contextSentences ? contextSentences.substring(0, 600) + '.' : 'See full article for background context.',
        latestUpdate: latestSentences ? latestSentences.substring(0, 400) + '.' : 'Check the source for the latest developments.',
        significance: a.confidenceScore >= 75 ? 'high' : a.confidenceScore >= 60 ? 'medium' : 'low',
        articles: [{
          id: a.id,
          title: a.title,
          source: a.sourceName,
          url: a.url,
          confidenceScore: a.confidenceScore,
          confidenceLabel: label,
          verificationUrl: `${ARGUS_BASE_URL}/verify?url=${encodeURIComponent(a.url)}`,
        }],
        avgConfidence: a.confidenceScore,
        confidenceLabel: label,
        deepVerified: false,
      };
    });
  }

  const articleList = articles.slice(0, 15).map((a, i) => {
    const label = getConfidenceLabel(a.confidenceScore);
    return `[${i + 1}] "${a.title}" (${a.sourceName}, ${label} confidence)\nContent: ${stripHtml(a.body).substring(0, 400)}...\nURL: ${a.url}`;
  }).join('\n\n');

  const prompt = `You are an intelligence analyst creating an executive briefing.

ARTICLES FROM ${domain.toUpperCase()}:
${articleList}

TASK: Group these articles into 2-4 distinct STORIES. Each story may have multiple related articles.

For each story provide:
1. HEADLINE: Clear, factual one-line headline
2. CONTEXT: 2-3 sentences explaining the issue/background (what readers need to know)
3. LATEST UPDATE: 1-2 sentences on the most recent development
4. SIGNIFICANCE: high/medium/low based on global impact
5. ARTICLE_IDS: List which article numbers [1], [2], etc. belong to this story

OUTPUT FORMAT (JSON array):
[
  {
    "headline": "...",
    "context": "...",
    "latestUpdate": "...",
    "significance": "high|medium|low",
    "articleIds": [1, 2, 5]
  }
]

RULES:
- Be concise and factual
- Context should explain WHY this matters
- Latest update should be the newest information
- Group related articles together
- Only return valid JSON array`;

  console.log(`[ClusterStories] Calling Near AI for ${domain} with ${articles.length} articles`);
  
  try {
    const response = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEARAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3.1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) throw new Error('LLM API failed');

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON found');
    
    const stories = JSON.parse(jsonMatch[0]);
    
    return stories.map((s: any, i: number) => {
      // Deduplicate article IDs (LLM sometimes returns duplicates)
      const uniqueIds = [...new Set(s.articleIds || [])] as number[];
      const storyArticles = uniqueIds.map((idx: number) => articles[idx - 1]).filter(Boolean);
      
      // Also deduplicate by URL in case of any edge cases
      const seenUrls = new Set<string>();
      const dedupedArticles = storyArticles.filter((a: Article) => {
        if (seenUrls.has(a.url)) return false;
        seenUrls.add(a.url);
        return true;
      });
      
      const avgConf = dedupedArticles.length > 0 
        ? Math.round(dedupedArticles.reduce((sum: number, a: Article) => sum + a.confidenceScore, 0) / dedupedArticles.length)
        : 50;
      
      return {
        id: `story-${domain}-${i}`,
        headline: s.headline,
        context: s.context,
        latestUpdate: s.latestUpdate,
        significance: s.significance || 'medium',
        articles: dedupedArticles.map((a: Article) => ({
          id: a.id,
          title: a.title,
          source: a.sourceName,
          url: a.url,
          confidenceScore: a.confidenceScore,
          confidenceLabel: getConfidenceLabel(a.confidenceScore),
          verificationUrl: `${ARGUS_BASE_URL}/verify?url=${encodeURIComponent(a.url)}`,
        })),
        avgConfidence: avgConf,
        confidenceLabel: getConfidenceLabel(avgConf),
        deepVerified: false,
      };
    });
  } catch (e) {
    console.error('Story clustering failed:', e);
    // Fallback with better context/latest separation
    return articles.slice(0, 3).map((a, i) => {
      const cleanBody = stripHtml(a.body);
      const sentences = cleanBody.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const contextSentences = sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ').trim();
      const latestSentences = sentences.slice(Math.ceil(sentences.length / 2)).join('. ').trim();
      const label = getConfidenceLabel(a.confidenceScore);
      
      return {
        id: `story-${domain}-${i}`,
        headline: a.title,
        context: contextSentences ? contextSentences.substring(0, 600) + '.' : 'See full article for background context.',
        latestUpdate: latestSentences ? latestSentences.substring(0, 400) + '.' : 'See full article for the latest details.',
        significance: 'medium' as const,
        articles: [{
          id: a.id,
          title: a.title,
          source: a.sourceName,
          url: a.url,
          confidenceScore: a.confidenceScore,
          confidenceLabel: label,
          verificationUrl: `${ARGUS_BASE_URL}/verify?url=${encodeURIComponent(a.url)}`,
        }],
        avgConfidence: a.confidenceScore,
        confidenceLabel: label,
        deepVerified: false,
      };
    });
  }
}

/**
 * Generate the full executive briefing
 */

/**
 * Validate article content and adjust confidence scores
 * Penalizes articles with accuracy/temporal issues
 */
async function validateArticlesForAccuracy(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;
  
  console.log(`[Validation] Validating ${articles.length} articles for content accuracy...`);
  
  const validated = await Promise.all(
    articles.map(async (article) => {
      try {
        const result = await validateArticleContent(
          article.body,
          article.title,
          article.publishedAt,
          { useLLM: true, llmSampleRate: 0.2 }
        );
        
        if (result.issues.length > 0) {
          const penaltyPercent = result.reliabilityPenalty * 100;
          const newConfidence = Math.max(10, article.confidenceScore - penaltyPercent);
          
          console.log(`[Validation] Penalized: "${article.title.substring(0, 40)}..." ${getConfidenceLabel(article.confidenceScore)} -> ${getConfidenceLabel(Math.round(newConfidence))} (${result.issues.join(', ')})`);
          
          return {
            ...article,
            confidenceScore: Math.round(newConfidence),
          };
        }
        
        return article;
      } catch (err) {
        console.error(`[Validation] Error validating article: ${err}`);
        return article;
      }
    })
  );
  
  validated.sort((a, b) => b.confidenceScore - a.confidenceScore);
  
  const penalizedCount = articles.length - validated.filter(a => a.confidenceScore === articles.find(o => o.id === a.id)?.confidenceScore).length;
  console.log(`[Validation] Complete: ${penalizedCount} articles penalized`);
  
  return validated;
}
export async function generateExecutiveBriefing(options: BriefingOptions): Promise<ExecutiveBriefing> {
  console.log(`[ExecBriefing] Starting generation with options:`, JSON.stringify(options));
  
  let articles: Article[];
  try {
    articles = await fetchArticles(options);
    
    // Validate content and adjust confidence scores for accuracy issues
    articles = await validateArticlesForAccuracy(articles);
    console.log(`[ExecBriefing] Fetched ${articles.length} articles`);
  } catch (fetchError) {
    console.error('[ExecBriefing] Failed to fetch articles:', fetchError);
    throw new Error(`Failed to fetch articles: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
  }
  
  if (articles.length === 0) {
    console.warn('[ExecBriefing] No articles found for briefing');
  }
  
  // Group by domain
  const byDomain: Record<string, Article[]> = {};
  for (const article of articles) {
    const domain = article.domain || 'Other';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(article);
  }

  // Sort domains by article count
  const sortedDomains = Object.entries(byDomain)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8); // Top 8 domains

  // Build sections with clustered stories
  const sections: BriefingSection[] = [];
  
  for (const [domain, domainArticles] of sortedDomains) {
    const slug = domainArticles[0]?.domainSlug || domain.toLowerCase().replace(/\s+/g, '-');
    const stories = await clusterIntoStories(domainArticles, domain);
    
    if (stories.length > 0) {
      sections.push({
        domain,
        domainSlug: slug,
        icon: DOMAIN_ICONS[slug] || DOMAIN_ICONS.default,
        stories, // Show all stories in domain
      });
    }
  }

  // Calculate summary stats
  const totalStories = sections.reduce((sum, s) => sum + s.stories.length, 0);
  const avgConfidence = articles.length > 0
    ? Math.round(articles.reduce((sum, a) => sum + a.confidenceScore, 0) / articles.length)
    : 0;

  // Estimate read time: ~200 words/min, ~5 words per story headline + context
  const wordCount = sections.reduce((sum, s) => 
    sum + s.stories.reduce((sSum, story) => 
      sSum + story.headline.split(' ').length + story.context.split(' ').length + story.latestUpdate.split(' ').length + 50
    , 0)
  , 0);
  const readTimeMinutes = Math.max(5, Math.min(12, Math.round(wordCount / 180)));

  const now = new Date();
  const briefingId = `briefing-${now.getTime()}`;
  
  const timezone = options.timezone || 'America/New_York';
  const timeOfDay = getTimeOfDayLabel(timezone);
  
  const typeLabels: Record<string, string> = {
    morning: 'Morning Intelligence Briefing',
    afternoon: 'Afternoon Intelligence Update',
    evening: 'Evening Intelligence Briefing',
    weekly: 'Weekly Strategic Summary',
  };

  const briefing: ExecutiveBriefing = {
    id: briefingId,
    title: options.type === 'weekly' ? typeLabels.weekly : typeLabels[timeOfDay],
    subtitle: formatDateInTimezone(now, timezone),
    generatedAt: now,
    readTimeMinutes,
    sections,
    summary: {
      totalArticles: articles.length,
      totalStories,
      avgConfidence,
      confidenceLabel: getConfidenceLabel(avgConfidence),
      topDomains: sortedDomains.slice(0, 5).map(([d]) => d),
    },
    htmlContent: '',
    markdownContent: '',
  };

  // Generate formatted content
  briefing.htmlContent = generateHTML(briefing);
  briefing.markdownContent = generateMarkdown(briefing);
  
  // Generate TTS script if requested
  if (options.includeTTS) {
    briefing.ttsScript = generateTTSScript(briefing);
  }

  return briefing;
}

/**
 * Format date nicely
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' • ' + date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Get time of day label based on hour in user's timezone
 */
function getTimeOfDayLabel(timezone: string = 'America/New_York'): 'morning' | 'afternoon' | 'evening' {
  const now = new Date();
  let hour: number;
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    hour = parseInt(hourPart?.value || '12', 10);
  } catch {
    hour = now.getUTCHours();
  }
  
  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon';
  } else {
    return 'evening';
  }
}

/**
 * Format date in user's timezone
 */
function formatDateInTimezone(date: Date, timezone: string = 'America/New_York'): string {
  try {
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return formatDate(date);
  }
}


/**
 * Generate confidence badge HTML
 */
function confidenceBadge(score: number, articleId?: string): string {
  const label = getConfidenceLabel(score);
  const color = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
  const colors = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
  };
  const link = articleId ? `href="${ARGUS_BASE_URL}/article/${articleId}#verification"` : '';
  return `<a ${link} class="inline-flex items-center px-2 py-1 rounded text-xs font-medium ${colors[color]} hover:opacity-80">${label} confidence</a>`;
}

/**
 * Generate HTML content
 */
function generateHTML(briefing: ExecutiveBriefing): string {
  let html = `
<div class="executive-briefing">
  <header class="mb-8">
    <h1 class="text-3xl font-bold text-slate-800">${briefing.title}</h1>
    <p class="text-slate-500 mt-1">${briefing.subtitle}</p>
    <div class="flex items-center gap-4 mt-3 text-sm text-slate-600">
      <span>📊 ${briefing.summary.totalStories} stories from ${briefing.summary.totalArticles} sources</span>
      <span>⏱️ ${briefing.readTimeMinutes} min read</span>
      <span>✅ ${briefing.summary.confidenceLabel} confidence</span>
    </div>
  </header>
`;

  for (const section of briefing.sections) {
    html += `
  <section class="mb-8">
    <h2 class="text-xl font-semibold text-slate-700 mb-4 flex items-center gap-2">
      <span>${section.icon}</span>
      <span>${section.domain}</span>
    </h2>
`;
    
    for (const story of section.stories) {
      const sigColors = {
        high: 'border-l-red-500',
        medium: 'border-l-yellow-500',
        low: 'border-l-slate-300',
      };
      
      html += `
    <article class="mb-6 pl-4 border-l-4 ${sigColors[story.significance]}">
      <h3 class="text-lg font-medium text-slate-800 mb-2">
        ${story.headline}
        ${confidenceBadge(story.avgConfidence, story.articles[0]?.id)}
      </h3>
      <p class="text-slate-600 mb-2"><strong>Context:</strong> ${story.context}</p>
      <p class="text-slate-700 mb-3"><strong>Latest:</strong> ${story.latestUpdate}</p>
      <div class="text-sm text-slate-500">
        <span class="font-medium">Sources:</span>
        ${story.articles.map(a => 
          `<a href="${a.url}" target="_blank" class="text-argus-600 hover:underline ml-2">${a.source} (${a.confidenceLabel})</a>`
        ).join(', ')}
        <a href="${story.articles[0]?.verificationUrl}" class="ml-3 text-argus-600 hover:underline">🔍 Verify</a>
      </div>
    </article>
`;
    }
    
    html += `  </section>\n`;
  }

  html += `</div>`;
  return html;
}

/**
 * Generate Markdown content
 */
function generateMarkdown(briefing: ExecutiveBriefing): string {
  let md = `# ${briefing.title}

*${briefing.subtitle}*

📊 ${briefing.summary.totalStories} stories • ⏱️ ${briefing.readTimeMinutes} min read • ✅ ${briefing.summary.confidenceLabel} confidence

---

`;

  for (const section of briefing.sections) {
    md += `## ${section.icon} ${section.domain}\n\n`;
    
    for (const story of section.stories) {
      const sigMarker = story.significance === 'high' ? '🔴' : story.significance === 'medium' ? '🟡' : '⚪';
      
      const primaryArticle = story.articles[0];
      md += `### ${sigMarker} ${story.headline}\n\n`;
      md += `**Confidence: ${story.confidenceLabel}** | [Verify](${primaryArticle?.verificationUrl})\n\n`;
      md += `**Context:** ${story.context}\n\n`;
      md += `**Latest:** ${story.latestUpdate}\n\n`;
      md += `**📰 Related Articles:**\n`;
      for (const a of story.articles) {
        md += `- [${a.title || a.source}](${a.url}) — *${a.source}* (${a.confidenceLabel})\n`;
      }
      md += `\n`;
    }
    
    md += `---\n\n`;
  }

  md += `\n*Generated by Argus Intelligence Platform*\n`;
  return md;
}

/**
 * Generate TTS-optimized script for audio version
 */
function generateTTSScript(briefing: ExecutiveBriefing): string {
  const lines: string[] = [];
  
  // Intro
  lines.push(`This is your ${briefing.title.toLowerCase()} for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`);
  lines.push('');
  lines.push(`Today we're covering ${briefing.summary.totalStories} stories across ${briefing.sections.length} domains. Let's begin.`);
  lines.push('');
  
  for (const section of briefing.sections) {
    // Section header
    lines.push(`Moving to ${section.domain}.`);
    lines.push('');
    
    for (let i = 0; i < section.stories.length; i++) {
      const story = section.stories[i];
      const prefix = story.significance === 'high' ? 'Breaking development: ' : '';
      
      // Headline
      lines.push(`${prefix}${story.headline}.`);
      lines.push('');
      
      // Context
      lines.push(story.context);
      lines.push('');
      
      // Latest update
      lines.push(`The latest: ${story.latestUpdate}`);
      lines.push('');
      
      // Confidence
      if (story.avgConfidence >= 80) {
        lines.push(`This story has high confidence and is verified across ${story.articles.length} sources.`);
      } else if (story.avgConfidence >= 60) {
        lines.push(`Confidence level: medium. We recommend verifying with additional sources.`);
      } else {
        lines.push(`Note: This is an emerging story with low confidence. Treat as preliminary.`);
      }
      lines.push('');
      
      if (i < section.stories.length - 1) {
        lines.push('Next story.');
        lines.push('');
      }
    }
    
    lines.push('');
  }
  
  // Outro
  lines.push(`That concludes today's briefing. For full verification details and source links, visit argus dot vitalpoint dot AI.`);
  lines.push('');
  lines.push('Stay informed. Stay ahead.');
  
  return lines.join('\n');
}

export { BriefingOptions, ExecutiveBriefing, BriefingSection, StoryCluster, getConfidenceLabel };

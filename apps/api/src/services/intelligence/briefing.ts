import { db, content, sources, domains, briefings, userDomains } from '../../db';
import { eq, desc, gte, and, inArray, sql } from 'drizzle-orm';
import { llm } from './llm';

export interface ArticleReference {
  id: string;
  title: string;
  url: string;
  source: string;
  domain: string;
}

export interface BriefingContent {
  summary: string;
  executiveSummary?: string;
  keyThemes?: string[];
  changes: Change[];
  forecasts: Forecast[];
  contentIds: string[];
  sources: ArticleReference[];
}

export interface Change {
  domain: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
  contentId: string;
  url: string;
  source?: string;
}

export interface Forecast {
  event: string;
  probability: number;
  timeframe: 'near' | 'mid' | 'long';
  reasoning: string;
  confidence: number;
}

/**
 * Generate a briefing for a user
 * In production, this would call an LLM API (Claude, GPT-4, etc.)
 * For now, we generate a structured summary from the content
 */
export async function generateBriefing(
  userId: string,
  type: 'morning' | 'evening' | 'alert' = 'morning',
  options: {
    minConfidence?: number;
    hoursBack?: number;
    maxItems?: number;
  } = {}
): Promise<BriefingContent> {
  const {
    minConfidence = 50,
    hoursBack = type === 'morning' ? 12 : 8,
    maxItems = 50,
  } = options;

  // Get user's domains
  const userDomainIds = await db
    .select({ domainId: userDomains.domainId })
    .from(userDomains)
    .where(eq(userDomains.userId, userId));

  const domainIds = userDomainIds.map(d => d.domainId);

  // If user has no domains set, use all domains
  const useAllDomains = domainIds.length === 0;

  // Get recent content
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  // Build the where condition
  const whereCondition = useAllDomains
    ? and(
        gte(content.publishedAt, since),
        gte(content.confidenceScore, minConfidence)
      )
    : and(
        gte(content.publishedAt, since),
        gte(content.confidenceScore, minConfidence),
        inArray(sources.domainId, domainIds)
      );
  
  const items = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      url: content.url,
      publishedAt: content.publishedAt,
      confidenceScore: content.confidenceScore,
      sourceName: sources.name,
      domainName: domains.name,
      domainSlug: domains.slug,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(whereCondition)
    .orderBy(desc(content.confidenceScore), desc(content.publishedAt))
    .limit(maxItems);

  if (items.length === 0) {
    return {
      summary: 'No significant developments to report in your monitored domains.',
      executiveSummary: 'No new intelligence available.',
      keyThemes: [],
      changes: [],
      forecasts: [],
      contentIds: [],
      sources: [],
    };
  }

  // Group content by domain
  const byDomain = items.reduce((acc, item) => {
    const domain = item.domainSlug || 'unknown';
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  // Check if LLM is available
  const useLLM = !!process.env.NEARAI_API_KEY;

  let summary: string;
  let changes: Change[];
  let forecasts: Forecast[];

  // Build sources array with URLs
  const sourcesArray: ArticleReference[] = items.map(item => ({
    id: item.id,
    title: item.title,
    url: item.url,
    source: item.sourceName || 'Unknown',
    domain: item.domainName || 'Unknown',
  }));

  // Extract key themes from domains
  const keyThemes = [...new Set(items.map(i => i.domainName).filter(Boolean))] as string[];

  if (useLLM) {
    try {
      // Use LLM for intelligent analysis
      const articles = items.map(item => ({
        title: item.title,
        body: item.body || '',
        domain: item.domainName || 'Unknown',
        source: item.sourceName || 'Unknown',
        url: item.url,
      }));

      // Generate LLM summary
      summary = await llm.summarizeArticles(articles, 'executive');

      // Analyze changes with LLM
      const llmChanges = await llm.analyzeChanges(articles);
      changes = llmChanges.map((c, i) => ({
        domain: articles[i]?.domain || 'Unknown',
        description: c.description,
        significance: c.significance,
        contentId: items[i]?.id || '',
        url: items[i]?.url || '',
        source: items[i]?.sourceName || 'Unknown',
      }));

      // Generate LLM forecasts
      const domainNames = [...new Set(items.map(i => i.domainName).filter(Boolean))] as string[];
      const developments = items.slice(0, 10).map(i => i.title);
      const llmForecasts = await llm.generateForecasts(developments, domainNames);
      forecasts = llmForecasts.map(f => ({
        event: f.event,
        probability: f.probability,
        timeframe: f.timeframe,
        reasoning: f.reasoning,
        confidence: Math.round(f.probability * 0.8), // Calibration factor
      }));
    } catch (error) {
      console.error('LLM analysis failed, falling back to basic:', error);
      // Fallback to basic analysis
      summary = generateSummary(byDomain);
      changes = identifyChanges(items);
      forecasts = generateForecasts(byDomain);
    }
  } else {
    // Fallback to basic analysis
    summary = generateSummary(byDomain);
    changes = identifyChanges(items);
    forecasts = generateForecasts(byDomain);
  }

  // Generate executive summary (top 3 most significant items)
  const topItems = items.slice(0, 3);
  const executiveSummary = topItems.length > 0
    ? `Key developments: ${topItems.map(i => i.title).join('; ')}`
    : 'No major developments.';

  return {
    summary,
    executiveSummary,
    keyThemes,
    changes,
    forecasts,
    contentIds: items.map(i => i.id),
    sources: sourcesArray,
  };
}

function generateSummary(byDomain: Record<string, any[]>): string {
  const parts: string[] = [];
  
  for (const [domain, items] of Object.entries(byDomain)) {
    const count = items.length;
    const topItems = items.slice(0, 3);
    const domainName = items[0]?.domainName || domain;
    
    parts.push(`**${domainName}** (${count} articles):`);
    
    for (const item of topItems) {
      // Include source and URL in summary
      const sourceInfo = item.sourceName ? ` (${item.sourceName})` : '';
      const urlLink = item.url ? ` [Link](${item.url})` : '';
      parts.push(`• ${item.title}${sourceInfo}${urlLink}`);
    }
    
    if (count > 3) {
      parts.push(`  ...and ${count - 3} more`);
    }
    
    parts.push('');
  }

  return parts.join('\n');
}

function identifyChanges(items: any[]): Change[] {
  const changes: Change[] = [];
  
  // Find high-confidence items with significant keywords
  const significantTerms = [
    { terms: ['breaking', 'urgent', 'alert', 'crisis'], significance: 'high' as const },
    { terms: ['announces', 'confirms', 'reports', 'reveals'], significance: 'medium' as const },
    { terms: ['update', 'new', 'latest'], significance: 'low' as const },
  ];
  
  for (const item of items) {
    const title = item.title.toLowerCase();
    
    for (const { terms, significance } of significantTerms) {
      if (terms.some(t => title.includes(t))) {
        changes.push({
          domain: item.domainName || 'Unknown',
          description: item.title,
          significance,
          contentId: item.id,
          url: item.url || '',
          source: item.sourceName || 'Unknown',
        });
        break;
      }
    }
  }
  
  // Limit to top 10 changes, prioritize high significance
  return changes
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.significance] - order[b.significance];
    })
    .slice(0, 10);
}

function generateForecasts(byDomain: Record<string, any[]>): Forecast[] {
  // Placeholder forecasts based on domain activity
  // In production, this would be LLM-generated with proper analysis
  const forecasts: Forecast[] = [];
  
  for (const [domain, items] of Object.entries(byDomain)) {
    if (items.length >= 5) {
      forecasts.push({
        event: `Continued high activity in ${items[0]?.domainName || domain}`,
        probability: 70,
        timeframe: 'near',
        reasoning: `${items.length} articles in this domain suggest ongoing developments`,
        confidence: 60,
      });
    }
  }
  
  return forecasts.slice(0, 5);
}

/**
 * Save briefing to database
 */
export async function saveBriefing(
  userId: string,
  type: 'morning' | 'evening' | 'alert',
  briefingContent: BriefingContent,
  deliveryChannels: string[] = ['web']
): Promise<string> {
  // Build extended summary with executive summary if available
  const fullSummary = briefingContent.executiveSummary 
    ? `**EXECUTIVE SUMMARY**\n${briefingContent.executiveSummary}\n\n**KEY THEMES:** ${(briefingContent.keyThemes || []).join(', ')}\n\n${briefingContent.summary}`
    : briefingContent.summary;

  const [briefing] = await db.insert(briefings).values({
    userId,
    type,
    summary: fullSummary,
    changes: briefingContent.changes,
    forecasts: briefingContent.forecasts,
    contentIds: [...briefingContent.contentIds, { sources: briefingContent.sources }], // Store sources in contentIds JSONB
    deliveryChannels,
  }).returning();

  return briefing.id;
}

/**
 * Generate and save a briefing
 */
export async function createBriefing(
  userId: string,
  type: 'morning' | 'evening' | 'alert' = 'morning'
): Promise<{ id: string; content: BriefingContent }> {
  const content = await generateBriefing(userId, type);
  const id = await saveBriefing(userId, type, content);
  return { id, content };
}

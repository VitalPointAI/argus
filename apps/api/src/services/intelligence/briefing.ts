import { db, content, sources, domains, briefings, userDomains } from '../../db';
import { eq, desc, gte, and, inArray, sql } from 'drizzle-orm';

export interface BriefingContent {
  summary: string;
  changes: Change[];
  forecasts: Forecast[];
  contentIds: string[];
}

export interface Change {
  domain: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
  contentId: string;
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
  
  let query = db
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
    .where(
      and(
        gte(content.publishedAt, since),
        gte(content.confidenceScore, minConfidence)
      )
    )
    .orderBy(desc(content.confidenceScore), desc(content.publishedAt))
    .limit(maxItems);

  if (!useAllDomains) {
    query = query.where(
      and(
        gte(content.publishedAt, since),
        gte(content.confidenceScore, minConfidence),
        inArray(sources.domainId, domainIds)
      )
    ) as typeof query;
  }

  const items = await query;

  if (items.length === 0) {
    return {
      summary: 'No significant developments to report in your monitored domains.',
      changes: [],
      forecasts: [],
      contentIds: [],
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

  // Generate summary (in production, this would be LLM-generated)
  const summary = generateSummary(byDomain);
  
  // Identify significant changes
  const changes = identifyChanges(items);
  
  // Generate forecasts (placeholder - would be LLM-generated)
  const forecasts = generateForecasts(byDomain);

  return {
    summary,
    changes,
    forecasts,
    contentIds: items.map(i => i.id),
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
      parts.push(`• ${item.title}`);
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
  const [briefing] = await db.insert(briefings).values({
    userId,
    type,
    summary: briefingContent.summary,
    changes: briefingContent.changes,
    forecasts: briefingContent.forecasts,
    contentIds: briefingContent.contentIds,
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

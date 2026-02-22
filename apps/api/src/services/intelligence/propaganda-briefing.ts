/**
 * Propaganda Analysis Briefing
 * Compares regional perspectives on the same topics to identify narrative divergences
 */

import { db, content, sources, domains } from '../../db';
import { desc, sql, gte, and } from 'drizzle-orm';
import { 
  Region, 
  REGION_LABELS, 
  getSourceRegion, 
  DivergenceLevel,
  DIVERGENCE_LABELS 
} from './regional-mapping';

// NEAR AI Cloud API - https://docs.near.ai/cloud/guides/openai-compatibility
const NEAR_AI_BASE = 'https://cloud-api.near.ai/v1';
const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || 'deepseek-ai/DeepSeek-V3.1';

interface RegionalPerspective {
  region: Region;
  regionLabel: string;
  articleCount: number;
  summary: string;
  keyPoints: string[];
  tone: 'positive' | 'negative' | 'neutral' | 'mixed';
  emphasis: string[];
}

interface TopicAnalysis {
  topic: string;
  totalArticles: number;
  perspectives: RegionalPerspective[];
  divergenceLevel: DivergenceLevel;
  divergenceAnalysis: string;
  truthAssessment: string;
  recommendations: string;
}

interface PropagandaBriefing {
  title: string;
  generatedAt: string;
  hoursAnalyzed: number;
  topicsAnalyzed: TopicAnalysis[];
  overallFindings: string;
  markdownContent: string;
}

/**
 * Get articles grouped by topic and region
 */
async function getArticlesByTopicAndRegion(hoursBack: number = 48): Promise<Map<string, Map<Region, any[]>>> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  const articles = await db.select({
    id: content.id,
    title: content.title,
    summary: content.summary,
    topics: content.topics,
    body: content.body,
    url: content.url,
    publishedAt: content.publishedAt,
    sourceId: sources.id,
    sourceName: sources.name,
    sourceUrl: sources.url,
  })
    .from(content)
    .leftJoin(sources, sql`${content.sourceId} = ${sources.id}`)
    .where(and(
      gte(content.fetchedAt, since),
      sql`${content.topics} != '[]'::jsonb`
    ))
    .orderBy(desc(content.publishedAt))
    .limit(500);

  // Group by topic and region
  const topicRegionMap = new Map<string, Map<Region, any[]>>();
  
  for (const article of articles) {
    const topics = (article.topics as string[]) || [];
    const region = getSourceRegion(
      article.sourceId || '', 
      article.sourceName || '', 
      article.sourceUrl || ''
    );
    
    if (!region) continue;
    
    for (const topic of topics) {
      if (!topicRegionMap.has(topic)) {
        topicRegionMap.set(topic, new Map());
      }
      const regionMap = topicRegionMap.get(topic)!;
      if (!regionMap.has(region)) {
        regionMap.set(region, []);
      }
      regionMap.get(region)!.push(article);
    }
  }
  
  return topicRegionMap;
}

/**
 * Analyze regional perspectives on a topic using LLM
 */
async function analyzeTopicDivergence(
  topic: string,
  regionArticles: Map<Region, any[]>
): Promise<TopicAnalysis> {
  const perspectives: RegionalPerspective[] = [];
  
  // Build context for each region
  const regionSummaries: string[] = [];
  
  for (const [region, articles] of regionArticles) {
    if (articles.length === 0) continue;
    
    const articleTexts = articles.slice(0, 5).map(a => 
      `- ${a.title}: ${a.summary || a.body?.substring(0, 200) || ''}`
    ).join('\n');
    
    regionSummaries.push(`## ${REGION_LABELS[region]} (${articles.length} articles):\n${articleTexts}`);
  }
  
  if (regionSummaries.length < 2) {
    // Not enough regional diversity for comparison
    return {
      topic,
      totalArticles: Array.from(regionArticles.values()).reduce((a, b) => a + b.length, 0),
      perspectives: [],
      divergenceLevel: 'none',
      divergenceAnalysis: 'Insufficient regional coverage for comparison',
      truthAssessment: 'Unable to assess - single region coverage',
      recommendations: 'Seek additional sources from other regions',
    };
  }

  const prompt = `Analyze how different regions report on "${topic}". Compare their narratives, identify divergences, and assess which is closer to factual truth.

${regionSummaries.join('\n\n')}

Respond in JSON:
{
  "perspectives": [
    {
      "region": "western|european|russian|chinese|asian|middle_east|latam|african",
      "summary": "Brief summary of this region's narrative",
      "keyPoints": ["point1", "point2"],
      "tone": "positive|negative|neutral|mixed",
      "emphasis": ["what they emphasize", "what they downplay"]
    }
  ],
  "divergenceLevel": "none|partial|strong",
  "divergenceAnalysis": "Key differences between regional narratives",
  "truthAssessment": "Which perspective appears closer to factual truth and why",
  "recommendations": "What readers should consider"
}`;

  try {
    const response = await fetch(`${NEAR_AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEAR_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: NEAR_AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        topic,
        totalArticles: Array.from(regionArticles.values()).reduce((a, b) => a + b.length, 0),
        perspectives: (parsed.perspectives || []).map((p: any) => ({
          region: p.region,
          regionLabel: REGION_LABELS[p.region as Region] || p.region,
          articleCount: regionArticles.get(p.region as Region)?.length || 0,
          summary: p.summary || '',
          keyPoints: p.keyPoints || [],
          tone: p.tone || 'neutral',
          emphasis: p.emphasis || [],
        })),
        divergenceLevel: parsed.divergenceLevel || 'partial',
        divergenceAnalysis: parsed.divergenceAnalysis || '',
        truthAssessment: parsed.truthAssessment || '',
        recommendations: parsed.recommendations || '',
      };
    }
  } catch (err) {
    console.error('[Propaganda] Analysis error:', err);
  }

  return {
    topic,
    totalArticles: Array.from(regionArticles.values()).reduce((a, b) => a + b.length, 0),
    perspectives: [],
    divergenceLevel: 'partial',
    divergenceAnalysis: 'Analysis failed',
    truthAssessment: 'Unable to assess',
    recommendations: 'Manual review recommended',
  };
}

/**
 * Generate full propaganda analysis briefing
 */
export async function generatePropagandaBriefing(options: {
  hoursBack?: number;
  maxTopics?: number;
  regions?: Region[]; // Optional: compare only specific regions
  specificTopic?: string; // Optional: analyze a specific topic
}): Promise<PropagandaBriefing> {
  const hoursBack = options.hoursBack || 48;
  const maxTopics = options.maxTopics || 5;
  
  console.log(`[Propaganda] Generating briefing for last ${hoursBack}h${options.specificTopic ? ` focusing on: ${options.specificTopic}` : ''}...`);
  
  // Get articles grouped by topic and region
  const topicRegionMap = await getArticlesByTopicAndRegion(hoursBack);
  
  // Filter to topics with multi-regional coverage
  const topicsWithDiversity: Array<{ topic: string; regions: number; articles: number }> = [];
  
  for (const [topic, regionMap] of topicRegionMap) {
    // Filter by requested regions if specified
    let filteredRegions = regionMap;
    if (options.regions && options.regions.length > 0) {
      filteredRegions = new Map(
        Array.from(regionMap.entries())
          .filter(([region]) => options.regions!.includes(region))
      );
    }
    
    if (filteredRegions.size >= 2) {
      topicsWithDiversity.push({
        topic,
        regions: filteredRegions.size,
        articles: Array.from(filteredRegions.values()).reduce((a, b) => a + b.length, 0),
      });
    }
  }
  
  // Sort by regional diversity and article count
  topicsWithDiversity.sort((a, b) => {
    if (b.regions !== a.regions) return b.regions - a.regions;
    return b.articles - a.articles;
  });
  
  // If specific topic requested, prioritize it
  let topicsToAnalyze: Array<{ topic: string; regions: number; articles: number }>;
  
  if (options.specificTopic) {
    // Find matching topic (case-insensitive partial match)
    const searchTerm = options.specificTopic.toLowerCase();
    const matchingTopics = topicsWithDiversity.filter(t => 
      t.topic.toLowerCase().includes(searchTerm) || 
      searchTerm.includes(t.topic.toLowerCase())
    );
    
    if (matchingTopics.length > 0) {
      // Use matching topics, fill with others if needed
      topicsToAnalyze = [
        ...matchingTopics.slice(0, maxTopics),
        ...topicsWithDiversity.filter(t => !matchingTopics.includes(t)).slice(0, Math.max(0, maxTopics - matchingTopics.length))
      ].slice(0, maxTopics);
    } else {
      // No match found, use default selection
      console.log(`[Propaganda] No articles found for topic: ${options.specificTopic}, using random selection`);
      topicsToAnalyze = topicsWithDiversity.slice(0, maxTopics);
    }
  } else {
    topicsToAnalyze = topicsWithDiversity.slice(0, maxTopics);
  }
  const analyses: TopicAnalysis[] = [];
  
  for (const { topic } of topicsToAnalyze) {
    let regionMap = topicRegionMap.get(topic)!;
    if (options.regions && options.regions.length > 0) {
      regionMap = new Map(
        Array.from(regionMap.entries())
          .filter(([region]) => options.regions!.includes(region))
      );
    }
    
    const analysis = await analyzeTopicDivergence(topic, regionMap);
    analyses.push(analysis);
  }
  
  // Generate overall findings
  const strongDivergences = analyses.filter(a => a.divergenceLevel === 'strong').length;
  const partialDivergences = analyses.filter(a => a.divergenceLevel === 'partial').length;
  
  const overallFindings = `Analyzed ${analyses.length} topics across multiple regions. Found ${strongDivergences} topics with strong narrative divergence and ${partialDivergences} with partial divergence. ${strongDivergences > 0 ? 'Significant propaganda activity detected.' : 'Moderate narrative alignment across regions.'}`;
  
  // Generate markdown
  const markdownContent = generateMarkdown(analyses, overallFindings, hoursBack);
  
  return {
    title: 'Regional Narrative Divergence Analysis',
    generatedAt: new Date().toISOString(),
    hoursAnalyzed: hoursBack,
    topicsAnalyzed: analyses,
    overallFindings,
    markdownContent,
  };
}

/**
 * Compare two specific regions
 */
export async function compareRegions(
  region1: Region,
  region2: Region,
  options: { hoursBack?: number; maxTopics?: number; specificTopic?: string } = {}
): Promise<PropagandaBriefing> {
  return generatePropagandaBriefing({
    ...options,
    regions: [region1, region2],
  });
}

/**
 * Generate markdown report
 */
function generateMarkdown(
  analyses: TopicAnalysis[], 
  overallFindings: string,
  hoursBack: number
): string {
  const now = new Date();
  const lines: string[] = [];
  
  lines.push(`# 🔍 Regional Narrative Divergence Analysis`);
  lines.push('');
  lines.push(`*Generated: ${now.toUTCString()} | Analysis Period: ${hoursBack}h*`);
  lines.push('');
  lines.push(`## Executive Summary`);
  lines.push('');
  lines.push(overallFindings);
  lines.push('');
  
  // Divergence overview
  lines.push(`## Divergence Overview`);
  lines.push('');
  lines.push('| Topic | Regions | Divergence | Assessment |');
  lines.push('|-------|---------|------------|------------|');
  
  for (const analysis of analyses) {
    const div = DIVERGENCE_LABELS[analysis.divergenceLevel];
    const regions = analysis.perspectives.map(p => p.regionLabel.split(' ')[0]).join(' ');
    lines.push(`| ${analysis.topic} | ${regions} | ${div.emoji} ${div.label} | ${analysis.truthAssessment.substring(0, 50)}... |`);
  }
  
  lines.push('');
  
  // Detailed analysis for each topic
  for (const analysis of analyses) {
    const div = DIVERGENCE_LABELS[analysis.divergenceLevel];
    
    lines.push(`---`);
    lines.push('');
    lines.push(`## ${analysis.topic}`);
    lines.push('');
    lines.push(`**Divergence Level:** ${div.emoji} ${div.label}`);
    lines.push('');
    lines.push(`**Articles Analyzed:** ${analysis.totalArticles}`);
    lines.push('');
    
    // Regional perspectives
    lines.push(`### Regional Perspectives`);
    lines.push('');
    
    for (const p of analysis.perspectives) {
      lines.push(`#### ${p.regionLabel} (${p.articleCount} articles)`);
      lines.push('');
      lines.push(`**Tone:** ${p.tone}`);
      lines.push('');
      lines.push(`**Summary:** ${p.summary}`);
      lines.push('');
      if (p.keyPoints.length > 0) {
        lines.push(`**Key Points:**`);
        for (const point of p.keyPoints) {
          lines.push(`- ${point}`);
        }
        lines.push('');
      }
      if (p.emphasis.length > 0) {
        lines.push(`**Emphasis:** ${p.emphasis.join(', ')}`);
        lines.push('');
      }
    }
    
    // Analysis
    lines.push(`### Divergence Analysis`);
    lines.push('');
    lines.push(analysis.divergenceAnalysis);
    lines.push('');
    
    lines.push(`### Truth Assessment`);
    lines.push('');
    lines.push(analysis.truthAssessment);
    lines.push('');
    
    lines.push(`### Recommendations`);
    lines.push('');
    lines.push(analysis.recommendations);
    lines.push('');
  }
  
  // Legend
  lines.push(`---`);
  lines.push('');
  lines.push(`## Legend`);
  lines.push('');
  lines.push(`- ✅ **No Divergence:** Regional narratives largely align`);
  lines.push(`- ⚠️ **Partial Divergence:** Some differences in framing or emphasis`);
  lines.push(`- 🚨 **Strong Divergence:** Significant contradictions or propaganda indicators`);
  lines.push('');
  
  return lines.join('\n');
}

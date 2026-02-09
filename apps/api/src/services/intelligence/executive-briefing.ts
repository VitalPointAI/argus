/**
 * Executive Briefing Generator
 * 
 * Produces structured, readable intelligence briefings with:
 * - Clear sections by domain/topic
 * - Context + latest updates for each story
 * - Confidence scores and verification links
 * - Article citations
 * - TTS-ready format option
 */

import { db, content, sources, domains } from '../../db';
import { eq, desc, gte, and, sql, inArray } from 'drizzle-orm';

const NEARAI_API_KEY = process.env.NEARAI_API_KEY;
const ARGUS_BASE_URL = process.env.ARGUS_BASE_URL || 'https://argus.vitalpoint.ai';

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
    verificationUrl: string;
  }[];
  avgConfidence: number;
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
  includeTTS?: boolean;
}

/**
 * Fetch articles with full metadata
 * Optionally filtered by user's domain preferences
 */
async function fetchArticles(options: BriefingOptions): Promise<Article[]> {
  const hoursBack = options.hoursBack || (options.type === 'morning' ? 14 : 10);
  const minConfidence = options.minConfidence || 45;
  const maxArticles = options.maxArticles || 100;
  
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  // Build conditions
  // Note: confidenceScore can be NULL for unverified articles
  // Use COALESCE to treat NULL as 50 (unverified default)
  const conditions = [
    gte(content.fetchedAt, since),
    sql`COALESCE(${content.confidenceScore}, 50) >= ${minConfidence}`,
    sql`LENGTH(${content.body}) >= 200`
  ];
  
  // Add domain filter if specified (from user preferences)
  if (options.domainIds && options.domainIds.length > 0) {
    conditions.push(inArray(sources.domainId, options.domainIds));
  }
  
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
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(and(...conditions))
    .orderBy(desc(content.confidenceScore), desc(content.publishedAt))
    .limit(maxArticles);

  return articles.map(a => ({
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
  }));
}

/**
 * Call LLM to cluster and summarize articles into stories
 */
async function clusterIntoStories(articles: Article[], domain: string): Promise<StoryCluster[]> {
  if (!NEARAI_API_KEY || articles.length === 0) {
    // Fallback: treat each article as its own story
    return articles.slice(0, 5).map((a, i) => ({
      id: `story-${domain}-${i}`,
      headline: a.title,
      context: a.body.substring(0, 300) + '...',
      latestUpdate: a.body.substring(0, 200),
      significance: a.confidenceScore >= 75 ? 'high' : a.confidenceScore >= 60 ? 'medium' : 'low',
      articles: [{
        id: a.id,
        title: a.title,
        source: a.sourceName,
        url: a.url,
        confidenceScore: a.confidenceScore,
        verificationUrl: `${ARGUS_BASE_URL}/article/${a.id}#verification`,
      }],
      avgConfidence: a.confidenceScore,
      deepVerified: false,
    }));
  }

  const articleList = articles.slice(0, 15).map((a, i) => 
    `[${i + 1}] "${a.title}" (${a.sourceName}, ${a.confidenceScore}% confidence)\nContent: ${a.body.substring(0, 400)}...\nURL: ${a.url}`
  ).join('\n\n');

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
      const storyArticles = (s.articleIds || []).map((idx: number) => articles[idx - 1]).filter(Boolean);
      const avgConf = storyArticles.length > 0 
        ? Math.round(storyArticles.reduce((sum: number, a: Article) => sum + a.confidenceScore, 0) / storyArticles.length)
        : 50;
      
      return {
        id: `story-${domain}-${i}`,
        headline: s.headline,
        context: s.context,
        latestUpdate: s.latestUpdate,
        significance: s.significance || 'medium',
        articles: storyArticles.map((a: Article) => ({
          id: a.id,
          title: a.title,
          source: a.sourceName,
          url: a.url,
          confidenceScore: a.confidenceScore,
          verificationUrl: `${ARGUS_BASE_URL}/article/${a.id}#verification`,
        })),
        avgConfidence: avgConf,
        deepVerified: false,
      };
    });
  } catch (e) {
    console.error('Story clustering failed:', e);
    // Fallback
    return articles.slice(0, 3).map((a, i) => ({
      id: `story-${domain}-${i}`,
      headline: a.title,
      context: a.body.substring(0, 300) + '...',
      latestUpdate: 'See full article for details.',
      significance: 'medium' as const,
      articles: [{
        id: a.id,
        title: a.title,
        source: a.sourceName,
        url: a.url,
        confidenceScore: a.confidenceScore,
        verificationUrl: `${ARGUS_BASE_URL}/article/${a.id}#verification`,
      }],
      avgConfidence: a.confidenceScore,
      deepVerified: false,
    }));
  }
}

/**
 * Generate the full executive briefing
 */
export async function generateExecutiveBriefing(options: BriefingOptions): Promise<ExecutiveBriefing> {
  const articles = await fetchArticles(options);
  
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
        stories: stories.slice(0, 4), // Max 4 stories per domain
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
  
  const typeLabels = {
    morning: 'Morning Intelligence Briefing',
    evening: 'Evening Intelligence Update',
    weekly: 'Weekly Strategic Summary',
  };

  const briefing: ExecutiveBriefing = {
    id: briefingId,
    title: typeLabels[options.type],
    subtitle: formatDate(now),
    generatedAt: now,
    readTimeMinutes,
    sections,
    summary: {
      totalArticles: articles.length,
      totalStories,
      avgConfidence,
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
 * Generate confidence badge HTML
 */
function confidenceBadge(score: number, articleId?: string): string {
  const color = score >= 75 ? 'green' : score >= 60 ? 'yellow' : 'red';
  const colors = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
  };
  const link = articleId ? `href="${ARGUS_BASE_URL}/article/${articleId}#verification"` : '';
  return `<a ${link} class="inline-flex items-center px-2 py-1 rounded text-xs font-medium ${colors[color]} hover:opacity-80">${score}% verified</a>`;
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
      <span>✅ ${briefing.summary.avgConfidence}% avg confidence</span>
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
          `<a href="${a.url}" target="_blank" class="text-argus-600 hover:underline ml-2">${a.source} (${a.confidenceScore}%)</a>`
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

📊 ${briefing.summary.totalStories} stories • ⏱️ ${briefing.readTimeMinutes} min read • ✅ ${briefing.summary.avgConfidence}% avg confidence

---

`;

  for (const section of briefing.sections) {
    md += `## ${section.icon} ${section.domain}\n\n`;
    
    for (const story of section.stories) {
      const sigMarker = story.significance === 'high' ? '🔴' : story.significance === 'medium' ? '🟡' : '⚪';
      
      md += `### ${sigMarker} ${story.headline}\n\n`;
      md += `**Confidence: ${story.avgConfidence}%** | [Verify](${story.articles[0]?.verificationUrl})\n\n`;
      md += `**Context:** ${story.context}\n\n`;
      md += `**Latest:** ${story.latestUpdate}\n\n`;
      md += `**Sources:**\n`;
      for (const a of story.articles) {
        md += `- [${a.source}](${a.url}) (${a.confidenceScore}%)\n`;
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
      if (story.avgConfidence >= 75) {
        lines.push(`This story is verified with ${story.avgConfidence}% confidence across ${story.articles.length} sources.`);
      } else if (story.avgConfidence >= 60) {
        lines.push(`Confidence level: ${story.avgConfidence}%. We recommend verifying with additional sources.`);
      } else {
        lines.push(`Note: This is an emerging story with ${story.avgConfidence}% confidence. Treat as preliminary.`);
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

export { BriefingOptions, ExecutiveBriefing, BriefingSection, StoryCluster };

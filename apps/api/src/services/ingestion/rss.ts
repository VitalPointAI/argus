import Parser from 'rss-parser';
import { db, sources, content } from '../../db';
import { eq } from 'drizzle-orm';
import { extractArticle, type RateLimitConfig } from '../extraction/article';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Argus/1.0 (+https://argus.vitalpoint.ai)',
  },
});

export interface FeedItem {
  title: string;
  link: string;
  content: string;
  contentSnippet?: string;
  pubDate?: string;
  creator?: string;
  guid?: string;
}

/**
 * Source config options for RSS feeds
 */
export interface RSSSourceConfig {
  fetchFullContent?: boolean;      // Whether to fetch full article content from URLs
  rateLimitConfig?: RateLimitConfig; // Custom rate limit settings for this source
  extractionTimeoutMs?: number;    // Timeout for article extraction
}

export async function fetchRSSFeed(url: string): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map((item) => ({
      title: item.title || 'Untitled',
      link: item.link || '',
      content: item.content || item.contentSnippet || '',
      contentSnippet: item.contentSnippet,
      pubDate: item.pubDate,
      creator: item.creator || item.author,
      guid: item.guid || item.link,
    }));
  } catch (error) {
    console.error(`Failed to fetch RSS feed ${url}:`, error);
    return [];
  }
}

/**
 * Fetch full article content if configured
 */
async function getArticleContent(
  item: FeedItem, 
  config: RSSSourceConfig
): Promise<string> {
  // Use RSS content by default
  let articleBody = item.content;

  // If full content extraction is enabled and we have a URL
  if (config.fetchFullContent && item.link) {
    try {
      const extraction = await extractArticle(item.link, {
        respectRateLimit: true,
        rateLimitConfig: config.rateLimitConfig,
        timeoutMs: config.extractionTimeoutMs || 15000,
      });

      if (extraction.success && extraction.textContent) {
        // Use extracted full content, prepending excerpt if available
        articleBody = extraction.textContent;
        
        // Log success for monitoring
        console.log(`[RSS] Extracted full content for: ${item.title?.substring(0, 50)}...`);
      } else {
        // Log failure but continue with RSS content
        console.warn(
          `[RSS] Full content extraction failed for ${item.link}: ${extraction.error}`
        );
      }
    } catch (error) {
      console.error(`[RSS] Extraction error for ${item.link}:`, error);
      // Fall back to RSS content
    }
  }

  return articleBody;
}

export async function ingestRSSSource(sourceId: string): Promise<number> {
  // Get source from DB
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  
  if (!source || source.type !== 'rss') {
    throw new Error(`Source ${sourceId} not found or not RSS type`);
  }

  // Parse source config
  const config = (source.config as RSSSourceConfig) || {};

  const items = await fetchRSSFeed(source.url);
  let ingested = 0;

  for (const item of items) {
    // Check if we already have this content
    const externalId = item.guid || item.link;
    
    try {
      // Fetch full content if configured
      const articleBody = await getArticleContent(item, config);

      await db.insert(content).values({
        sourceId: source.id,
        externalId,
        title: item.title,
        body: articleBody,
        url: item.link,
        author: item.creator || null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        fetchedAt: new Date(),
      }).onConflictDoNothing();
      
      ingested++;
    } catch (error) {
      // Skip duplicates or errors
      console.error(`[RSS] Failed to ingest item ${item.title}:`, error);
    }
  }

  // Update last fetched timestamp
  await db.update(sources)
    .set({ lastFetchedAt: new Date() })
    .where(eq(sources.id, sourceId));

  return ingested;
}

export async function ingestAllRSSSources(): Promise<{ sourceId: string; count: number }[]> {
  const rssSources = await db.select().from(sources).where(eq(sources.type, 'rss'));
  
  const results = [];
  for (const source of rssSources) {
    try {
      const count = await ingestRSSSource(source.id);
      results.push({ sourceId: source.id, count });
    } catch (error) {
      console.error(`[RSS] Failed to ingest source ${source.name}:`, error);
      results.push({ sourceId: source.id, count: 0 });
    }
  }
  
  return results;
}

/**
 * Enable full content extraction for a source
 */
export async function enableFullContentExtraction(
  sourceId: string,
  rateLimitConfig?: RateLimitConfig
): Promise<void> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const currentConfig = (source.config as RSSSourceConfig) || {};
  const newConfig: RSSSourceConfig = {
    ...currentConfig,
    fetchFullContent: true,
    ...(rateLimitConfig && { rateLimitConfig }),
  };

  await db.update(sources)
    .set({ config: newConfig })
    .where(eq(sources.id, sourceId));
}

/**
 * Disable full content extraction for a source
 */
export async function disableFullContentExtraction(sourceId: string): Promise<void> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const currentConfig = (source.config as RSSSourceConfig) || {};
  const newConfig: RSSSourceConfig = {
    ...currentConfig,
    fetchFullContent: false,
  };

  await db.update(sources)
    .set({ config: newConfig })
    .where(eq(sources.id, sourceId));
}

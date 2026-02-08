import { db, sources, content } from '../../db';
import { eq } from 'drizzle-orm';

interface ScrapedContent {
  title: string;
  body: string;
  url: string;
  author?: string;
  publishedAt?: Date;
}

/**
 * Basic web scraper using fetch + regex extraction
 * For MVP - more sophisticated scraping can be added later
 */
export async function scrapeWebPage(url: string): Promise<ScrapedContent | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Argus/1.0 (+https://argus.vitalpoint.ai)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || 'Untitled';

    // Extract description/content
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    
    // Try to extract article content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    
    let body = ogDescMatch?.[1] || descMatch?.[1] || '';
    
    if (articleMatch || mainMatch) {
      const rawContent = articleMatch?.[1] || mainMatch?.[1] || '';
      // Strip HTML tags for plain text
      body = rawContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000); // Limit content length
    }

    // Extract author
    const authorMatch = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i);
    const author = authorMatch?.[1];

    // Extract publish date
    const dateMatch = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i);
    const publishedAt = dateMatch?.[1] ? new Date(dateMatch[1]) : undefined;

    return {
      title: decodeHtmlEntities(title),
      body: decodeHtmlEntities(body),
      url,
      author,
      publishedAt,
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export async function ingestWebSource(sourceId: string): Promise<number> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));

  if (!source || source.type !== 'web') {
    throw new Error(`Source ${sourceId} not found or not web type`);
  }

  const scraped = await scrapeWebPage(source.url);
  
  if (!scraped) {
    return 0;
  }

  try {
    await db.insert(content).values({
      sourceId: source.id,
      externalId: source.url, // Use URL as external ID for web pages
      title: scraped.title,
      body: scraped.body,
      url: scraped.url,
      author: scraped.author || null,
      publishedAt: scraped.publishedAt || new Date(),
      fetchedAt: new Date(),
    }).onConflictDoNothing();

    await db.update(sources)
      .set({ lastFetchedAt: new Date() })
      .where(eq(sources.id, sourceId));

    return 1;
  } catch (error) {
    console.error(`Error saving content from ${source.url}:`, error);
    return 0;
  }
}

export async function ingestAllWebSources(): Promise<{ sourceId: string; name: string; count: number; error?: string }[]> {
  const webSources = await db.select().from(sources).where(eq(sources.type, 'web'));
  
  const results = [];
  
  for (const source of webSources) {
    if (!source.isActive) continue;
    
    try {
      const count = await ingestWebSource(source.id);
      results.push({ sourceId: source.id, name: source.name, count });
    } catch (error) {
      results.push({ 
        sourceId: source.id, 
        name: source.name, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  return results;
}

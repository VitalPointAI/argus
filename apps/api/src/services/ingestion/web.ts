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

/**
 * Extract article links from an index/listing page
 */
async function extractArticleLinks(url: string, maxLinks: number = 20): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Argus/1.0 (+https://argus.vitalpoint.ai)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const baseUrl = new URL(url).origin;
    
    // Find article links using common patterns
    const links = new Set<string>();
    
    // Pattern 1: Links within article/post containers
    const articleLinkMatches = html.matchAll(/<article[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<\/article>/gi);
    for (const match of articleLinkMatches) {
      const href = match[1];
      if (href && !href.startsWith('#') && !href.includes('javascript:')) {
        links.add(href.startsWith('http') ? href : new URL(href, baseUrl).href);
      }
    }
    
    // Pattern 2: Links with article-like paths (/blog/, /article/, /research/, /analysis/, /commentary/)
    const pathMatches = html.matchAll(/href=["']([^"']*(?:\/blog\/|\/article\/|\/articles\/|\/research\/|\/analysis\/|\/commentary\/|\/news\/|\/publications\/)[^"']+)["']/gi);
    for (const match of pathMatches) {
      const href = match[1];
      if (href && !href.startsWith('#')) {
        links.add(href.startsWith('http') ? href : new URL(href, baseUrl).href);
      }
    }
    
    // Pattern 3: h2/h3 links (common for article titles)
    const headingLinks = html.matchAll(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/gi);
    for (const match of headingLinks) {
      const href = match[1];
      if (href && !href.startsWith('#') && !href.includes('javascript:')) {
        links.add(href.startsWith('http') ? href : new URL(href, baseUrl).href);
      }
    }
    
    // Filter out non-content links
    const filteredLinks = Array.from(links).filter(link => {
      const lower = link.toLowerCase();
      // Skip common non-article pages
      return !lower.includes('/login') &&
             !lower.includes('/signup') &&
             !lower.includes('/contact') &&
             !lower.includes('/about') &&
             !lower.includes('/privacy') &&
             !lower.includes('/terms') &&
             !lower.includes('/search') &&
             !lower.includes('/tag/') &&
             !lower.includes('/category/') &&
             !lower.includes('/author/') &&
             !lower.endsWith('.pdf') &&
             !lower.endsWith('.jpg') &&
             !lower.endsWith('.png');
    });
    
    return filteredLinks.slice(0, maxLinks);
  } catch (error) {
    console.error(`Error extracting links from ${url}:`, error);
    return [];
  }
}

export async function ingestWebSource(sourceId: string): Promise<number> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));

  if (!source || (source.type !== 'web' && source.type !== 'website')) {
    throw new Error(`Source ${sourceId} not found or not web/website type`);
  }

  let ingested = 0;
  
  // First, try to find article links on the source URL
  const articleLinks = await extractArticleLinks(source.url);
  console.log(`[Web Ingestion] Found ${articleLinks.length} article links on ${source.url}`);
  
  if (articleLinks.length > 0) {
    // Scrape individual articles
    for (const articleUrl of articleLinks) {
      const scraped = await scrapeWebPage(articleUrl);
      
      if (!scraped || !scraped.title || scraped.title === 'Untitled') {
        continue;
      }
      
      try {
        await db.insert(content).values({
          sourceId: source.id,
          externalId: articleUrl,
          title: scraped.title,
          body: scraped.body,
          url: articleUrl,
          author: scraped.author || null,
          publishedAt: scraped.publishedAt || new Date(),
          fetchedAt: new Date(),
          confidenceScore: source.reliabilityScore || 50,
        }).onConflictDoNothing();
        
        ingested++;
      } catch (error) {
        console.error(`Error saving content from ${articleUrl}:`, error);
      }
      
      // Small delay to be polite
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } else {
    // Fallback: scrape the main page as a single piece of content
    const scraped = await scrapeWebPage(source.url);
    
    if (scraped) {
      try {
        await db.insert(content).values({
          sourceId: source.id,
          externalId: source.url,
          title: scraped.title,
          body: scraped.body,
          url: scraped.url,
          author: scraped.author || null,
          publishedAt: scraped.publishedAt || new Date(),
          fetchedAt: new Date(),
          confidenceScore: source.reliabilityScore || 50,
        }).onConflictDoNothing();
        
        ingested = 1;
      } catch (error) {
        console.error(`Error saving content from ${source.url}:`, error);
      }
    }
  }

  await db.update(sources)
    .set({ lastFetchedAt: new Date() })
    .where(eq(sources.id, sourceId));

  return ingested;
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

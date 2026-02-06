import Parser from 'rss-parser';
import { db, sources, content } from '../../db';
import { eq } from 'drizzle-orm';

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

export async function ingestRSSSource(sourceId: string): Promise<number> {
  // Get source from DB
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  
  if (!source || source.type !== 'rss') {
    throw new Error(`Source ${sourceId} not found or not RSS type`);
  }

  const items = await fetchRSSFeed(source.url);
  let ingested = 0;

  for (const item of items) {
    // Check if we already have this content
    const externalId = item.guid || item.link;
    
    try {
      await db.insert(content).values({
        sourceId: source.id,
        externalId,
        title: item.title,
        body: item.content,
        url: item.link,
        author: item.creator || null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        fetchedAt: new Date(),
      }).onConflictDoNothing();
      
      ingested++;
    } catch (error) {
      // Skip duplicates
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
    const count = await ingestRSSSource(source.id);
    results.push({ sourceId: source.id, count });
  }
  
  return results;
}

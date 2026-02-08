/**
 * Full-Text Article Extraction
 * 
 * Fetches and extracts full article content from URLs when needed.
 */

import { db, content } from '../../db';
import { eq } from 'drizzle-orm';

const MIN_BODY_LENGTH = 500; // Characters - below this, try to fetch full text

/**
 * Extract readable content from HTML
 */
function extractReadableContent(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  // Try to find article or main content
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const contentMatch = text.match(/<div[^>]*class="[^"]*(?:content|article|post|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  if (articleMatch) text = articleMatch[1];
  else if (mainMatch) text = mainMatch[1];
  else if (contentMatch) text = contentMatch[1];

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pMatches = text.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const match of pMatches) {
    const cleaned = match[1]
      .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > 20) {
      paragraphs.push(cleaned);
    }
  }

  return paragraphs.join('\n\n');
}

/**
 * Fetch full article content from URL
 */
async function fetchFullArticle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Argus/1.0; +https://argus.vitalpoint.ai)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const content = extractReadableContent(html);

    if (content.length > 200) {
      return content;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching article ${url}:`, error);
    return null;
  }
}

/**
 * Ensure content has full text - fetch if needed
 * Returns the full body text
 */
export async function ensureFullText(contentId: string): Promise<{
  body: string;
  wasFetched: boolean;
  originalLength: number;
  newLength: number;
}> {
  // Get current content
  const [item] = await db
    .select({
      id: content.id,
      body: content.body,
      url: content.url,
    })
    .from(content)
    .where(eq(content.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  const originalLength = item.body?.length || 0;

  // If body is already long enough, return as-is
  if (originalLength >= MIN_BODY_LENGTH) {
    return {
      body: item.body,
      wasFetched: false,
      originalLength,
      newLength: originalLength,
    };
  }

  // Try to fetch full article
  console.log(`Content ${contentId} has short body (${originalLength} chars), fetching full text from ${item.url}`);
  
  const fullText = await fetchFullArticle(item.url);
  
  if (fullText && fullText.length > originalLength) {
    // Update database with full content
    await db.update(content)
      .set({ body: fullText })
      .where(eq(content.id, contentId));

    console.log(`Updated content ${contentId}: ${originalLength} -> ${fullText.length} chars`);

    return {
      body: fullText,
      wasFetched: true,
      originalLength,
      newLength: fullText.length,
    };
  }

  // Couldn't get more content
  return {
    body: item.body,
    wasFetched: false,
    originalLength,
    newLength: originalLength,
  };
}

export { MIN_BODY_LENGTH };

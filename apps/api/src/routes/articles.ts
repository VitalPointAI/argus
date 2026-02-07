/**
 * Article Content Routes
 * 
 * Provides full article text with paywall bypass capabilities.
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { content } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getArticleContent, getArchiveUrl, isKnownPaywall, isFreeSource } from '../services/ingestion/paywall.js';

const app = new Hono();

/**
 * Get archive links for a URL (must be before /:id route)
 */
app.get('/archive-links', async (c) => {
  const url = c.req.query('url');

  if (!url) {
    return c.json({ success: false, error: 'URL required' }, 400);
  }

  const { isPaywall, info } = isKnownPaywall(url);
  const isFree = isFreeSource(url);

  return c.json({
    success: true,
    data: {
      url,
      isKnownPaywall: isPaywall,
      paywallInfo: info,
      isFreeSource: isFree,
      archiveLinks: {
        archiveIs: getArchiveUrl(url, 'archive.is'),
        archiveOrg: getArchiveUrl(url, 'archive.org'),
        '12ft': getArchiveUrl(url, '12ft.io'),
        googleCache: getArchiveUrl(url, 'webcache'),
      },
    },
  });
});

/**
 * Fetch article content by URL (for external URLs not in our database)
 */
app.post('/fetch', async (c) => {
  const body = await c.req.json();
  const { url } = body;

  if (!url) {
    return c.json({ success: false, error: 'URL required' }, 400);
  }

  try {
    const result = await getArticleContent(url);

    if (result.success) {
      return c.json({
        success: true,
        data: {
          url,
          title: result.title,
          content: result.content,
          source: result.bypassMethod,
          hasFullContent: true,
        },
      });
    }

    // Return archive links if fetch failed
    return c.json({
      success: true,
      data: {
        url,
        content: null,
        source: 'failed',
        hasFullContent: false,
        archiveLinks: {
          archiveIs: getArchiveUrl(url, 'archive.is'),
          archiveOrg: getArchiveUrl(url, 'archive.org'),
          '12ft': getArchiveUrl(url, '12ft.io'),
          googleCache: getArchiveUrl(url, 'webcache'),
        },
        error: result.error,
      },
    });
  } catch (error) {
    console.error('Error fetching URL:', error);
    return c.json({ success: false, error: 'Failed to fetch URL' }, 500);
  }
});

/**
 * Get full article content by content ID
 * Will use cached content if available, otherwise fetch with paywall bypass
 */
app.get('/:id', async (c) => {
  const { id } = c.req.param();

  try {
    // Get content from database
    const [article] = await db
      .select()
      .from(content)
      .where(eq(content.id, id))
      .limit(1);

    if (!article) {
      return c.json({ success: false, error: 'Article not found' }, 404);
    }

    // If we already have the full body cached (over 500 chars), return it
    if (article.body && article.body.length > 500) {
      return c.json({
        success: true,
        data: {
          id: article.id,
          title: article.title,
          url: article.url,
          content: article.body,
          source: 'cached',
          hasFullContent: true,
        },
      });
    }

    // Otherwise, try to fetch with paywall bypass
    const result = await getArticleContent(article.url);

    if (result.success && result.content) {
      // Cache the content for future use
      await db
        .update(content)
        .set({ body: result.content })
        .where(eq(content.id, id));

      return c.json({
        success: true,
        data: {
          id: article.id,
          title: result.title || article.title,
          url: article.url,
          content: result.content,
          source: result.bypassMethod,
          hasFullContent: true,
        },
      });
    }

    // Return what we have with archive links
    return c.json({
      success: true,
      data: {
        id: article.id,
        title: article.title,
        url: article.url,
        content: article.body || article.summary || 'Full content not available',
        source: 'partial',
        hasFullContent: false,
        archiveLinks: {
          archiveIs: getArchiveUrl(article.url, 'archive.is'),
          archiveOrg: getArchiveUrl(article.url, 'archive.org'),
          '12ft': getArchiveUrl(article.url, '12ft.io'),
          googleCache: getArchiveUrl(article.url, 'webcache'),
        },
        error: result.error,
      },
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    return c.json({ success: false, error: 'Failed to fetch article' }, 500);
  }
});

export default app;

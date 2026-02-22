import { Hono } from 'hono';
import { db, briefings, sourceLists, sourceListItems, content, sources, domains } from '../db';
import { desc, sql, eq, and, gte, inArray } from 'drizzle-orm';

export const rssRoutes = new Hono();

// Helper to escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper to format date for RSS (RFC 822)
function formatRssDate(date: Date): string {
  return date.toUTCString();
}

// Helper to convert markdown to plain text (basic)
function markdownToPlainText(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, '') // Remove headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
    .replace(/`(.+?)`/g, '$1') // Inline code
    .replace(/```[\s\S]*?```/g, '') // Code blocks
    .replace(/>\s+/g, '') // Blockquotes
    .replace(/[-*+]\s+/g, '• ') // List items
    .replace(/\n{3,}/g, '\n\n') // Multiple newlines
    .trim();
}

// RSS feed for executive briefings
rssRoutes.get('/briefings', async (c) => {
  try {
    // Get latest 10 briefings
    const latestBriefings = await db.select({
      id: briefings.id,
      title: briefings.title,
      content: briefings.content,
      type: briefings.type,
      createdAt: briefings.createdAt,
    })
      .from(briefings)
      .orderBy(desc(briefings.createdAt))
      .limit(10);

    const baseUrl = 'https://argus.vitalpoint.ai';
    const now = new Date();

    // Build RSS XML
    const items = latestBriefings.map(b => {
      const pubDate = b.createdAt ? formatRssDate(new Date(b.createdAt)) : formatRssDate(now);
      const title = b.title || `${b.type || 'Executive'} Briefing`;
      const description = b.content 
        ? escapeXml(markdownToPlainText(b.content).substring(0, 2000))
        : 'No content available';
      const link = `${baseUrl}/briefings?id=${b.id}`;
      const guid = `${baseUrl}/briefings/${b.id}`;

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
    </item>`;
    }).join('');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Argus Executive Briefings</title>
    <link>${baseUrl}</link>
    <description>Strategic intelligence briefings powered by Argus</description>
    <language>en-us</language>
    <lastBuildDate>${formatRssDate(now)}</lastBuildDate>
    <atom:link href="${baseUrl}/api/rss/briefings" rel="self" type="application/rss+xml"/>
    <image>
      <url>${baseUrl}/argus-logo.png</url>
      <title>Argus</title>
      <link>${baseUrl}</link>
    </image>${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 min
      },
    });
  } catch (error) {
    console.error('RSS feed error:', error);
    return c.json({ success: false, error: 'Failed to generate RSS feed' }, 500);
  }
});

// RSS feed for a specific source list (articles from sources in the list)
rssRoutes.get('/lists/:listId', async (c) => {
  const listId = c.req.param('listId');
  
  try {
    // Get the source list
    const [list] = await db.select()
      .from(sourceLists)
      .where(eq(sourceLists.id, listId))
      .limit(1);

    if (!list) {
      return c.json({ success: false, error: 'Source list not found' }, 404);
    }

    // Check if RSS is enabled for this list
    if (!list.rssEnabled && !list.isPublic) {
      return c.json({ success: false, error: 'RSS feed not enabled for this list' }, 403);
    }

    // Get source IDs in this list
    const listItems = await db.select({ sourceId: sourceListItems.sourceId })
      .from(sourceListItems)
      .where(eq(sourceListItems.sourceListId, listId));

    const sourceIds = listItems.map(i => i.sourceId);

    if (sourceIds.length === 0) {
      return c.json({ success: false, error: 'No sources in this list' }, 404);
    }

    // Get recent articles from these sources (last 48 hours)
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    const articles = await db.select({
      id: content.id,
      title: content.title,
      summary: content.summary,
      url: content.url,
      fetchedAt: content.fetchedAt,
      sourceName: sources.name,
      domainName: domains.name,
    })
      .from(content)
      .leftJoin(sources, eq(content.sourceId, sources.id))
      .leftJoin(domains, eq(sources.domainId, domains.id))
      .where(and(
        inArray(content.sourceId, sourceIds),
        gte(content.fetchedAt, since)
      ))
      .orderBy(desc(content.fetchedAt))
      .limit(50);

    const baseUrl = 'https://argus.vitalpoint.ai';
    const now = new Date();

    // Build RSS XML
    const items = articles.map(a => {
      const pubDate = a.fetchedAt ? formatRssDate(new Date(a.fetchedAt)) : formatRssDate(now);
      const title = a.title || 'Untitled';
      const description = a.summary || '';
      const link = a.url || `${baseUrl}/articles/${a.id}`;
      const guid = a.url || `urn:argus:article:${a.id}`;
      const source = a.sourceName || 'Unknown Source';
      const domain = a.domainName || '';

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <description><![CDATA[${domain ? `[${domain}] ` : ''}${description}]]></description>
      <source>${escapeXml(source)}</source>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(guid)}</guid>
    </item>`;
    }).join('');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Argus: ${escapeXml(list.name)}</title>
    <link>${baseUrl}/sources/lists/${listId}</link>
    <description>${escapeXml(list.description || `Intelligence feed from ${list.name}`)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatRssDate(now)}</lastBuildDate>
    <atom:link href="${baseUrl}/api/rss/lists/${listId}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${baseUrl}/argus-logo.png</url>
      <title>Argus</title>
      <link>${baseUrl}</link>
    </image>${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Source list RSS feed error:', error);
    return c.json({ success: false, error: 'Failed to generate RSS feed' }, 500);
  }
});

// List all available RSS feeds (public lists with RSS enabled)
rssRoutes.get('/available', async (c) => {
  try {
    const availableLists = await db.select({
      id: sourceLists.id,
      name: sourceLists.name,
      description: sourceLists.description,
    })
      .from(sourceLists)
      .where(eq(sourceLists.rssEnabled, true))
      .orderBy(sourceLists.name);

    const baseUrl = 'https://argus.vitalpoint.ai';

    return c.json({
      success: true,
      data: {
        globalFeeds: [
          {
            name: 'Executive Briefings',
            description: 'AI-generated strategic intelligence briefings',
            url: `${baseUrl}/api/rss/briefings`,
          },
        ],
        sourceListFeeds: availableLists.map(list => ({
          id: list.id,
          name: list.name,
          description: list.description,
          url: `${baseUrl}/api/rss/lists/${list.id}`,
        })),
      },
    });
  } catch (error) {
    console.error('Available feeds error:', error);
    return c.json({ success: false, error: 'Failed to get available feeds' }, 500);
  }
});

// Atom feed alternative
rssRoutes.get('/briefings.atom', async (c) => {
  try {
    const latestBriefings = await db.select({
      id: briefings.id,
      title: briefings.title,
      content: briefings.content,
      type: briefings.type,
      createdAt: briefings.createdAt,
    })
      .from(briefings)
      .orderBy(desc(briefings.createdAt))
      .limit(10);

    const baseUrl = 'https://argus.vitalpoint.ai';
    const now = new Date().toISOString();

    const entries = latestBriefings.map(b => {
      const updated = b.createdAt ? new Date(b.createdAt).toISOString() : now;
      const title = b.title || `${b.type || 'Executive'} Briefing`;
      const summary = b.content 
        ? escapeXml(markdownToPlainText(b.content).substring(0, 2000))
        : 'No content available';

      return `
  <entry>
    <title>${escapeXml(title)}</title>
    <link href="${baseUrl}/briefings?id=${b.id}"/>
    <id>urn:argus:briefing:${b.id}</id>
    <updated>${updated}</updated>
    <summary type="text">${summary}</summary>
  </entry>`;
    }).join('');

    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Argus Executive Briefings</title>
  <link href="${baseUrl}"/>
  <link href="${baseUrl}/api/rss/briefings.atom" rel="self"/>
  <id>urn:argus:briefings</id>
  <updated>${now}</updated>
  <author>
    <name>Argus Intelligence</name>
  </author>${entries}
</feed>`;

    return new Response(atom, {
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Atom feed error:', error);
    return c.json({ success: false, error: 'Failed to generate Atom feed' }, 500);
  }
});

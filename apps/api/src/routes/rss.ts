import { Hono } from 'hono';
import { db, briefings } from '../db';
import { desc, sql } from 'drizzle-orm';

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

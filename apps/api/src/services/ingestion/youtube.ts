/**
 * YouTube Transcript Ingestion Service
 * 
 * Fetches transcripts from YouTube videos for intelligence analysis.
 * Uses youtube-transcript library (no API key needed).
 */

import { db, content, sources } from '../../db';
import { eq } from 'drizzle-orm';

interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  publishedAt: Date;
  transcript: string;
  url: string;
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetch transcript from YouTube video
 * Uses the youtube-transcript package or falls back to API
 */
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Try using the unofficial transcript API
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );
    
    const html = await response.text();
    
    // Extract captions URL from page
    const captionsMatch = html.match(/"captions":\s*(\{[^}]+\})/);
    if (!captionsMatch) {
      console.log(`No captions found for video ${videoId}`);
      return null;
    }

    // Try to get transcript from timedtext API
    const timedTextMatch = html.match(/timedtext[^"]*lang=en[^"]*/);
    if (!timedTextMatch) {
      // Try auto-generated captions
      const autoMatch = html.match(/timedtext[^"]*asr[^"]*/);
      if (!autoMatch) {
        console.log(`No English captions for video ${videoId}`);
        return null;
      }
    }

    // For now, return a placeholder - full implementation would parse the captions
    // This requires more complex XML parsing of the timedtext response
    return null;
  } catch (error) {
    console.error(`Error fetching transcript for ${videoId}:`, error);
    return null;
  }
}

/**
 * Fetch video metadata from YouTube
 */
async function fetchVideoMetadata(videoId: string): Promise<{
  title: string;
  channelName: string;
  publishedAt: Date;
} | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Unknown Title';
    
    // Extract channel name
    const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
    const channelName = channelMatch ? channelMatch[1] : 'Unknown Channel';
    
    // Extract publish date
    const dateMatch = html.match(/"publishDate":"([^"]+)"/);
    const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();
    
    return { title, channelName, publishedAt };
  } catch (error) {
    console.error(`Error fetching metadata for ${videoId}:`, error);
    return null;
  }
}

/**
 * Ingest a single YouTube video
 */
export async function ingestYouTubeVideo(
  videoUrl: string,
  sourceId: string
): Promise<{ success: boolean; contentId?: string; error?: string }> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return { success: false, error: 'Invalid YouTube URL' };
  }

  // Check if already ingested
  const existing = await db
    .select()
    .from(content)
    .where(eq(content.url, `https://www.youtube.com/watch?v=${videoId}`))
    .limit(1);

  if (existing.length > 0) {
    return { success: true, contentId: existing[0].id };
  }

  // Fetch metadata
  const metadata = await fetchVideoMetadata(videoId);
  if (!metadata) {
    return { success: false, error: 'Failed to fetch video metadata' };
  }

  // Fetch transcript
  const transcript = await fetchTranscript(videoId);
  
  // Insert content
  const [inserted] = await db.insert(content).values({
    sourceId,
    title: metadata.title,
    body: transcript || '[Transcript not available]',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    author: metadata.channelName,
    publishedAt: metadata.publishedAt,
    contentHash: `yt-${videoId}`,
  }).returning();

  return { success: true, contentId: inserted.id };
}

/**
 * Ingest videos from a YouTube channel RSS feed
 */
export async function ingestYouTubeChannel(channelId: string, sourceId: string): Promise<number> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  
  try {
    console.log(`Fetching YouTube feed: ${feedUrl}`);
    const response = await fetch(feedUrl);
    
    if (!response.ok) {
      console.error(`YouTube feed returned ${response.status} for channel ${channelId}`);
      return 0;
    }
    
    const xml = await response.text();
    
    // Parse entries from feed
    const entries: Array<{
      videoId: string;
      title: string;
      author: string;
      published: string;
    }> = [];
    
    // Debug: log first 500 chars of response
    console.log(`Feed response preview: ${xml.substring(0, 300)}...`);
    
    // Match each entry
    const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
    const allMatches = [...entryMatches];
    console.log(`Regex matched ${allMatches.length} entries`);
    
    for (const match of allMatches) {
      const entry = match[1];
      const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const authorMatch = entry.match(/<name>([^<]+)<\/name>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      
      if (videoIdMatch) {
        entries.push({
          videoId: videoIdMatch[1],
          title: titleMatch ? titleMatch[1] : 'Unknown Title',
          author: authorMatch ? authorMatch[1] : 'Unknown Channel',
          published: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
        });
      }
    }
    
    console.log(`Found ${entries.length} videos in channel ${channelId}`);
    
    let ingested = 0;
    for (const entry of entries.slice(0, 15)) { // Limit to 15 most recent
      const videoUrl = `https://www.youtube.com/watch?v=${entry.videoId}`;
      
      // Check if already exists
      const existing = await db
        .select()
        .from(content)
        .where(eq(content.externalId, `yt-${entry.videoId}`))
        .limit(1);
      
      if (existing.length > 0) {
        continue; // Already ingested
      }
      
      // Insert video metadata (transcript fetching is separate)
      try {
        await db.insert(content).values({
          sourceId,
          externalId: `yt-${entry.videoId}`,
          title: entry.title,
          body: `[Video transcript not yet available. Watch at: ${videoUrl}]`,
          url: videoUrl,
          author: entry.author,
          publishedAt: new Date(entry.published),
          confidenceScore: 70, // YouTube channels we add are vetted
        });
      } catch (e) {
        console.error(`Error inserting video ${entry.videoId}:`, e);
        continue;
      }
      
      ingested++;
    }
    
    // Update source last fetched time
    await db.update(sources)
      .set({ lastFetchedAt: new Date() })
      .where(eq(sources.id, sourceId));
    
    return ingested;
  } catch (error) {
    console.error(`Error ingesting channel ${channelId}:`, error);
    return 0;
  }
}

/**
 * Extract channel ID from various YouTube URL formats
 */
function extractChannelId(url: string): string | null {
  // Try /channel/XXXXX format
  const channelMatch = url.match(/channel\/([^/?]+)/);
  if (channelMatch) return channelMatch[1];
  
  // Try /c/XXXXX or /user/XXXXX format (need to resolve)
  const handleMatch = url.match(/(?:\/c\/|\/user\/|@)([^/?]+)/);
  if (handleMatch) {
    // For handles, we'd need to resolve to channel ID
    // For now, return null - these need manual resolution
    console.log(`Cannot auto-resolve handle: ${handleMatch[1]}`);
    return null;
  }
  
  return null;
}

/**
 * Ingest all YouTube sources
 */
export async function ingestAllYouTubeSources(): Promise<{ sourceId: string; count: number }[]> {
  const youtubeSources = await db
    .select()
    .from(sources)
    .where(eq(sources.type, 'youtube'));

  const results: { sourceId: string; count: number }[] = [];

  for (const source of youtubeSources) {
    const channelId = extractChannelId(source.url);
    if (channelId) {
      const count = await ingestYouTubeChannel(channelId, source.id);
      results.push({ sourceId: source.id, count });
    } else {
      console.log(`Could not extract channel ID from: ${source.url}`);
      results.push({ sourceId: source.id, count: 0 });
    }
  }

  return results;
}

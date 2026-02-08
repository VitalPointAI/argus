/**
 * AI Source Analyzer
 * Takes a URL or description and figures out how to best add it to Argus
 */

import { callNearAI } from '../nearai';

interface SourceAnalysis {
  sourceType: 'rss' | 'youtube_channel' | 'youtube_playlist' | 'website' | 'twitter' | 'telegram' | 'unknown';
  name: string;
  description: string;
  feedUrl?: string;
  websiteUrl?: string;
  youtubeChannelId?: string;
  suggestedDomain: string;
  confidence: number;
  notes: string;
}

interface AnalyzeResult {
  success: boolean;
  analysis?: SourceAnalysis;
  error?: string;
}

// Try to find RSS feed from a URL
async function discoverRSSFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Argus/1.0 RSS Discovery' },
      signal: AbortSignal.timeout(10000),
    });
    
    const contentType = res.headers.get('content-type') || '';
    
    // Direct RSS/Atom feed
    if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
      return url;
    }
    
    // HTML page - look for feed links
    const html = await res.text();
    
    // Look for RSS/Atom link tags
    const feedPatterns = [
      /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i,
      /<link[^>]+type=["']application\/atom\+xml["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/atom\+xml["']/i,
    ];
    
    for (const pattern of feedPatterns) {
      const match = html.match(pattern);
      if (match) {
        let feedUrl = match[1];
        // Handle relative URLs
        if (feedUrl.startsWith('/')) {
          const urlObj = new URL(url);
          feedUrl = `${urlObj.origin}${feedUrl}`;
        } else if (!feedUrl.startsWith('http')) {
          feedUrl = new URL(feedUrl, url).href;
        }
        return feedUrl;
      }
    }
    
    // Common RSS path patterns
    const urlObj = new URL(url);
    const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/feeds/posts/default'];
    
    for (const path of commonPaths) {
      try {
        const testUrl = `${urlObj.origin}${path}`;
        const testRes = await fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000),
        });
        if (testRes.ok) {
          const ct = testRes.headers.get('content-type') || '';
          if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) {
            return testUrl;
          }
        }
      } catch {
        // Continue trying other paths
      }
    }
    
    return null;
  } catch (error) {
    console.error('RSS discovery error:', error);
    return null;
  }
}

// Extract YouTube channel/playlist info
function parseYouTubeUrl(url: string): { type: 'channel' | 'playlist' | 'video' | null; id: string | null } {
  try {
    const urlObj = new URL(url);
    
    // Channel URLs
    if (urlObj.pathname.startsWith('/channel/')) {
      return { type: 'channel', id: urlObj.pathname.split('/')[2] };
    }
    if (urlObj.pathname.startsWith('/@')) {
      return { type: 'channel', id: urlObj.pathname.substring(1) }; // @handle
    }
    if (urlObj.pathname.startsWith('/c/') || urlObj.pathname.startsWith('/user/')) {
      return { type: 'channel', id: urlObj.pathname.split('/')[2] };
    }
    
    // Playlist
    if (urlObj.searchParams.has('list')) {
      return { type: 'playlist', id: urlObj.searchParams.get('list') };
    }
    
    // Video
    if (urlObj.searchParams.has('v')) {
      return { type: 'video', id: urlObj.searchParams.get('v') };
    }
    
    return { type: null, id: null };
  } catch {
    return { type: null, id: null };
  }
}

// Use AI to analyze the source and suggest configuration
async function analyzeWithAI(input: string, pageContent?: string): Promise<SourceAnalysis> {
  const prompt = `You are a source analyzer for an intelligence platform. Analyze this input and suggest how to add it as a source.

INPUT: ${input}
${pageContent ? `\nPAGE CONTENT SNIPPET:\n${pageContent.substring(0, 2000)}` : ''}

Respond in JSON format:
{
  "sourceType": "rss" | "youtube_channel" | "youtube_playlist" | "website" | "twitter" | "telegram" | "unknown",
  "name": "Human-readable source name",
  "description": "Brief description of what this source covers",
  "feedUrl": "RSS/Atom feed URL if applicable",
  "websiteUrl": "Main website URL",
  "youtubeChannelId": "YouTube channel ID if applicable",
  "suggestedDomain": "Best matching domain category (e.g., 'Geopolitics', 'Technology', 'Defense', 'Economics', 'Climate', 'Cybersecurity', etc.)",
  "confidence": 0.0-1.0,
  "notes": "Any additional notes or caveats"
}

For RSS sources, always prefer the direct feed URL.
For YouTube, extract the channel ID.
For websites without RSS, note that web scraping will be used.
Suggest the most appropriate strategic domain based on the content.`;

  try {
    const response = await callNearAI(prompt, { maxTokens: 1000 });
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SourceAnalysis;
    }
    
    throw new Error('No valid JSON in AI response');
  } catch (error) {
    console.error('AI analysis error:', error);
    return {
      sourceType: 'unknown',
      name: 'Unknown Source',
      description: '',
      suggestedDomain: 'General',
      confidence: 0,
      notes: 'AI analysis failed. Please configure manually.',
    };
  }
}

// Fetch page title and description
async function fetchPageInfo(url: string): Promise<{ title: string; description: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Argus/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Get text content (stripped of HTML)
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return { title, description, content };
  } catch {
    return null;
  }
}

export async function analyzeSource(input: string): Promise<AnalyzeResult> {
  try {
    // Check if input is a URL
    let url: string | null = null;
    try {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        url = input;
      } else if (input.includes('.') && !input.includes(' ')) {
        url = `https://${input}`;
      }
      if (url) new URL(url); // Validate
    } catch {
      url = null;
    }
    
    let analysis: SourceAnalysis;
    
    if (url) {
      // URL-based analysis
      const urlObj = new URL(url);
      
      // YouTube handling
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const yt = parseYouTubeUrl(url);
        const pageInfo = await fetchPageInfo(url);
        
        if (yt.type === 'channel') {
          analysis = {
            sourceType: 'youtube_channel',
            name: pageInfo?.title?.replace(' - YouTube', '') || `YouTube Channel ${yt.id}`,
            description: pageInfo?.description || 'YouTube channel',
            websiteUrl: url,
            youtubeChannelId: yt.id || undefined,
            suggestedDomain: 'General',
            confidence: 0.9,
            notes: 'Will monitor for new video uploads.',
          };
        } else if (yt.type === 'playlist') {
          analysis = {
            sourceType: 'youtube_playlist',
            name: pageInfo?.title?.replace(' - YouTube', '') || `YouTube Playlist`,
            description: pageInfo?.description || 'YouTube playlist',
            websiteUrl: url,
            suggestedDomain: 'General',
            confidence: 0.9,
            notes: 'Will monitor for new videos added to playlist.',
          };
        } else {
          // Single video - suggest the channel instead
          analysis = await analyzeWithAI(input, pageInfo?.content);
        }
      }
      // Twitter/X handling
      else if (urlObj.hostname.includes('twitter.com') || urlObj.hostname.includes('x.com')) {
        const pageInfo = await fetchPageInfo(url);
        analysis = {
          sourceType: 'twitter',
          name: pageInfo?.title || 'Twitter Account',
          description: pageInfo?.description || '',
          websiteUrl: url,
          suggestedDomain: 'General',
          confidence: 0.7,
          notes: 'Twitter/X integration requires additional API setup.',
        };
      }
      // Telegram handling
      else if (urlObj.hostname.includes('t.me') || urlObj.hostname.includes('telegram.me')) {
        analysis = {
          sourceType: 'telegram',
          name: urlObj.pathname.substring(1),
          description: 'Telegram channel',
          websiteUrl: url,
          suggestedDomain: 'General',
          confidence: 0.7,
          notes: 'Telegram channel integration.',
        };
      }
      // General website/RSS
      else {
        // Try to discover RSS
        const feedUrl = await discoverRSSFeed(url);
        const pageInfo = await fetchPageInfo(url);
        
        if (feedUrl) {
          // Use AI to analyze and categorize
          analysis = await analyzeWithAI(input, pageInfo?.content);
          analysis.sourceType = 'rss';
          analysis.feedUrl = feedUrl;
          analysis.websiteUrl = url;
          if (pageInfo?.title && !analysis.name) {
            analysis.name = pageInfo.title;
          }
        } else {
          // Website without RSS - use web scraping
          analysis = await analyzeWithAI(input, pageInfo?.content);
          analysis.sourceType = 'website';
          analysis.websiteUrl = url;
          if (pageInfo?.title && !analysis.name) {
            analysis.name = pageInfo.title;
          }
          analysis.notes = (analysis.notes || '') + ' No RSS feed found. Will use web scraping.';
        }
      }
    } else {
      // Description-based analysis - use AI to figure out what the user wants
      analysis = await analyzeWithAI(input);
    }
    
    return { success: true, analysis };
  } catch (error) {
    console.error('Source analysis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function confirmAndAddSource(analysis: SourceAnalysis, domainId: string): Promise<{ success: boolean; sourceId?: string; error?: string }> {
  // This will be called after user confirms the analysis
  // The actual source creation happens here
  // For now, return the config that should be passed to the existing source creation endpoint
  return {
    success: true,
    sourceId: 'pending', // Will be set after actual creation
  };
}

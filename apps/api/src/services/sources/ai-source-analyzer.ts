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
  confidence: number;  // Trustworthiness score (0-1), NOT detection accuracy
  biases?: string[];   // Detected biases (political, ideological, commercial, national)
  biasDirection?: 'left' | 'right' | 'center' | 'unknown';
  disinfoRisk?: 'low' | 'medium' | 'high';
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
  const prompt = `You are a source reliability analyst for a strategic intelligence platform. Analyze this source for TRUSTWORTHINESS.

INPUT: ${input}
${pageContent ? `\nPAGE CONTENT SNIPPET:\n${pageContent.substring(0, 3000)}` : ''}

Analyze and respond in JSON format:
{
  "sourceType": "rss" | "youtube_channel" | "youtube_playlist" | "website" | "twitter" | "telegram" | "unknown",
  "name": "Human-readable source name",
  "description": "Brief description of what this source covers and its perspective",
  "feedUrl": "RSS/Atom feed URL if applicable",
  "websiteUrl": "Main website URL",
  "youtubeChannelId": "YouTube channel ID if applicable",
  "suggestedDomain": "Best matching domain category (e.g., 'Geopolitics', 'Technology', 'Defense', 'Economics', 'Climate', 'Cybersecurity', etc.)",
  "confidence": 0.0-1.0,
  "biases": ["list", "of", "detected", "biases"],
  "biasDirection": "left" | "right" | "center" | "unknown",
  "disinfoRisk": "low" | "medium" | "high",
  "notes": "Any additional notes about reliability, bias, or concerns"
}

CONFIDENCE SCORING (this is about SOURCE TRUSTWORTHINESS, not detection accuracy):
- 0.9-1.0: Highly trusted source (major wire services, established papers of record, official government sources)
- 0.7-0.9: Generally reliable (mainstream media, established analysts, academic institutions)
- 0.5-0.7: Mixed reliability (blogs, opinion sources, partisan outlets - useful but needs verification)
- 0.3-0.5: Questionable (known bias, poor fact-checking history, sensationalist)
- 0.0-0.3: Unreliable (known disinfo, propaganda outlets, conspiracy sources)

BIAS DETECTION:
- Identify political leanings (left/right/center)
- Note any ideological, national, or commercial biases
- Flag if source is state-affiliated or has known agendas

For RSS sources, always prefer the direct feed URL.
For YouTube, extract the channel ID.`;

  try {
    const response = await callNearAI({ prompt, maxTokens: 1500 });
    
    console.log('[AI Analyzer] Raw response length:', response?.length);
    console.log('[AI Analyzer] Raw response preview:', response?.substring(0, 500));
    
    // Parse JSON from response - handle markdown code blocks
    let jsonStr = response;
    
    // Remove markdown code blocks if present
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    
    // Extract JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as SourceAnalysis;
      console.log('[AI Analyzer] Parsed successfully:', parsed.name, 'confidence:', parsed.confidence);
      return parsed;
    }
    
    console.error('[AI Analyzer] No JSON found in response');
    throw new Error('No valid JSON in AI response');
  } catch (error) {
    console.error('AI analysis error:', error);
    return {
      sourceType: 'unknown',
      name: 'Unknown Source',
      description: '',
      suggestedDomain: 'General',
      confidence: 0,
      biases: [],
      biasDirection: 'unknown',
      disinfoRisk: 'medium',
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
      
      // Substack - auto-detect feed URL, but use AI for trustworthiness
      if (urlObj.hostname.includes('substack.com')) {
        const pageInfo = await fetchPageInfo(url);
        const feedUrl = `${urlObj.origin}/feed`;
        
        // Use AI to analyze trustworthiness, passing known feed URL
        analysis = await analyzeWithAI(input, pageInfo?.content);
        analysis.sourceType = 'rss';
        analysis.feedUrl = feedUrl;
        analysis.websiteUrl = url;
        if (pageInfo?.title) {
          analysis.name = pageInfo.title.replace(' | Substack', '').trim();
        }
        
        return { success: true, analysis };
      }

      // YouTube handling - detect channel/playlist, use AI for trustworthiness
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const yt = parseYouTubeUrl(url);
        const pageInfo = await fetchPageInfo(url);
        
        // Use AI for trustworthiness analysis
        analysis = await analyzeWithAI(input, pageInfo?.content);
        analysis.websiteUrl = url;
        
        if (yt.type === 'channel') {
          analysis.sourceType = 'youtube_channel';
          analysis.youtubeChannelId = yt.id || undefined;
          if (pageInfo?.title) {
            analysis.name = pageInfo.title.replace(' - YouTube', '').trim();
          }
        } else if (yt.type === 'playlist') {
          analysis.sourceType = 'youtube_playlist';
          if (pageInfo?.title) {
            analysis.name = pageInfo.title.replace(' - YouTube', '').trim();
          }
        }
        // For single videos, analysis already done above
        
        return { success: true, analysis };
      }
      // Twitter/X handling - use AI for trustworthiness
      else if (urlObj.hostname.includes('twitter.com') || urlObj.hostname.includes('x.com')) {
        const pageInfo = await fetchPageInfo(url);
        analysis = await analyzeWithAI(input, pageInfo?.content);
        analysis.sourceType = 'twitter';
        analysis.websiteUrl = url;
        if (pageInfo?.title) {
          analysis.name = pageInfo.title;
        }
        analysis.notes = (analysis.notes || '') + ' Twitter/X integration requires additional API setup.';
      }
      // Telegram handling - use AI for trustworthiness
      else if (urlObj.hostname.includes('t.me') || urlObj.hostname.includes('telegram.me')) {
        const pageInfo = await fetchPageInfo(url);
        analysis = await analyzeWithAI(input, pageInfo?.content);
        analysis.sourceType = 'telegram';
        analysis.websiteUrl = url;
        analysis.name = analysis.name || urlObj.pathname.substring(1);
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

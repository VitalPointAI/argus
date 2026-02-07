/**
 * Paywall Bypass Service
 * 
 * Attempts to retrieve full article text when original source is paywalled.
 * Tries multiple fallback methods in order of reliability.
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const ARCHIVE_SERVICES = [
  { name: 'archive.is', urlPattern: (url: string) => `https://archive.is/newest/${encodeURIComponent(url)}` },
  { name: 'archive.org', urlPattern: (url: string) => `https://web.archive.org/web/2/${url}` },
  { name: '12ft.io', urlPattern: (url: string) => `https://12ft.io/${url}` },
  { name: 'webcache', urlPattern: (url: string) => `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}` },
];

// Patterns that indicate a paywall
const PAYWALL_INDICATORS = [
  /subscribe\s+(now|today|to\s+read)/i,
  /subscription\s+required/i,
  /sign\s+in\s+to\s+(read|continue)/i,
  /create\s+(a\s+)?free\s+account/i,
  /premium\s+content/i,
  /members\s+only/i,
  /unlock\s+this\s+(article|story)/i,
  /you('ve|'re|\s+have)\s+(reached|hit)\s+(your|the)\s+(free\s+)?limit/i,
  /already\s+a\s+subscriber/i,
  /register\s+to\s+continue/i,
];

// Known paywall domains and their bypass strategies
const KNOWN_PAYWALLS: Record<string, { strategy: string; notes?: string }> = {
  'nytimes.com': { strategy: 'archive', notes: 'Hard paywall, use archive' },
  'wsj.com': { strategy: 'archive', notes: 'Hard paywall, use archive' },
  'washingtonpost.com': { strategy: 'archive', notes: 'Metered paywall' },
  'ft.com': { strategy: 'archive', notes: 'Hard paywall' },
  'economist.com': { strategy: 'archive', notes: 'Hard paywall' },
  'bloomberg.com': { strategy: 'archive', notes: 'Metered paywall' },
  'theatlantic.com': { strategy: 'archive', notes: 'Metered paywall' },
  'newyorker.com': { strategy: 'archive', notes: 'Metered paywall' },
  'foreignpolicy.com': { strategy: 'archive', notes: 'Metered paywall' },
  'foreignaffairs.com': { strategy: 'archive', notes: 'Hard paywall' },
  'thetimes.co.uk': { strategy: 'archive', notes: 'Hard paywall' },
  'telegraph.co.uk': { strategy: 'archive', notes: 'Metered paywall' },
  'businessinsider.com': { strategy: 'archive', notes: 'Metered paywall' },
  'medium.com': { strategy: 'archive', notes: 'Metered paywall' },
};

// Sites known to be freely accessible
const FREE_SOURCES = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'theguardian.com',
  'aljazeera.com',
  'cnn.com',
  'npr.org',
  'pbs.org',
  'thehill.com',
  'politico.com',
  'axios.com',
  'vox.com',
  '.gov',
  '.mil',
  'state.gov',
];

interface PaywallResult {
  success: boolean;
  content?: string;
  title?: string;
  bypassMethod?: string;
  error?: string;
}

interface ArticleContent {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
}

/**
 * Check if a URL is from a known free source
 */
export function isFreeSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return FREE_SOURCES.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is from a known paywall site
 */
export function isKnownPaywall(url: string): { isPaywall: boolean; info?: { strategy: string; notes?: string } } {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [domain, info] of Object.entries(KNOWN_PAYWALLS)) {
      if (hostname.includes(domain)) {
        return { isPaywall: true, info };
      }
    }
    return { isPaywall: false };
  } catch {
    return { isPaywall: false };
  }
}

/**
 * Detect if content appears to be paywalled based on text patterns
 */
export function detectPaywall(html: string, textContent: string): boolean {
  // Very short content is suspicious
  if (textContent.length < 500) {
    return true;
  }

  // Check for paywall indicators in HTML
  const htmlLower = html.toLowerCase();
  for (const pattern of PAYWALL_INDICATORS) {
    if (pattern.test(htmlLower)) {
      return true;
    }
  }

  // Check for paywall CSS classes/IDs
  const paywallClasses = ['paywall', 'subscriber-only', 'premium-content', 'login-wall', 'regwall'];
  for (const cls of paywallClasses) {
    if (htmlLower.includes(cls)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract article content using Readability
 */
function extractArticle(html: string, url: string): ArticleContent | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) return null;

    return {
      title: article.title,
      content: article.content,
      textContent: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
    };
  } catch (error) {
    console.error('Readability extraction failed:', error);
    return null;
  }
}

/**
 * Fetch with timeout and error handling
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
    });
    return response;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try to fetch article from archive services
 */
async function tryArchiveServices(url: string): Promise<PaywallResult> {
  for (const service of ARCHIVE_SERVICES) {
    try {
      const archiveUrl = service.urlPattern(url);
      console.log(`Trying ${service.name}: ${archiveUrl}`);

      const response = await fetchWithTimeout(archiveUrl, 15000);
      
      if (!response || !response.ok) {
        continue;
      }

      const html = await response.text();
      
      // For archive.is, we need to handle redirects to the actual archived page
      if (service.name === 'archive.is' && html.includes('No results')) {
        continue;
      }

      const article = extractArticle(html, archiveUrl);
      
      if (article && article.textContent.length > 500) {
        return {
          success: true,
          content: article.textContent,
          title: article.title,
          bypassMethod: service.name,
        };
      }
    } catch (error) {
      console.log(`${service.name} failed:`, error);
      continue;
    }
  }

  return { success: false, error: 'All archive services failed' };
}

/**
 * Try direct fetch with reader mode extraction
 */
async function tryDirectFetch(url: string): Promise<PaywallResult> {
  try {
    const response = await fetchWithTimeout(url);
    
    if (!response || !response.ok) {
      return { success: false, error: `HTTP ${response?.status || 'timeout'}` };
    }

    const html = await response.text();
    const article = extractArticle(html, url);

    if (!article) {
      return { success: false, error: 'Could not extract article' };
    }

    // Check if content looks paywalled
    if (detectPaywall(html, article.textContent)) {
      return { success: false, error: 'Paywall detected in content' };
    }

    if (article.textContent.length < 500) {
      return { success: false, error: 'Content too short, likely paywalled' };
    }

    return {
      success: true,
      content: article.textContent,
      title: article.title,
      bypassMethod: 'direct',
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Main function to get article content, bypassing paywalls if needed
 */
export async function getArticleContent(url: string): Promise<PaywallResult> {
  console.log(`Fetching article: ${url}`);

  // Check if it's a known free source
  if (isFreeSource(url)) {
    const result = await tryDirectFetch(url);
    if (result.success) {
      return result;
    }
    // Even free sources might have issues, try archives as backup
  }

  // Check if it's a known paywall
  const { isPaywall, info } = isKnownPaywall(url);
  
  if (isPaywall) {
    console.log(`Known paywall site (${info?.notes}), trying archives first`);
    const archiveResult = await tryArchiveServices(url);
    if (archiveResult.success) {
      return archiveResult;
    }
    // Still try direct as fallback
  }

  // Try direct fetch first
  const directResult = await tryDirectFetch(url);
  if (directResult.success) {
    return directResult;
  }

  // If direct failed due to paywall, try archive services
  console.log('Direct fetch failed, trying archive services');
  return tryArchiveServices(url);
}

/**
 * Batch process multiple URLs
 */
export async function getArticlesBatch(urls: string[]): Promise<Map<string, PaywallResult>> {
  const results = new Map<string, PaywallResult>();
  
  // Process in parallel with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await getArticleContent(url);
        return { url, result };
      })
    );
    
    for (const { url, result } of batchResults) {
      results.set(url, result);
    }
  }
  
  return results;
}

/**
 * Get an archive URL for manual viewing
 */
export function getArchiveUrl(url: string, service: string = 'archive.is'): string {
  const archiveService = ARCHIVE_SERVICES.find(s => s.name === service);
  if (!archiveService) {
    return ARCHIVE_SERVICES[0].urlPattern(url);
  }
  return archiveService.urlPattern(url);
}

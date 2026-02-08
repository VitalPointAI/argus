/**
 * Article Content Extraction Service
 * 
 * Fetches full article content from URLs using Mozilla Readability.
 * Includes rate limiting to avoid hammering sources.
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Rate limiting state per domain
interface RateLimitEntry {
  lastRequest: number;
  requestCount: number;
  windowStart: number;
}

const rateLimitState = new Map<string, RateLimitEntry>();

// Default rate limit config
const DEFAULT_RATE_LIMIT = {
  minDelayMs: 1000,          // Minimum 1 second between requests to same domain
  maxRequestsPerWindow: 10,   // Max 10 requests per window
  windowMs: 60000,            // 1 minute window
};

export interface ExtractionResult {
  success: boolean;
  title?: string;
  content?: string;
  textContent?: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  length?: number;
  error?: string;
}

export interface RateLimitConfig {
  minDelayMs?: number;
  maxRequestsPerWindow?: number;
  windowMs?: number;
}

/**
 * Extract domain from URL for rate limiting
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Check and update rate limit for a domain
 * Returns true if request is allowed, false if rate limited
 */
function checkRateLimit(domain: string, config: RateLimitConfig = {}): { allowed: boolean; waitMs?: number } {
  const { 
    minDelayMs = DEFAULT_RATE_LIMIT.minDelayMs,
    maxRequestsPerWindow = DEFAULT_RATE_LIMIT.maxRequestsPerWindow,
    windowMs = DEFAULT_RATE_LIMIT.windowMs,
  } = config;

  const now = Date.now();
  let entry = rateLimitState.get(domain);

  if (!entry) {
    entry = { lastRequest: 0, requestCount: 0, windowStart: now };
    rateLimitState.set(domain, entry);
  }

  // Reset window if expired
  if (now - entry.windowStart > windowMs) {
    entry.windowStart = now;
    entry.requestCount = 0;
  }

  // Check minimum delay
  const timeSinceLastRequest = now - entry.lastRequest;
  if (entry.lastRequest > 0 && timeSinceLastRequest < minDelayMs) {
    return { allowed: false, waitMs: minDelayMs - timeSinceLastRequest };
  }

  // Check requests per window
  if (entry.requestCount >= maxRequestsPerWindow) {
    const windowRemaining = windowMs - (now - entry.windowStart);
    return { allowed: false, waitMs: windowRemaining };
  }

  // Update state
  entry.lastRequest = now;
  entry.requestCount++;

  return { allowed: true };
}

/**
 * Wait for rate limit to clear
 */
async function waitForRateLimit(domain: string, config: RateLimitConfig = {}): Promise<void> {
  const check = checkRateLimit(domain, config);
  if (!check.allowed && check.waitMs) {
    await new Promise(resolve => setTimeout(resolve, check.waitMs));
    // Recursively check again
    await waitForRateLimit(domain, config);
  }
}

/**
 * Fetch HTML content from a URL with proper headers
 */
async function fetchHTML(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Argus/1.0; +https://argus.vitalpoint.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract article content from HTML using Readability
 */
function extractFromHTML(html: string, url: string): ExtractionResult {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return {
        success: false,
        error: 'Readability could not parse article content',
      };
    }

    return {
      success: true,
      title: article.title || undefined,
      content: article.content || undefined,           // HTML content
      textContent: article.textContent || undefined,   // Plain text content
      excerpt: article.excerpt || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      length: article.length || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown extraction error',
    };
  }
}

/**
 * Extract full article content from a URL
 * 
 * @param url - The article URL to fetch and extract
 * @param options - Configuration options
 * @returns Extraction result with article content
 */
export async function extractArticle(
  url: string,
  options: {
    respectRateLimit?: boolean;
    rateLimitConfig?: RateLimitConfig;
    timeoutMs?: number;
  } = {}
): Promise<ExtractionResult> {
  const { 
    respectRateLimit = true, 
    rateLimitConfig,
    timeoutMs = 15000,
  } = options;

  const domain = getDomain(url);

  // Apply rate limiting
  if (respectRateLimit) {
    await waitForRateLimit(domain, rateLimitConfig);
  }

  try {
    const html = await fetchHTML(url, timeoutMs);
    return extractFromHTML(html, url);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch article',
    };
  }
}

/**
 * Batch extract articles with rate limiting
 * 
 * @param urls - Array of URLs to extract
 * @param options - Configuration options
 * @returns Array of extraction results (same order as input URLs)
 */
export async function extractArticlesBatch(
  urls: string[],
  options: {
    rateLimitConfig?: RateLimitConfig;
    timeoutMs?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<ExtractionResult[]> {
  const { onProgress, ...extractOptions } = options;
  const results: ExtractionResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const result = await extractArticle(urls[i], {
      respectRateLimit: true,
      ...extractOptions,
    });
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, urls.length);
    }
  }

  return results;
}

/**
 * Clear rate limit state for a domain (useful for testing)
 */
export function clearRateLimitState(domain?: string): void {
  if (domain) {
    rateLimitState.delete(domain);
  } else {
    rateLimitState.clear();
  }
}

/**
 * Get current rate limit state for monitoring
 */
export function getRateLimitStats(): Map<string, RateLimitEntry> {
  return new Map(rateLimitState);
}

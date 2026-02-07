/**
 * AI-Powered Source Suggestions
 * 
 * Uses LLM to suggest relevant RSS feeds and sources for a given topic or domain.
 */

const NEARAI_API_KEY = process.env.NEARAI_API_KEY;

interface SourceSuggestion {
  name: string;
  url: string;
  type: 'rss' | 'youtube' | 'twitter' | 'web';
  description: string;
  reliability: 'high' | 'medium' | 'low';
}

interface SuggestionResult {
  query: string;
  suggestions: SourceSuggestion[];
  reasoning: string;
}

/**
 * Generate source suggestions for a topic
 */
export async function suggestSourcesForTopic(topic: string): Promise<SuggestionResult> {
  if (!NEARAI_API_KEY) {
    return getFallbackSuggestions(topic);
  }

  const prompt = `You are an expert at finding reliable news and intelligence sources.

Given the topic: "${topic}"

Suggest 5-10 high-quality RSS feeds, YouTube channels, or news sources that cover this topic well.

For each source, provide:
1. Name of the source
2. RSS feed URL (must be a working RSS/Atom feed URL)
3. Type: rss, youtube, twitter, or web
4. Brief description
5. Reliability: high, medium, or low

IMPORTANT:
- Only suggest sources you are confident exist
- RSS URLs should end in /rss, /feed, .xml, or similar
- For YouTube, provide the channel URL (we'll find the RSS)
- Prefer established, reputable sources

Format your response as JSON:
{
  "suggestions": [
    {
      "name": "Source Name",
      "url": "https://example.com/rss",
      "type": "rss",
      "description": "Brief description",
      "reliability": "high"
    }
  ],
  "reasoning": "Brief explanation of why these sources are good for this topic"
}`;

  try {
    const response = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEARAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3.1',
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('Near AI API error:', response.status);
      return getFallbackSuggestions(topic);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        query: topic,
        suggestions: parsed.suggestions || [],
        reasoning: parsed.reasoning || '',
      };
    }
    
    return getFallbackSuggestions(topic);
  } catch (error) {
    console.error('Error getting source suggestions:', error);
    return getFallbackSuggestions(topic);
  }
}

/**
 * Suggest sources for a domain
 */
export async function suggestSourcesForDomain(domainSlug: string, domainName: string): Promise<SuggestionResult> {
  const topicMap: Record<string, string> = {
    'cyber': 'cybersecurity news, hacking, data breaches, security research',
    'crypto': 'cryptocurrency, bitcoin, ethereum, blockchain technology',
    'geopolitics': 'international relations, foreign policy, geopolitical analysis',
    'us-politics': 'US domestic politics, Congress, White House, elections',
    'china': 'China news, Chinese politics, US-China relations',
    'russia-ukraine': 'Russia-Ukraine war, Eastern European security',
    'middle-east': 'Middle East politics, Israel, Iran, Gulf states',
    'markets': 'financial markets, stocks, economics, central banks',
    'energy': 'energy markets, oil, gas, renewable energy',
    'ai-tech': 'artificial intelligence, machine learning, tech news',
    'climate': 'climate change, environmental policy, sustainability',
    'defense': 'military news, defense industry, weapons systems',
    'biotech': 'biotechnology, pharmaceuticals, health research',
    'space': 'space exploration, NASA, SpaceX, satellites',
  };

  const topic = topicMap[domainSlug] || domainName;
  return suggestSourcesForTopic(topic);
}

/**
 * Fallback suggestions when LLM is unavailable
 */
function getFallbackSuggestions(topic: string): SuggestionResult {
  const topicLower = topic.toLowerCase();
  
  const suggestions: SourceSuggestion[] = [];
  
  // Generic high-quality sources
  if (topicLower.includes('politic') || topicLower.includes('news')) {
    suggestions.push(
      { name: 'Reuters', url: 'https://www.reuters.com/rss/world', type: 'rss', description: 'International news', reliability: 'high' },
      { name: 'AP News', url: 'https://apnews.com/apf-topnews/feed', type: 'rss', description: 'Breaking news', reliability: 'high' }
    );
  }
  
  if (topicLower.includes('tech') || topicLower.includes('ai')) {
    suggestions.push(
      { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss', description: 'Tech news', reliability: 'high' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss', description: 'Startup and tech news', reliability: 'medium' }
    );
  }
  
  if (topicLower.includes('cyber') || topicLower.includes('security')) {
    suggestions.push(
      { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', type: 'rss', description: 'Security research', reliability: 'high' },
      { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', type: 'rss', description: 'Cybersecurity news', reliability: 'medium' }
    );
  }
  
  if (topicLower.includes('crypto') || topicLower.includes('bitcoin')) {
    suggestions.push(
      { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'rss', description: 'Crypto news', reliability: 'medium' },
      { name: 'The Block', url: 'https://www.theblock.co/rss', type: 'rss', description: 'Crypto research', reliability: 'medium' }
    );
  }
  
  return {
    query: topic,
    suggestions,
    reasoning: 'Fallback suggestions based on topic keywords. LLM-powered suggestions unavailable.',
  };
}

/**
 * Validate that a suggested URL is a working RSS feed
 */
export async function validateRSSUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Argus/1.0 RSS Validator',
      },
    });
    
    if (!response.ok) return false;
    
    const text = await response.text();
    // Check for RSS/Atom indicators
    return text.includes('<rss') || text.includes('<feed') || text.includes('<channel');
  } catch {
    return false;
  }
}

/**
 * Topic Classification Service
 * Uses LLM to extract topics from article content
 */

// NEAR AI Cloud API - https://docs.near.ai/cloud/guides/openai-compatibility
const NEAR_AI_BASE = 'https://cloud-api.near.ai/v1';
const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || 'deepseek-ai/DeepSeek-V3.1';

// Predefined topics that map to our domain structure
const KNOWN_TOPICS = [
  'China', 'Russia', 'Ukraine', 'Taiwan', 'North Korea', 'Iran', 'Israel', 'Gaza',
  'Middle East', 'Europe', 'Indo-Pacific', 'South China Sea', 'Asia Pacific', 'Africa', 'Latin America',
  'Japan', 'Philippines', 'Australia', 'India',
  'Defense', 'Military', 'Nuclear', 'Cyber Security', 'Intelligence',
  'AI', 'Technology', 'Semiconductors', 'Space',
  'Energy', 'Oil & Gas', 'Climate', 'Environment',
  'Economy', 'Trade', 'Sanctions', 'Markets',
  'Geopolitics', 'Diplomacy', 'Elections', 'Human Rights',
];

interface TopicResult {
  topics: string[];
  summary: string;
}

/**
 * Extract topics and summary from article using LLM
 * Fast classification - single API call
 */
export async function classifyArticleTopics(
  title: string,
  body: string,
  options?: { maxTopics?: number }
): Promise<TopicResult> {
  const maxTopics = options?.maxTopics || 5;
  
  // Truncate body if too long (save tokens)
  const truncatedBody = body.length > 2000 ? body.substring(0, 2000) + '...' : body;
  
  const prompt = `Analyze this article and extract:
1. Topics (1-${maxTopics} from this list: ${KNOWN_TOPICS.join(', ')})
2. One-sentence summary (max 150 chars)

Title: ${title}
Content: ${truncatedBody}

Respond in JSON only:
{"topics": ["Topic1", "Topic2"], "summary": "Brief summary"}`;

  try {
    const response = await fetch(`${NEAR_AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEAR_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: NEAR_AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1, // Low temp for consistency
      }),
    });

    if (!response.ok) {
      console.error('[TopicClassifier] API error:', response.status);
      return fallbackClassify(title, body);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        let topics = (parsed.topics || []).filter((t: string) => KNOWN_TOPICS.includes(t)).slice(0, maxTopics);
        
        // Validate geographic topics against content to prevent misclassification
        const textLower = `${title} ${truncatedBody}`.toLowerCase();
        const geoValidation: Record<string, string[]> = {
          'China': ['china', 'chinese', 'beijing', 'shanghai', 'hong kong', 'xi jinping', 'pla', 'ccp', 'renminbi', 'rmb'],
          'Russia': ['russia', 'russian', 'moscow', 'putin', 'kremlin'],
          'Ukraine': ['ukraine', 'ukrainian', 'kyiv', 'zelensky'],
          'Taiwan': ['taiwan', 'taiwanese', 'taipei', 'tsmc'],
          'North Korea': ['north korea', 'pyongyang', 'kim jong'],
          'Iran': ['iran', 'iranian', 'tehran', 'khamenei'],
          'Israel': ['israel', 'israeli', 'tel aviv', 'netanyahu'],
          'Japan': ['japan', 'japanese', 'tokyo'],
          'India': ['india', 'indian', 'delhi', 'modi'],
          'Australia': ['australia', 'australian', 'canberra', 'sydney', 'melbourne'],
          'Philippines': ['philippines', 'philippine', 'manila', 'marcos'],
        };
        
        // Remove geographic topics that don't appear in the text
        topics = topics.filter((topic: string) => {
          const keywords = geoValidation[topic];
          if (!keywords) return true; // Non-geographic topics pass through
          return keywords.some(kw => textLower.includes(kw));
        });
        
        return {
          topics,
          summary: (parsed.summary || '').substring(0, 200),
        };
      }
    } catch (parseErr) {
      console.error('[TopicClassifier] Parse error:', parseErr);
    }
    
    return fallbackClassify(title, body);
  } catch (err) {
    console.error('[TopicClassifier] Error:', err);
    return fallbackClassify(title, body);
  }
}

/**
 * Fallback keyword-based classification when LLM fails
 */
function fallbackClassify(title: string, body: string): TopicResult {
  const text = `${title} ${body}`.toLowerCase();
  const topics: string[] = [];
  
  // Simple keyword matching
  const keywordMap: Record<string, string[]> = {
    'China': ['china', 'beijing', 'chinese', 'xi jinping', 'pla', 'ccp'],
    'Russia': ['russia', 'russian', 'moscow', 'putin', 'kremlin'],
    'Ukraine': ['ukraine', 'ukrainian', 'kyiv', 'zelensky'],
    'Taiwan': ['taiwan', 'taipei', 'taiwanese', 'tsmc'],
    'Indo-Pacific': ['indo-pacific', 'indopacific', 'pacific ocean', 'aukus', 'quad alliance'],
    'South China Sea': ['south china sea', 'spratly', 'paracel', 'nine-dash'],
    'Japan': ['japan', 'japanese', 'tokyo', 'kishida'],
    'Philippines': ['philippines', 'philippine', 'manila', 'marcos jr'],
    'Australia': ['australia', 'australian', 'canberra'],
    'India': ['india', 'indian', 'delhi', 'modi'],
    'Defense': ['military', 'defense', 'army', 'navy', 'pentagon', 'troops'],
    'Nuclear': ['nuclear', 'nuke', 'atomic', 'warhead', 'icbm'],
    'Cyber Security': ['cyber', 'hack', 'ransomware', 'malware'],
    'AI': ['artificial intelligence', ' ai ', 'machine learning', 'chatgpt'],
    'Energy': ['oil', 'gas', 'energy', 'opec', 'petroleum'],
    'Economy': ['economy', 'gdp', 'inflation', 'recession'],
    'Trade': ['trade', 'tariff', 'sanctions', 'export'],
    'Middle East': ['israel', 'iran', 'saudi', 'gaza', 'hamas'],
    'Geopolitics': ['geopolitical', 'diplomacy', 'foreign policy'],
  };
  
  for (const [topic, keywords] of Object.entries(keywordMap)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
        break;
      }
    }
    if (topics.length >= 3) break;
  }
  
  // Default if nothing found
  if (topics.length === 0) {
    topics.push('Geopolitics');
  }
  
  return {
    topics,
    summary: title.substring(0, 150),
  };
}

/**
 * Batch classify multiple articles (more efficient)
 */
export async function classifyArticlesBatch(
  articles: Array<{ id: string; title: string; body: string }>
): Promise<Map<string, TopicResult>> {
  const results = new Map<string, TopicResult>();
  
  // Process in parallel with limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (article) => {
      const result = await classifyArticleTopics(article.title, article.body);
      results.set(article.id, result);
    });
    await Promise.all(promises);
  }
  
  return results;
}

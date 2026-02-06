/**
 * LLM Service using Near AI Cloud API
 * OpenAI-compatible interface for intelligent analysis
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const NEAR_AI_BASE_URL = 'https://cloud-api.near.ai/v1';
const NEAR_AI_API_KEY = process.env.NEARAI_API_KEY || '';

// Default to DeepSeek V3.1 for reasoning tasks
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3.1';

export async function complete(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResponse> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 2048,
    temperature = 0.7,
  } = options;

  if (!NEAR_AI_API_KEY) {
    throw new Error('NEARAI_API_KEY not configured');
  }

  const response = await fetch(`${NEAR_AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NEAR_AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Near AI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

/**
 * Summarize multiple articles into a cohesive briefing
 */
export async function summarizeArticles(
  articles: Array<{ title: string; body: string; domain: string; source: string }>,
  style: 'executive' | 'detailed' | 'bullet' = 'executive'
): Promise<string> {
  const styleGuide = {
    executive: 'Write a concise executive summary (2-3 paragraphs). Focus on key developments, implications, and required awareness. Be direct and actionable.',
    detailed: 'Write a comprehensive analysis covering all significant developments. Include context and connections between stories.',
    bullet: 'Create a bullet-point summary with key takeaways. Group by theme. Maximum 10 bullets.',
  };

  const articleText = articles
    .slice(0, 20) // Limit to avoid token overflow
    .map((a, i) => `[${i + 1}] ${a.domain} | ${a.source}\n${a.title}\n${a.body?.slice(0, 500) || ''}`)
    .join('\n\n---\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a strategic intelligence analyst. Your role is to synthesize news and developments into actionable briefings. ${styleGuide[style]} Never invent information. If sources conflict, note the discrepancy.`,
    },
    {
      role: 'user',
      content: `Analyze these ${articles.length} articles and create a briefing:\n\n${articleText}`,
    },
  ];

  const response = await complete(messages, { maxTokens: 1500, temperature: 0.5 });
  return response.content;
}

/**
 * Generate forecasts based on current developments
 */
export async function generateForecasts(
  developments: string[],
  domains: string[]
): Promise<Array<{
  event: string;
  probability: number;
  timeframe: 'near' | 'mid' | 'long';
  reasoning: string;
}>> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a strategic forecasting analyst. Based on current developments, generate probabilistic forecasts. Be calibrated - don't overstate confidence. Return JSON array with format: [{"event": "description", "probability": 0-100, "timeframe": "near|mid|long", "reasoning": "brief explanation"}]. Near = 1-7 days, mid = 1-4 weeks, long = 1-6 months.`,
    },
    {
      role: 'user',
      content: `Domains being monitored: ${domains.join(', ')}\n\nRecent developments:\n${developments.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nGenerate 3-5 forecasts based on these developments. Return only valid JSON.`,
    },
  ];

  const response = await complete(messages, { maxTokens: 1000, temperature: 0.6 });
  
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON found in forecast response:', response.content);
      return [];
    }
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse forecast JSON:', e, response.content);
    return [];
  }
}

/**
 * Identify significant changes and their implications
 */
export async function analyzeChanges(
  articles: Array<{ title: string; body: string; domain: string }>
): Promise<Array<{
  description: string;
  significance: 'low' | 'medium' | 'high';
  implications: string;
}>> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an intelligence analyst identifying significant developments. Evaluate each for strategic importance. Return JSON array: [{"description": "what changed", "significance": "low|medium|high", "implications": "why it matters"}]. High = immediate attention needed, medium = noteworthy development, low = background information.`,
    },
    {
      role: 'user',
      content: `Analyze these articles for significant changes:\n\n${articles.slice(0, 15).map((a, i) => `${i + 1}. [${a.domain}] ${a.title}`).join('\n')}\n\nIdentify the 5 most significant changes. Return only valid JSON.`,
    },
  ];

  const response = await complete(messages, { maxTokens: 800, temperature: 0.4 });
  
  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse changes JSON:', e);
    return [];
  }
}

export const llm = {
  complete,
  summarizeArticles,
  generateForecasts,
  analyzeChanges,
};

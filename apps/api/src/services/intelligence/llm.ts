/**
 * LLM Service with multi-provider support
 * Supports: Near AI, Anthropic (API key + OAuth)
 */

import { db, platformSettings } from '../../db';
import { eq } from 'drizzle-orm';

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

interface LLMConfig {
  provider: 'near-ai' | 'anthropic';
  model: string;
  apiKey: string;
  oauthToken?: string;
  useOAuth: boolean;
}

// Cache config for 60 seconds
let configCache: { config: LLMConfig; timestamp: number } | null = null;
const CONFIG_CACHE_TTL = 60_000;

async function getLLMConfig(): Promise<LLMConfig> {
  // Check cache
  if (configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL) {
    return configCache.config;
  }
  
  const settings = await db.select().from(platformSettings);
  
  const config: LLMConfig = {
    provider: 'near-ai',
    model: 'deepseek-ai/DeepSeek-V3.1',
    apiKey: process.env.NEAR_AI_API_KEY || '',
    useOAuth: false,
  };
  
  for (const s of settings) {
    if (s.key === 'llm_provider') config.provider = s.value as 'near-ai' | 'anthropic';
    if (s.key === 'llm_model') config.model = s.value;
    if (s.key === 'llm_api_key' && s.value) config.apiKey = s.value;
    if (s.key === 'anthropic_oauth_token' && s.value) config.oauthToken = s.value;
    if (s.key === 'llm_use_oauth') config.useOAuth = s.value === 'true';
  }
  
  // For Anthropic, prefer OAuth token if useOAuth is true and token exists
  if (config.provider === 'anthropic' && config.useOAuth && config.oauthToken) {
    config.apiKey = config.oauthToken;
  }
  
  configCache = { config, timestamp: Date.now() };
  return config;
}

// Clear cache when settings change
export function clearLLMConfigCache() {
  configCache = null;
}

async function completeNearAI(
  messages: ChatMessage[],
  options: CompletionOptions,
  config: LLMConfig
): Promise<CompletionResponse> {
  const response = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.7,
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

async function completeAnthropic(
  messages: ChatMessage[],
  options: CompletionOptions,
  config: LLMConfig
): Promise<CompletionResponse> {
  // Detect if using OAuth token (starts with sk-ant-oat)
  const isOAuth = config.apiKey?.startsWith('sk-ant-oat');
  
  // Convert messages to Anthropic format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  
  // OAuth tokens use Bearer auth + beta header
  if (isOAuth) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
    headers['anthropic-beta'] = 'oauth-2025-04-20';
  } else {
    headers['x-api-key'] = config.apiKey;
  }
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 2048,
      system: systemMessage,
      messages: chatMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    content: data.content[0]?.text || '',
    model: data.model,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

export async function complete(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResponse> {
  const config = await getLLMConfig();
  
  if (!config.apiKey) {
    throw new Error(`${config.provider.toUpperCase()} API key not configured`);
  }

  if (config.provider === 'anthropic') {
    return completeAnthropic(messages, options, config);
  } else {
    return completeNearAI(messages, options, config);
  }
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
    .slice(0, 20)
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
      content: 'You are a strategic forecasting analyst. Based on current developments, generate probabilistic forecasts. Be calibrated - don\'t overstate confidence. Return JSON array with format: [{"event": "description", "probability": 0-100, "timeframe": "near|mid|long", "reasoning": "brief explanation"}]. Near = 1-7 days, mid = 1-4 weeks, long = 1-6 months.',
    },
    {
      role: 'user',
      content: `Domains being monitored: ${domains.join(', ')}\n\nRecent developments:\n${developments.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nGenerate 3-5 forecasts based on these developments. Return only valid JSON.`,
    },
  ];

  const response = await complete(messages, { maxTokens: 1000, temperature: 0.6 });
  
  try {
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
      content: 'You are an intelligence analyst identifying significant developments. Evaluate each for strategic importance. Return JSON array: [{"description": "what changed", "significance": "low|medium|high", "implications": "why it matters"}]. High = immediate attention needed, medium = noteworthy development, low = background information.',
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
  clearLLMConfigCache,
};

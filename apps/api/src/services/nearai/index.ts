/**
 * NEAR AI Service
 * TEE-based private inference for claim extraction and reasoning
 */

const NEAR_AI_API_URL = 'https://cloud-api.near.ai/v1';
const NEAR_AI_API_KEY = process.env.NEAR_AI_API_KEY;

// Available models on NEAR AI
export const NEAR_AI_MODELS = {
  // Reasoning models
  DEEPSEEK_V3: 'deepseek-ai/DeepSeek-V3.1',
  QWEN3_30B: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
  GLM_4: 'zai-org/GLM-4.7',
  
  // Default for different tasks
  CLAIM_EXTRACTION: 'deepseek-ai/DeepSeek-V3.1',
  REASONING: 'deepseek-ai/DeepSeek-V3.1',
  SUMMARIZATION: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
};

export interface NearAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NearAIResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call NEAR AI chat completion API
 */
export async function nearAIChat(
  messages: NearAIMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  if (!NEAR_AI_API_KEY) {
    throw new Error('NEAR_AI_API_KEY not configured');
  }

  const {
    model = NEAR_AI_MODELS.DEEPSEEK_V3,
    maxTokens = 2048,
    temperature = 0.7,
  } = options;

  const response = await fetch(`${NEAR_AI_API_URL}/chat/completions`, {
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
    throw new Error(`NEAR AI API error: ${error}`);
  }

  const data: NearAIResponse = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Extract claims from article text using NEAR AI
 */
export async function extractClaimsNearAI(title: string, body: string): Promise<any[]> {
  const prompt = `Analyze this article and extract specific, verifiable factual claims.
Focus on claims that can be verified against other news sources.

Article Title: ${title}

Article Body: ${body.slice(0, 6000)}

Extract up to 5 key factual claims. For each claim:
1. State the claim clearly and specifically
2. Classify as: factual, prediction, or opinion
3. Indicate if it's verifiable (can be checked against other sources)

Respond in JSON format only:
{
  "claims": [
    {"text": "claim text", "type": "factual|prediction|opinion", "verifiable": true|false}
  ]
}`;

  const response = await nearAIChat([
    { role: 'user', content: prompt }
  ], {
    model: NEAR_AI_MODELS.CLAIM_EXTRACTION,
    maxTokens: 1024,
    temperature: 0.3,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.claims || [];
  } catch {
    return [];
  }
}

/**
 * Analyze evidence and generate verdict using NEAR AI
 */
export async function analyzeEvidenceNearAI(
  claim: string,
  evidence: { sourceName: string; title: string; quote: string; sourceReliability: number }[]
): Promise<{
  verdict: 'true' | 'false' | 'mixed' | 'unverified';
  confidence: number;
  reasoning: string;
  sourceAnalysis: { sourceIndex: number; stance: string; keyPoint: string }[];
}> {
  if (evidence.length === 0) {
    return {
      verdict: 'unverified',
      confidence: 0,
      reasoning: 'No relevant evidence found in our corpus.',
      sourceAnalysis: [],
    };
  }

  const evidenceText = evidence
    .slice(0, 5)
    .map((e, i) => `
[Source ${i + 1}]: ${e.sourceName} (Reliability: ${e.sourceReliability}%)
Title: ${e.title}
Excerpt: ${e.quote}
`)
    .join('\n');

  const prompt = `You are a fact-checker. Analyze whether the following claim is supported or contradicted by the evidence.

CLAIM TO VERIFY:
"${claim}"

EVIDENCE FROM NEWS SOURCES:
${evidenceText}

Analyze the evidence and determine:
1. Does each source SUPPORT, CONTRADICT, or have NO CLEAR STANCE on the claim?
2. Overall verdict: true, false, mixed, or unverified
3. Confidence level (0-100) based on evidence quality and agreement
4. Brief reasoning

Respond in JSON format only:
{
  "verdict": "true|false|mixed|unverified",
  "confidence": 0-100,
  "reasoning": "explanation",
  "source_analysis": [
    {"source_index": 1, "stance": "supports|contradicts|neutral", "key_point": "why"}
  ]
}`;

  const response = await nearAIChat([
    { role: 'user', content: prompt }
  ], {
    model: NEAR_AI_MODELS.REASONING,
    maxTokens: 1024,
    temperature: 0.3,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      verdict: parsed.verdict || 'unverified',
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || 'Analysis inconclusive.',
      sourceAnalysis: parsed.source_analysis || [],
    };
  } catch {
    return {
      verdict: 'unverified',
      confidence: 0,
      reasoning: 'Failed to analyze evidence.',
      sourceAnalysis: [],
    };
  }
}

/**
 * Generate briefing summary using NEAR AI
 */
export async function generateSummaryNearAI(
  articles: { title: string; body: string; domain: string; confidence: number }[]
): Promise<string> {
  const articlesSummary = articles
    .slice(0, 10)
    .map((a, i) => `[${a.domain}] ${a.title}\n${a.body.slice(0, 200)}...`)
    .join('\n\n');

  const prompt = `Create a concise strategic intelligence briefing from these articles.
Group by domain, highlight key developments, note any significant changes or emerging trends.
Be direct, factual, and actionable. Maximum 500 words.

ARTICLES:
${articlesSummary}

Write the briefing:`;

  return nearAIChat([
    { role: 'user', content: prompt }
  ], {
    model: NEAR_AI_MODELS.SUMMARIZATION,
    maxTokens: 1024,
    temperature: 0.5,
  });
}

/**
 * Generate probability forecasts using NEAR AI
 */
export async function generateForecastsNearAI(
  recentDevelopments: string[]
): Promise<{ event: string; probability: number; timeframe: string; reasoning: string }[]> {
  const prompt = `Based on these recent developments, generate 3-5 probability forecasts for near-term events.
Each forecast should include the event, probability (0-100), timeframe (days/weeks/months), and brief reasoning.

RECENT DEVELOPMENTS:
${recentDevelopments.join('\n')}

Respond in JSON format only:
{
  "forecasts": [
    {
      "event": "description of potential event",
      "probability": 0-100,
      "timeframe": "1-2 weeks",
      "reasoning": "why this probability"
    }
  ]
}`;

  const response = await nearAIChat([
    { role: 'user', content: prompt }
  ], {
    model: NEAR_AI_MODELS.REASONING,
    maxTokens: 1024,
    temperature: 0.6,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.forecasts || [];
  } catch {
    return [];
  }
}

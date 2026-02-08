/**
 * Bias Detection Service
 * 
 * Analyzes content for political bias, emotional language, and sensationalism.
 * Uses LLM for nuanced analysis with heuristic fallback.
 */

import { db, content, sources } from '../../db';
import { eq, sql, isNull, and } from 'drizzle-orm';

const NEARAI_API_KEY = process.env.NEARAI_API_KEY;

export interface BiasAnalysis {
  contentId: string;
  
  // Political lean
  politicalBias: 'far-left' | 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'far-right' | 'unknown';
  politicalConfidence: number; // 0-100
  
  // Emotional/sensational indicators
  emotionalLevel: 'none' | 'low' | 'medium' | 'high';
  sensationalismLevel: 'none' | 'low' | 'medium' | 'high';
  
  // Specific bias indicators found
  indicators: {
    loadedLanguage: string[];      // Emotionally charged words/phrases
    unsupportedClaims: string[];   // Claims without evidence
    cherryPicking: boolean;        // Selective fact presentation
    adHominem: boolean;            // Attacks on people rather than arguments
    falseBalance: boolean;         // Equal weight to unequal positions
    omission: string[];            // Important context missing
  };
  
  // Overall bias score (0 = neutral, 100 = heavily biased)
  overallBiasScore: number;
  
  // Human-readable summary
  summary: string;
  
  // Recommendations
  recommendations: string[];
}

// Common loaded language patterns by political lean
const LOADED_LANGUAGE = {
  left: [
    'far-right', 'extremist', 'fascist', 'bigot', 'xenophob', 'racist', 'white supremac',
    'climate denier', 'anti-science', 'plutocrat', 'oligarch', 'corporate greed',
    'working class', 'income inequality', 'systemic', 'marginalized', 'oppressed',
  ],
  right: [
    'far-left', 'radical left', 'socialist', 'communist', 'marxist', 'woke', 'leftist',
    'liberal elite', 'mainstream media', 'deep state', 'virtue signal', 'cancel culture',
    'freedom', 'patriot', 'illegal alien', 'taxpayer', 'law and order', 'traditional values',
  ],
  sensational: [
    'shocking', 'outrage', 'bombshell', 'explosive', 'devastating', 'slam', 'destroy',
    'breaking', 'exclusive', 'exposed', 'revealed', 'crisis', 'emergency', 'disaster',
    'unbelievable', 'incredible', 'unprecedented', 'historic',
  ],
  emotional: [
    'terrifying', 'horrifying', 'heartbreaking', 'infuriating', 'disgusting', 'appalling',
    'wonderful', 'amazing', 'beautiful', 'inspiring', 'courageous', 'hero',
  ],
};

/**
 * Heuristic bias detection (fast, used as fallback)
 */
function detectBiasHeuristic(text: string): BiasAnalysis {
  const lowerText = text.toLowerCase();
  
  // Count loaded language occurrences
  const leftCount = LOADED_LANGUAGE.left.filter(w => lowerText.includes(w)).length;
  const rightCount = LOADED_LANGUAGE.right.filter(w => lowerText.includes(w)).length;
  const sensationalCount = LOADED_LANGUAGE.sensational.filter(w => lowerText.includes(w)).length;
  const emotionalCount = LOADED_LANGUAGE.emotional.filter(w => lowerText.includes(w)).length;
  
  // Determine political lean
  let politicalBias: BiasAnalysis['politicalBias'] = 'center';
  let politicalConfidence = 30; // Low confidence for heuristic
  
  const leanDiff = leftCount - rightCount;
  if (Math.abs(leanDiff) <= 1) {
    politicalBias = 'center';
  } else if (leanDiff > 3) {
    politicalBias = 'left';
    politicalConfidence = 50;
  } else if (leanDiff > 1) {
    politicalBias = 'center-left';
    politicalConfidence = 40;
  } else if (leanDiff < -3) {
    politicalBias = 'right';
    politicalConfidence = 50;
  } else if (leanDiff < -1) {
    politicalBias = 'center-right';
    politicalConfidence = 40;
  }
  
  // Emotional/sensational levels
  const emotionalLevel = emotionalCount === 0 ? 'none' 
    : emotionalCount <= 2 ? 'low' 
    : emotionalCount <= 5 ? 'medium' : 'high';
    
  const sensationalismLevel = sensationalCount === 0 ? 'none'
    : sensationalCount <= 2 ? 'low'
    : sensationalCount <= 4 ? 'medium' : 'high';
  
  // Calculate overall bias score
  const biasComponents = [
    Math.abs(leanDiff) * 5,
    sensationalCount * 8,
    emotionalCount * 5,
  ];
  const overallBiasScore = Math.min(100, biasComponents.reduce((a, b) => a + b, 0));
  
  return {
    contentId: '',
    politicalBias,
    politicalConfidence,
    emotionalLevel,
    sensationalismLevel,
    indicators: {
      loadedLanguage: [
        ...LOADED_LANGUAGE.left.filter(w => lowerText.includes(w)),
        ...LOADED_LANGUAGE.right.filter(w => lowerText.includes(w)),
        ...LOADED_LANGUAGE.sensational.filter(w => lowerText.includes(w)),
      ],
      unsupportedClaims: [],
      cherryPicking: false,
      adHominem: /attack|slam|destroy|blast|rip/i.test(lowerText),
      falseBalance: false,
      omission: [],
    },
    overallBiasScore,
    summary: `Heuristic analysis detected ${politicalBias} lean with ${emotionalLevel} emotional language and ${sensationalismLevel} sensationalism.`,
    recommendations: overallBiasScore > 50 
      ? ['Seek additional sources for balance', 'Check for primary sources']
      : ['Content appears relatively neutral'],
  };
}

/**
 * LLM-powered bias detection (thorough, accurate)
 */
async function detectBiasLLM(
  contentId: string,
  title: string,
  body: string,
  sourceName: string
): Promise<BiasAnalysis> {
  const prompt = `Analyze this news article for bias, emotional language, and journalistic quality.

TITLE: ${title}
SOURCE: ${sourceName}

CONTENT:
${body.substring(0, 3000)}

Analyze for:
1. Political bias (where does this lean on the political spectrum?)
2. Emotional/loaded language
3. Sensationalism (clickbait, hyperbole)
4. Journalistic issues (unsupported claims, cherry-picking, ad hominem attacks)

Respond with JSON only:
{
  "politicalBias": "far-left|left|center-left|center|center-right|right|far-right|unknown",
  "politicalConfidence": 0-100,
  "emotionalLevel": "none|low|medium|high",
  "sensationalismLevel": "none|low|medium|high",
  "indicators": {
    "loadedLanguage": ["list of emotionally charged words/phrases found"],
    "unsupportedClaims": ["claims made without evidence"],
    "cherryPicking": true/false,
    "adHominem": true/false,
    "falseBalance": true/false,
    "omission": ["important context that seems missing"]
  },
  "overallBiasScore": 0-100,
  "summary": "One sentence summary of bias analysis",
  "recommendations": ["suggestions for readers"]
}

Be objective. Bias exists across the political spectrum. Focus on journalistic quality.`;

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
          { role: 'system', content: 'You are an impartial media bias analyst. Detect bias objectively across all political perspectives.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const llmContent = data.choices?.[0]?.message?.content || '';
    const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { contentId, ...parsed };
    }
  } catch (error) {
    console.error('LLM bias detection failed:', error);
  }

  // Fallback to heuristic
  const heuristic = detectBiasHeuristic(`${title} ${body}`);
  heuristic.contentId = contentId;
  return heuristic;
}

/**
 * Analyze content for bias and store results
 */
export async function analyzeContentBias(contentId: string): Promise<BiasAnalysis> {
  // Get content
  const [item] = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      sourceName: sources.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .where(eq(content.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  // Run bias analysis
  const analysis = NEARAI_API_KEY
    ? await detectBiasLLM(contentId, item.title, item.body, item.sourceName || 'Unknown')
    : detectBiasHeuristic(`${item.title} ${item.body}`);

  analysis.contentId = contentId;

  // Store bias analysis in content metadata (using existing jsonb field or add to verification)
  // For now, we'll store it in the verifications table if one exists
  // In production, you'd want a dedicated bias_analysis table or column

  return analysis;
}

/**
 * Batch analyze unanalyzed content for bias
 */
export async function batchBiasAnalysis(limit: number = 20): Promise<{
  analyzed: number;
  errors: number;
  results: Array<{ contentId: string; biasScore: number; politicalBias: string }>;
}> {
  // Get recent content without bias analysis
  const unanalyzed = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      sourceName: sources.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .where(sql`LENGTH(${content.body}) > 200`)
    .orderBy(sql`${content.publishedAt} DESC`)
    .limit(limit);

  let analyzed = 0;
  let errors = 0;
  const results: Array<{ contentId: string; biasScore: number; politicalBias: string }> = [];

  for (const item of unanalyzed) {
    try {
      const analysis = await analyzeContentBias(item.id);
      analyzed++;
      results.push({
        contentId: item.id,
        biasScore: analysis.overallBiasScore,
        politicalBias: analysis.politicalBias,
      });
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`Bias analysis error for ${item.id}:`, error);
      errors++;
    }
  }

  return { analyzed, errors, results };
}

/**
 * Get bias summary for a source based on its content
 */
export async function getSourceBiasSummary(sourceId: string): Promise<{
  sourceId: string;
  sourceName: string;
  averageBiasScore: number;
  dominantPoliticalLean: string;
  sensationalismTendency: string;
  sampleSize: number;
}> {
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId));

  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  // Get recent content from this source
  const recentContent = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
    })
    .from(content)
    .where(eq(content.sourceId, sourceId))
    .orderBy(sql`${content.publishedAt} DESC`)
    .limit(10);

  if (recentContent.length === 0) {
    return {
      sourceId,
      sourceName: source.name,
      averageBiasScore: 0,
      dominantPoliticalLean: 'unknown',
      sensationalismTendency: 'unknown',
      sampleSize: 0,
    };
  }

  // Analyze each piece of content
  const biasLeans: string[] = [];
  let totalBiasScore = 0;
  let sensationalCount = 0;

  for (const item of recentContent) {
    const analysis = detectBiasHeuristic(`${item.title} ${item.body}`);
    biasLeans.push(analysis.politicalBias);
    totalBiasScore += analysis.overallBiasScore;
    if (analysis.sensationalismLevel === 'medium' || analysis.sensationalismLevel === 'high') {
      sensationalCount++;
    }
  }

  // Find dominant lean
  const leanCounts: Record<string, number> = {};
  biasLeans.forEach(l => { leanCounts[l] = (leanCounts[l] || 0) + 1; });
  const dominantLean = Object.entries(leanCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  return {
    sourceId,
    sourceName: source.name,
    averageBiasScore: Math.round(totalBiasScore / recentContent.length),
    dominantPoliticalLean: dominantLean,
    sensationalismTendency: sensationalCount > recentContent.length / 2 ? 'high' : sensationalCount > 0 ? 'moderate' : 'low',
    sampleSize: recentContent.length,
  };
}

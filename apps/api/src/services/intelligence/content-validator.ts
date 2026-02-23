/**
 * Content Validator
 * 
 * Validates article content for accuracy and temporal consistency.
 * Returns reliability adjustments to penalize articles with issues.
 */

import { generateWithNearAI } from './llm';

interface ValidationResult {
  reliabilityPenalty: number;  // 0 to 0.5 (deducted from confidence)
  issues: string[];
  isValid: boolean;
}

// Known patterns that indicate outdated content
const OUTDATED_PATTERNS: Array<{ pattern: RegExp; penalty: number; issue: string }> = [
  // Political titles - adjust based on current reality
  { pattern: /former president trump/i, penalty: 0.3, issue: 'Uses outdated political title (Trump is current president)' },
  { pattern: /president biden/i, penalty: 0.3, issue: 'Uses outdated political title (Biden is former president)' },
  { pattern: /vice president harris/i, penalty: 0.3, issue: 'Uses outdated political title (Harris is former VP)' },
  
  // Date references that suggest old content
  { pattern: /in 2024,?\s+(we|the|it|they)/i, penalty: 0.2, issue: 'References 2024 as current year' },
  { pattern: /last year in 2024/i, penalty: 0.1, issue: 'References 2024 as last year (correct for 2025)' },
  { pattern: /this year.*2024/i, penalty: 0.3, issue: 'References 2024 as this year' },
  
  // Predictions about past events
  { pattern: /will (happen|occur|take place) in (2023|2024|early 2025)/i, penalty: 0.25, issue: 'Contains predictions about past dates' },
  
  // Generic staleness indicators
  { pattern: /upcoming.*election.*202[0-4]/i, penalty: 0.3, issue: 'References past elections as upcoming' },
];

/**
 * Fast pattern-based validation
 */
function validatePatterns(content: string, title: string): ValidationResult {
  const issues: string[] = [];
  let totalPenalty = 0;
  
  const fullText = `${title} ${content}`;
  
  for (const { pattern, penalty, issue } of OUTDATED_PATTERNS) {
    if (pattern.test(fullText)) {
      issues.push(issue);
      totalPenalty += penalty;
    }
  }
  
  // Cap penalty at 0.5 (50% confidence reduction)
  totalPenalty = Math.min(totalPenalty, 0.5);
  
  return {
    reliabilityPenalty: totalPenalty,
    issues,
    isValid: issues.length === 0,
  };
}

/**
 * LLM-based validation for deeper accuracy check
 */
async function validateWithLLM(content: string, title: string, articleDate: Date): Promise<ValidationResult> {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' });
  
  const prompt = `You are a fact-checker validating article content for temporal accuracy and factual consistency.

Current date: ${currentMonth} ${currentDate.getDate()}, ${currentYear}
Article date: ${articleDate.toISOString().split('T')[0]}
Article title: ${title}

Article excerpt (first 1500 chars):
${content.substring(0, 1500)}

Check for:
1. Outdated political titles (e.g., wrong president/PM references)
2. Temporal inconsistencies (dates that don't match current reality)
3. References to events as "upcoming" when they've already occurred
4. Any factual claims that appear incorrect as of the current date

Respond in JSON format:
{
  "hasIssues": true/false,
  "issues": ["issue 1", "issue 2"],
  "severityScore": 0.0-0.5 (0 = no issues, 0.5 = major accuracy problems)
}

Only flag clear accuracy issues, not opinions or predictions about the future.`;

  try {
    const response = await generateWithNearAI({
      prompt,
      maxTokens: 300,
      temperature: 0.1,
    });
    
    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        reliabilityPenalty: Math.min(result.severityScore || 0, 0.5),
        issues: result.issues || [],
        isValid: !result.hasIssues,
      };
    }
  } catch (error) {
    console.error('[ContentValidator] LLM validation failed:', error);
  }
  
  // Default to no issues if LLM fails
  return { reliabilityPenalty: 0, issues: [], isValid: true };
}

/**
 * Main validation function
 * Combines pattern matching (fast) with optional LLM check (thorough)
 */
export async function validateArticleContent(
  content: string,
  title: string,
  articleDate: Date,
  options: { useLLM?: boolean; llmSampleRate?: number } = {}
): Promise<ValidationResult> {
  const { useLLM = true, llmSampleRate = 0.3 } = options;
  
  // Fast pattern check first
  const patternResult = validatePatterns(content, title);
  
  // If patterns found issues, return immediately with penalty
  if (patternResult.issues.length > 0) {
    console.log(`[ContentValidator] Pattern issues found in "${title.substring(0, 50)}...": ${patternResult.issues.join(', ')}`);
    return patternResult;
  }
  
  // Optional LLM validation (sample-based to control costs)
  if (useLLM && Math.random() < llmSampleRate) {
    const llmResult = await validateWithLLM(content, title, articleDate);
    if (llmResult.issues.length > 0) {
      console.log(`[ContentValidator] LLM issues found in "${title.substring(0, 50)}...": ${llmResult.issues.join(', ')}`);
    }
    return llmResult;
  }
  
  // No issues found
  return { reliabilityPenalty: 0, issues: [], isValid: true };
}

/**
 * Batch validate multiple articles
 */
export async function validateArticles(
  articles: Array<{ content: string; title: string; publishedAt: Date; confidenceScore: number }>,
  options: { useLLM?: boolean; llmSampleRate?: number } = {}
): Promise<Array<{ original: typeof articles[0]; validation: ValidationResult; adjustedConfidence: number }>> {
  const results = await Promise.all(
    articles.map(async (article) => {
      const validation = await validateArticleContent(
        article.content,
        article.title,
        article.publishedAt,
        options
      );
      
      // Apply penalty to confidence score
      const adjustedConfidence = Math.max(0, article.confidenceScore - (validation.reliabilityPenalty * 100));
      
      return {
        original: article,
        validation,
        adjustedConfidence,
      };
    })
  );
  
  return results;
}

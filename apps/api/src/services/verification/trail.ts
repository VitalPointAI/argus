/**
 * Verification Trail Service
 * 
 * Provides detailed explanations of how confidence scores were calculated.
 * Shows the full verification journey: source reliability, claims, cross-references, bias.
 */

import { db, content, sources, articleClaims, crossReferenceResults, verifications, reliabilityHistory } from '../../db';
import { eq, desc, sql } from 'drizzle-orm';
import { isGroundTruthSource, GROUND_TRUTH_SOURCES } from './cross-reference';

interface VerificationTrailStep {
  type: 'source' | 'claim' | 'cross_reference' | 'bias' | 'credibility' | 'ground_truth';
  label: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  scoreContribution: number; // How much this affected the final score
  details?: Record<string, any>;
}

interface VerificationTrail {
  contentId: string;
  contentTitle: string;
  finalConfidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'very_low';
  
  // The trail explaining the score
  steps: VerificationTrailStep[];
  
  // Summary
  summary: {
    positiveFactors: string[];
    negativeFactors: string[];
    recommendation: string;
  };
  
  // Comparison to similar content
  comparison: {
    sourceAverage: number;
    domainAverage: number;
    percentileRank: number;
  };
}

/**
 * Generate a complete verification trail for content
 */
export async function generateVerificationTrail(contentId: string): Promise<VerificationTrail> {
  // Get content with source and domain info
  const [item] = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      confidenceScore: content.confidenceScore,
      verificationId: content.verificationId,
      sourceId: content.sourceId,
      sourceName: sources.name,
      sourceReliability: sources.reliabilityScore,
      domainId: sources.domainId,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .where(eq(content.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  const steps: VerificationTrailStep[] = [];
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  // ========== Step 1: Source Reliability ==========
  const sourceScore = item.sourceReliability || 50;
  const isGroundTruth = isGroundTruthSource(item.sourceName || '');
  
  if (isGroundTruth) {
    steps.push({
      type: 'ground_truth',
      label: 'Wire Service Source',
      description: `${item.sourceName} is a wire service (ground truth source). These are held to the highest journalistic standards.`,
      impact: 'positive',
      scoreContribution: 15,
      details: { sourceName: item.sourceName, groundTruthSources: GROUND_TRUTH_SOURCES },
    });
    positiveFactors.push('Published by a trusted wire service');
  }

  steps.push({
    type: 'source',
    label: 'Source Reliability',
    description: `${item.sourceName} has a reliability score of ${sourceScore}/100 based on historical accuracy and user ratings.`,
    impact: sourceScore >= 70 ? 'positive' : sourceScore >= 50 ? 'neutral' : 'negative',
    scoreContribution: Math.round((sourceScore - 50) * 0.3), // ±15 points max
    details: { sourceName: item.sourceName, reliabilityScore: sourceScore },
  });

  if (sourceScore >= 70) {
    positiveFactors.push(`High source reliability (${sourceScore}/100)`);
  } else if (sourceScore < 40) {
    negativeFactors.push(`Low source reliability (${sourceScore}/100)`);
  }

  // ========== Step 2: Claims Analysis ==========
  const claims = await db
    .select()
    .from(articleClaims)
    .where(eq(articleClaims.contentId, contentId));

  if (claims.length > 0) {
    const verifiedClaims = claims.filter(c => c.verificationStatus === 'verified');
    const contradictedClaims = claims.filter(c => c.verificationStatus === 'contradicted');
    const partialClaims = claims.filter(c => c.verificationStatus === 'partially_verified');
    
    const claimImpact = verifiedClaims.length >= claims.length / 2 ? 'positive'
      : contradictedClaims.length > 0 ? 'negative' : 'neutral';

    steps.push({
      type: 'claim',
      label: 'Factual Claims Extracted',
      description: `${claims.length} factual claims were identified: ${verifiedClaims.length} verified, ${partialClaims.length} partially verified, ${contradictedClaims.length} contradicted.`,
      impact: claimImpact,
      scoreContribution: (verifiedClaims.length * 3) - (contradictedClaims.length * 5),
      details: {
        totalClaims: claims.length,
        verified: verifiedClaims.length,
        partiallyVerified: partialClaims.length,
        unverified: claims.filter(c => c.verificationStatus === 'unverified').length,
        contradicted: contradictedClaims.length,
        claims: claims.map(c => ({
          text: c.claimText.substring(0, 100) + '...',
          status: c.verificationStatus,
          confidence: c.confidence,
        })),
      },
    });

    if (verifiedClaims.length > 0) {
      positiveFactors.push(`${verifiedClaims.length} claims verified by other sources`);
    }
    if (contradictedClaims.length > 0) {
      negativeFactors.push(`${contradictedClaims.length} claims contradicted by other sources`);
    }
  } else {
    steps.push({
      type: 'claim',
      label: 'No Claims Extracted',
      description: 'Factual claims have not been extracted from this article yet. Run claim extraction for deeper verification.',
      impact: 'neutral',
      scoreContribution: 0,
    });
  }

  // ========== Step 3: Cross-References ==========
  const crossRefs = await db
    .select()
    .from(crossReferenceResults)
    .where(eq(crossReferenceResults.contentId, contentId));

  if (crossRefs.length > 0) {
    const accurate = crossRefs.filter(r => r.wasAccurate);
    const inaccurate = crossRefs.filter(r => !r.wasAccurate);
    
    steps.push({
      type: 'cross_reference',
      label: 'Cross-Reference Check',
      description: `Content was cross-referenced with ${crossRefs.length} other sources: ${accurate.length} corroborated, ${inaccurate.length} contradicted.`,
      impact: accurate.length > inaccurate.length ? 'positive' : inaccurate.length > accurate.length ? 'negative' : 'neutral',
      scoreContribution: (accurate.length * 5) - (inaccurate.length * 8),
      details: {
        totalReferences: crossRefs.length,
        corroborated: accurate.length,
        contradicted: inaccurate.length,
        sources: crossRefs.map(r => ({
          source: r.verificationSource,
          wasAccurate: r.wasAccurate,
          confidence: r.confidence,
        })),
      },
    });

    if (accurate.length >= 3) {
      positiveFactors.push(`Corroborated by ${accurate.length} independent sources`);
    }
  }

  // ========== Step 4: Credibility Indicators ==========
  const text = `${item.title} ${item.body}`.toLowerCase();
  const credibilityIndicators = {
    citesMultipleSources: /according to|sources say|reports indicate|confirmed by/i.test(text),
    hasSpecificData: /\d+%|\$\d|million|billion/i.test(text),
    citesExperts: /professor|dr\.|expert|analyst|official said/i.test(text),
    includesDates: /\d{4}|january|february|march|april|may|june|july|august|september|october|november|december/i.test(text),
    hasVerifiableData: /study|research|data shows|statistics/i.test(text),
  };

  const credibilityCount = Object.values(credibilityIndicators).filter(Boolean).length;
  
  steps.push({
    type: 'credibility',
    label: 'Credibility Indicators',
    description: `${credibilityCount}/5 credibility indicators present: ${Object.entries(credibilityIndicators).filter(([_, v]) => v).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ') || 'none detected'}`,
    impact: credibilityCount >= 3 ? 'positive' : credibilityCount <= 1 ? 'negative' : 'neutral',
    scoreContribution: (credibilityCount - 2) * 3,
    details: credibilityIndicators,
  });

  if (credibilityCount >= 4) {
    positiveFactors.push('Strong credibility indicators (cites sources, data, experts)');
  } else if (credibilityCount <= 1) {
    negativeFactors.push('Few credibility indicators present');
  }

  // ========== Step 5: Bias Check ==========
  const biasWords = ['shocking', 'outrage', 'unbelievable', 'breaking', 'exclusive', 'exposed'];
  const biasCount = biasWords.filter(w => text.includes(w)).length;
  
  if (biasCount > 0) {
    steps.push({
      type: 'bias',
      label: 'Sensationalism Detected',
      description: `${biasCount} sensational/emotional words detected. This may indicate bias or clickbait.`,
      impact: 'negative',
      scoreContribution: -biasCount * 3,
      details: { wordsFound: biasWords.filter(w => text.includes(w)) },
    });
    negativeFactors.push('Contains sensational/emotional language');
  } else {
    steps.push({
      type: 'bias',
      label: 'Neutral Tone',
      description: 'No significant sensational or emotionally loaded language detected.',
      impact: 'positive',
      scoreContribution: 5,
    });
    positiveFactors.push('Neutral, factual tone');
  }

  // ========== Calculate Final Score ==========
  const baseScore = 50; // Start at neutral
  const totalContribution = steps.reduce((sum, s) => sum + s.scoreContribution, 0);
  const calculatedScore = Math.max(0, Math.min(100, baseScore + totalContribution));
  const finalScore = item.confidenceScore ?? calculatedScore;

  // Determine confidence level
  const confidenceLevel = finalScore >= 80 ? 'high'
    : finalScore >= 60 ? 'medium'
    : finalScore >= 40 ? 'low' : 'very_low';

  // ========== Comparison to Similar Content ==========
  // Get source average
  const [sourceAvg] = await db
    .select({ avg: sql<number>`AVG(${content.confidenceScore})` })
    .from(content)
    .where(eq(content.sourceId, item.sourceId));

  // Get percentile rank
  const [percentile] = await db
    .select({ 
      rank: sql<number>`(SELECT COUNT(*) FROM content WHERE confidence_score < ${finalScore}) * 100.0 / NULLIF((SELECT COUNT(*) FROM content WHERE confidence_score IS NOT NULL), 0)` 
    })
    .from(content)
    .limit(1);

  // ========== Generate Recommendation ==========
  let recommendation: string;
  if (finalScore >= 80) {
    recommendation = 'This content appears highly reliable. It is well-sourced, factually accurate, and presents information neutrally.';
  } else if (finalScore >= 60) {
    recommendation = 'This content is moderately reliable. Consider cross-referencing key claims with additional sources.';
  } else if (finalScore >= 40) {
    recommendation = 'Exercise caution with this content. Key claims may be unverified or the source has reliability concerns.';
  } else {
    recommendation = 'This content has significant reliability concerns. Verify all claims with trusted sources before citing.';
  }

  return {
    contentId,
    contentTitle: item.title,
    finalConfidenceScore: finalScore,
    confidenceLevel,
    steps,
    summary: {
      positiveFactors,
      negativeFactors,
      recommendation,
    },
    comparison: {
      sourceAverage: Math.round(sourceAvg.avg || 50),
      domainAverage: 60, // Would need domain-level query
      percentileRank: Math.round(percentile?.rank || 50),
    },
  };
}

/**
 * Get a simplified verification summary (for lists/cards)
 */
export async function getVerificationSummary(contentId: string): Promise<{
  contentId: string;
  confidenceScore: number;
  confidenceLevel: string;
  topFactor: string;
  claimsVerified: number;
  claimsTotal: number;
  crossReferences: number;
}> {
  const [item] = await db
    .select({
      id: content.id,
      confidenceScore: content.confidenceScore,
    })
    .from(content)
    .where(eq(content.id, contentId));

  if (!item) {
    throw new Error(`Content ${contentId} not found`);
  }

  const claims = await db
    .select()
    .from(articleClaims)
    .where(eq(articleClaims.contentId, contentId));

  const crossRefs = await db
    .select()
    .from(crossReferenceResults)
    .where(eq(crossReferenceResults.contentId, contentId));

  const verifiedClaims = claims.filter(c => c.verificationStatus === 'verified');
  const score = item.confidenceScore || 50;

  let topFactor = 'Source reliability';
  if (verifiedClaims.length >= 3) topFactor = `${verifiedClaims.length} verified claims`;
  else if (crossRefs.filter(r => r.wasAccurate).length >= 3) topFactor = 'Multi-source corroboration';

  return {
    contentId,
    confidenceScore: score,
    confidenceLevel: score >= 80 ? 'high' : score >= 60 ? 'medium' : score >= 40 ? 'low' : 'very_low',
    topFactor,
    claimsVerified: verifiedClaims.length,
    claimsTotal: claims.length,
    crossReferences: crossRefs.filter(r => r.wasAccurate).length,
  };
}

/**
 * Fact Checking & Review System
 * 
 * Every claim in a briefing is:
 * 1. Linked to source article(s)
 * 2. Given a verification status
 * 3. Available for user review/correction
 */

import { db, content, sources, domains, verifications } from '../../db';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

export interface FactClaim {
  id: string;
  claim: string;
  sourceArticleIds: string[];
  sourceArticles: {
    id: string;
    title: string;
    url: string;
    source: string;
    confidenceScore: number;
  }[];
  verificationStatus: 'verified' | 'unverified' | 'disputed' | 'needs_review';
  confidenceScore: number;
  domain: string;
  extractedAt: Date;
}

export interface ReviewableBriefing {
  id: string;
  type: string;
  generatedAt: Date;
  claims: FactClaim[];
  summary: string;
  overallConfidence: number;
  reviewStatus: 'pending' | 'reviewed' | 'approved' | 'rejected';
  reviewNotes?: string;
}

/**
 * Extract verifiable claims from articles
 * Each claim is tied to specific source articles
 */
export async function extractVerifiableClaims(articleIds: string[]): Promise<FactClaim[]> {
  const articles = await db
    .select({
      id: content.id,
      title: content.title,
      body: content.body,
      url: content.url,
      confidenceScore: content.confidenceScore,
      source: sources.name,
      domain: domains.name,
    })
    .from(content)
    .leftJoin(sources, eq(content.sourceId, sources.id))
    .leftJoin(domains, eq(sources.domainId, domains.id))
    .where(inArray(content.id, articleIds));

  // Group by domain and extract key claims (title = primary claim)
  const claims: FactClaim[] = articles.map((article, idx) => ({
    id: `claim-${article.id}`,
    claim: article.title || '',
    sourceArticleIds: [article.id],
    sourceArticles: [{
      id: article.id,
      title: article.title || '',
      url: article.url || '',
      source: article.source || 'Unknown',
      confidenceScore: article.confidenceScore || 0,
    }],
    verificationStatus: article.confidenceScore && article.confidenceScore >= 70 
      ? 'verified' 
      : article.confidenceScore && article.confidenceScore >= 50 
        ? 'unverified' 
        : 'needs_review',
    confidenceScore: article.confidenceScore || 0,
    domain: article.domain || 'Unknown',
    extractedAt: new Date(),
  }));

  return claims;
}

/**
 * Cross-reference claims across multiple sources
 * Claims mentioned by multiple sources get higher confidence
 */
export function crossReferenceClaims(claims: FactClaim[]): FactClaim[] {
  // Group claims by similarity (simple keyword matching for now)
  const claimGroups = new Map<string, FactClaim[]>();
  
  for (const claim of claims) {
    // Normalize claim for matching
    const keywords = claim.claim.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(' ')
      .filter(w => w.length > 4)
      .slice(0, 5)
      .sort()
      .join('|');
    
    if (!claimGroups.has(keywords)) {
      claimGroups.set(keywords, []);
    }
    claimGroups.get(keywords)!.push(claim);
  }

  // Merge claims from multiple sources
  const mergedClaims: FactClaim[] = [];
  
  for (const [_, groupClaims] of claimGroups) {
    if (groupClaims.length === 1) {
      mergedClaims.push(groupClaims[0]);
    } else {
      // Multiple sources = higher confidence
      const merged: FactClaim = {
        ...groupClaims[0],
        sourceArticleIds: groupClaims.flatMap(c => c.sourceArticleIds),
        sourceArticles: groupClaims.flatMap(c => c.sourceArticles),
        confidenceScore: Math.min(95, groupClaims[0].confidenceScore + (groupClaims.length - 1) * 10),
        verificationStatus: groupClaims.length >= 3 ? 'verified' : 'unverified',
      };
      mergedClaims.push(merged);
    }
  }

  return mergedClaims;
}

/**
 * Format claims for LLM with strict factual constraints
 */
export function formatClaimsForPrompt(claims: FactClaim[]): string {
  return claims
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 30) // Top 30 claims
    .map(c => {
      const sources = c.sourceArticles.map(s => s.source).join(', ');
      const status = c.verificationStatus === 'verified' ? '✓' : 
                     c.verificationStatus === 'disputed' ? '⚠' : '?';
      return `[${status}${c.confidenceScore}%] ${c.claim} (${sources})`;
    })
    .join('\n');
}

/**
 * Build factual briefing prompt with strict constraints
 */
export function buildFactualBriefingPrompt(claims: FactClaim[], type: string): string {
  const claimsByDomain = claims.reduce((acc, c) => {
    if (!acc[c.domain]) acc[c.domain] = [];
    acc[c.domain].push(c);
    return acc;
  }, {} as Record<string, FactClaim[]>);

  const formattedClaims = Object.entries(claimsByDomain)
    .map(([domain, domainClaims]) => {
      const formatted = domainClaims
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 5)
        .map(c => {
          const sources = [...new Set(c.sourceArticles.map(s => s.source))].join(', ');
          return `  • ${c.claim} [${c.confidenceScore}% - ${sources}]`;
        })
        .join('\n');
      return `**${domain}**\n${formatted}`;
    })
    .join('\n\n');

  return `You are a fact-checking intelligence analyst. Your output must be 100% factual.

STRICT RULES:
1. ONLY report information directly from the provided sources
2. NEVER add speculation, interpretation, or analysis not in sources
3. Include source attribution for EVERY claim
4. If confidence is below 70%, mark as UNVERIFIED
5. Use exact wording from sources where possible
6. If sources conflict, note the discrepancy

VERIFIED CLAIMS BY DOMAIN:
${formattedClaims}

Generate a ${type} briefing following this EXACT format:

---
**VERIFIED INTELLIGENCE BRIEFING**
Generated: [timestamp]
Sources: [count] articles from [count] sources
Overall Confidence: [weighted average]%

**KEY DEVELOPMENTS** (verified claims only)
[List each development with source in parentheses]

**UNVERIFIED REPORTS** (if any)
[List with explicit UNVERIFIED tag]

**SOURCE CONFLICTS** (if any)
[Note any contradictions between sources]

**CITATIONS**
[List all source articles with URLs]
---

Remember: Only include facts directly stated in the source material.`;
}

/**
 * Create reviewable briefing structure
 */
export function createReviewableBriefing(
  briefingContent: string,
  claims: FactClaim[],
  type: string
): ReviewableBriefing {
  const verifiedClaims = claims.filter(c => c.verificationStatus === 'verified');
  const avgConfidence = claims.length > 0
    ? Math.round(claims.reduce((sum, c) => sum + c.confidenceScore, 0) / claims.length)
    : 0;

  return {
    id: `briefing-${Date.now()}`,
    type,
    generatedAt: new Date(),
    claims,
    summary: briefingContent,
    overallConfidence: avgConfidence,
    reviewStatus: 'pending',
  };
}

export interface ReviewAction {
  claimId: string;
  action: 'approve' | 'dispute' | 'needs_more_sources' | 'remove';
  note?: string;
  reviewedBy?: string;
}

/**
 * Process user review actions
 */
export function processReviewActions(
  briefing: ReviewableBriefing,
  actions: ReviewAction[]
): ReviewableBriefing {
  const updatedClaims = briefing.claims.map(claim => {
    const action = actions.find(a => a.claimId === claim.id);
    if (!action) return claim;

    switch (action.action) {
      case 'approve':
        return { ...claim, verificationStatus: 'verified' as const };
      case 'dispute':
        return { ...claim, verificationStatus: 'disputed' as const };
      case 'needs_more_sources':
        return { ...claim, verificationStatus: 'needs_review' as const };
      case 'remove':
        return null;
      default:
        return claim;
    }
  }).filter((c): c is FactClaim => c !== null);

  return {
    ...briefing,
    claims: updatedClaims,
    reviewStatus: 'reviewed',
  };
}

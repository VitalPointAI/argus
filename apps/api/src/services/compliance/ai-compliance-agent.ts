// AI Compliance Agent
// Reviews bounty requests and intel submissions for harmful content
// Uses Near AI for inference

import { db } from '../../db';
import { complianceReviews, complianceRules, intelBounties, humintSubmissions, notifications } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { getNearAICompletion } from '../nearai';

interface ComplianceIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion?: string;
  location?: string;
}

interface ComplianceResult {
  approved: boolean;
  status: 'approved' | 'needs_revision' | 'rejected';
  riskScore: number;
  issues: ComplianceIssue[];
  message?: string;
  reviewId: string;
}

const COMPLIANCE_SYSTEM_PROMPT = `You are an AI compliance agent for Argus, an intelligence platform. Your job is to review content for harmful or prohibited material.

PROHIBITED CONTENT (auto-reject):
- Requests to identify, locate, or track specific individuals
- Personal identifiable information (PII) - home addresses, phone numbers, SSN, financial accounts
- Doxxing - revealing someone's private identity or information
- Content designed to facilitate harassment, stalking, or harm
- Requests for information about individuals' daily routines, schedules, or movements
- Content targeting family members, children, or personal relationships
- Requests that could enable blackmail, extortion, or illegal activity

REQUIRES REVISION:
- Vague requests that could be interpreted as targeting individuals
- Missing context about legitimate use case
- Intel submissions lacking verifiability or source context
- Content with unnecessary personal details that could be redacted

ALLOWED:
- Geopolitical analysis, market intelligence, OSINT
- Information about public figures in their public capacity
- Corporate/organizational intelligence (not individual employees' private info)
- Conflict zone reporting, humanitarian information
- Technology, energy, crypto/DeFi intelligence

Respond in JSON format:
{
  "approved": boolean,
  "status": "approved" | "needs_revision" | "rejected",
  "risk_score": 0-100,
  "issues": [
    {
      "type": "pii" | "targeting" | "doxxing" | "harassment" | "quality" | "context",
      "severity": "low" | "medium" | "high" | "critical",
      "description": "What the issue is",
      "suggestion": "How to fix it (if fixable)"
    }
  ],
  "message": "Brief explanation for the user"
}`;

export async function reviewBountyRequest(bountyId: string): Promise<ComplianceResult> {
  // Get bounty details
  const [bounty] = await db.select()
    .from(intelBounties)
    .where(eq(intelBounties.id, bountyId))
    .limit(1);

  if (!bounty) {
    throw new Error('Bounty not found');
  }

  const contentToReview = `
INTEL BOUNTY REQUEST:
Title: ${bounty.title}
Description: ${bounty.description}
Intended Use: ${bounty.intendedUse || 'Not provided'}
Category: ${bounty.category}
Regions: ${bounty.regions?.join(', ') || 'None specified'}
Domains: ${bounty.domains?.join(', ') || 'None specified'}
  `.trim();

  return await runComplianceReview('bounty_request', bountyId, contentToReview);
}

export async function reviewIntelSubmission(submissionId: string): Promise<ComplianceResult> {
  // Get submission details
  const [submission] = await db.select()
    .from(humintSubmissions)
    .where(eq(humintSubmissions.id, submissionId))
    .limit(1);

  if (!submission) {
    throw new Error('Submission not found');
  }

  const contentToReview = `
INTEL SUBMISSION:
Title: ${submission.title}
Content: ${submission.content}
Region: ${submission.region || 'Not specified'}
Event Type: ${submission.eventType || 'Not specified'}
Verification Notes: ${submission.verificationNotes || 'None'}
  `.trim();

  return await runComplianceReview('intel_submission', submissionId, contentToReview);
}

async function runComplianceReview(
  contentType: string,
  contentId: string,
  content: string
): Promise<ComplianceResult> {
  // Create pending review record
  const [review] = await db.insert(complianceReviews)
    .values({
      contentType,
      contentId,
      status: 'pending',
    })
    .returning();

  try {
    // Get AI analysis
    const aiResponse = await getNearAICompletion(
      COMPLIANCE_SYSTEM_PROMPT,
      `Please review this content for compliance:\n\n${content}`,
      { temperature: 0.1, maxTokens: 1000 }
    );

    // Parse AI response
    let analysis;
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      // Default to needs_revision if parsing fails
      analysis = {
        approved: false,
        status: 'needs_revision',
        risk_score: 50,
        issues: [{
          type: 'review_error',
          severity: 'medium',
          description: 'Automated review could not complete. Manual review required.',
        }],
        message: 'Your submission is being reviewed. Please wait for approval.',
      };
    }

    // Update review record
    const status = analysis.status || (analysis.approved ? 'approved' : 'needs_revision');
    const [updated] = await db.update(complianceReviews)
      .set({
        status,
        aiModel: 'nearai/deepseek-v3',
        aiAnalysis: analysis,
        issuesFound: analysis.issues || [],
        riskScore: analysis.risk_score || 0,
        finalStatus: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null,
        finalReason: analysis.message,
        reviewedAt: new Date(),
        revisionMessage: status === 'needs_revision' ? analysis.message : null,
      })
      .where(eq(complianceReviews.id, review.id))
      .returning();

    // If needs revision, update the content status
    if (contentType === 'bounty_request' && status !== 'approved') {
      await db.update(intelBounties)
        .set({ reviewStatus: status === 'rejected' ? 'rejected' : 'pending' })
        .where(eq(intelBounties.id, contentId));
    }

    return {
      approved: status === 'approved',
      status: status as ComplianceResult['status'],
      riskScore: analysis.risk_score || 0,
      issues: analysis.issues || [],
      message: analysis.message,
      reviewId: review.id,
    };

  } catch (error) {
    console.error('Compliance review error:', error);
    
    // Update review with error
    await db.update(complianceReviews)
      .set({
        status: 'needs_revision',
        aiAnalysis: { error: String(error) },
        revisionMessage: 'Review system encountered an error. Your submission will be manually reviewed.',
      })
      .where(eq(complianceReviews.id, review.id));

    return {
      approved: false,
      status: 'needs_revision',
      riskScore: 50,
      issues: [{
        type: 'system_error',
        severity: 'medium',
        description: 'Automated review failed',
      }],
      message: 'Your submission will be manually reviewed.',
      reviewId: review.id,
    };
  }
}

// Handle user revision submission
export async function submitRevision(
  reviewId: string,
  userResponse: string
): Promise<ComplianceResult> {
  const [review] = await db.select()
    .from(complianceReviews)
    .where(eq(complianceReviews.id, reviewId))
    .limit(1);

  if (!review) {
    throw new Error('Review not found');
  }

  if (review.status !== 'needs_revision') {
    throw new Error('Review is not awaiting revision');
  }

  // Update with user response
  await db.update(complianceReviews)
    .set({ userResponse })
    .where(eq(complianceReviews.id, reviewId));

  // Re-run compliance check on the original content + revision context
  // For now, just re-check the content
  if (review.contentType === 'bounty_request') {
    return await reviewBountyRequest(review.contentId);
  } else if (review.contentType === 'intel_submission') {
    return await reviewIntelSubmission(review.contentId);
  }

  throw new Error('Unknown content type');
}

// Quick pre-check before full AI review (uses keyword blocklist)
export async function quickComplianceCheck(text: string): Promise<{
  passed: boolean;
  blockedKeyword?: string;
  reason?: string;
}> {
  const lowerText = text.toLowerCase();
  
  // Critical keywords that always fail
  const criticalKeywords = [
    { keyword: 'home address', reason: 'Personal targeting' },
    { keyword: 'residential address', reason: 'Personal targeting' },
    { keyword: 'where does', reason: 'Location tracking' },
    { keyword: 'daily routine', reason: 'Stalking indicator' },
    { keyword: 'schedule of', reason: 'Stalking indicator' },
    { keyword: 'real name of', reason: 'Doxxing' },
    { keyword: 'true identity', reason: 'Doxxing' },
    { keyword: 'social security', reason: 'PII' },
    { keyword: 'bank account', reason: 'Financial PII' },
    { keyword: 'blackmail', reason: 'Criminal intent' },
    { keyword: 'extort', reason: 'Criminal intent' },
  ];

  for (const { keyword, reason } of criticalKeywords) {
    if (lowerText.includes(keyword)) {
      return { passed: false, blockedKeyword: keyword, reason };
    }
  }

  return { passed: true };
}

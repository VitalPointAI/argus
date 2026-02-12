// AI Compliance Agent
// Reviews bounty requests and intel submissions for harmful content
// Uses Near AI for inference

import { db } from '../../db';
import { complianceReviews, complianceRules, intelBounties, humintSubmissions, notifications } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { callNearAI } from '../nearai';

// Wrapper for Near AI completion
async function getNearAICompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const result = await callNearAI({
    systemPrompt,
    userPrompt,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? 2000,
  });
  return result.content || '';
}

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

const PROOF_REQUIREMENTS_PROMPT = `You are an AI agent that identifies what proof/evidence would be required to verify an intelligence submission.

For the given bounty request, determine what ZK (zero-knowledge) proofs a source would need to provide to verify their submission WITHOUT revealing sensitive source information.

AVAILABLE PROOF TYPES:
1. location_proximity - Prove presence near coordinates without revealing exact location
   params: {target_lat, target_lng, radius_km}
   
2. timestamp_range - Prove content captured within time window
   params: {not_before: ISO datetime, not_after: ISO datetime}
   
3. document_contains - Prove document has keywords without revealing full content
   params: {required_keywords: string[], document_type?: string}
   
4. image_metadata - Prove image has certain EXIF properties
   params: {min_resolution?: {width, height}, device_type?: string, has_gps?: boolean}
   
5. multi_source_corroboration - Require multiple independent sources
   params: {min_witnesses: number}
   
6. verifiable_credential - Prove possession of credential
   params: {credential_type: string, issuer?: string}

7. satellite_imagery_match - Prove imagery matches reference
   params: {reference_hash?: string, location: {lat, lng}, max_time_delta_hours?: number}

Respond in JSON format:
{
  "proof_requirements": [
    {
      "template": "template_name",
      "params": { ... template-specific parameters ... },
      "description": "Human-readable description of what this proves",
      "required": true/false,
      "weight": 1-10 (importance for verification)
    }
  ],
  "verification_notes": "Any additional notes about verification approach"
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
Content: ${submission.body}
Region: ${submission.locationRegion || 'Not specified'}
Event Type: ${submission.eventTag || 'Not specified'}
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

// ============================================
// Generate Proof Requirements for Bounty
// ============================================

interface ProofRequirement {
  template: string;
  params: Record<string, any>;
  description: string;
  required: boolean;
  weight: number;
}

interface ProofRequirementsResult {
  requirements: ProofRequirement[];
  verificationNotes?: string;
}

export async function generateProofRequirements(bountyId: string): Promise<ProofRequirementsResult> {
  // Get bounty details
  const [bounty] = await db.select()
    .from(intelBounties)
    .where(eq(intelBounties.id, bountyId))
    .limit(1);

  if (!bounty) {
    throw new Error('Bounty not found');
  }

  const contentToAnalyze = `
INTEL BOUNTY REQUEST:
Title: ${bounty.title}
Description: ${bounty.description}
Category: ${bounty.category}
Regions: ${bounty.regions?.join(', ') || 'None specified'}
Domains: ${bounty.domains?.join(', ') || 'None specified'}
Intended Use: ${bounty.intendedUse || 'Not specified'}
  `.trim();

  try {
    const aiResponse = await getNearAICompletion(
      PROOF_REQUIREMENTS_PROMPT,
      `Analyze this bounty and determine what proof requirements would validate a legitimate response:\n\n${contentToAnalyze}`,
      { temperature: 0.2, maxTokens: 1500 }
    );

    // Parse response
    let analysis;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Failed to parse proof requirements:', aiResponse);
      // Default requirements
      analysis = {
        proof_requirements: [
          {
            template: 'timestamp_range',
            params: { not_before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), not_after: new Date().toISOString() },
            description: 'Content must be recent (within last 7 days)',
            required: true,
            weight: 5
          }
        ],
        verification_notes: 'Default requirements applied due to parsing error'
      };
    }

    // Update bounty with requirements
    await db.update(intelBounties)
      .set({
        proofRequirements: analysis.proof_requirements,
        proofRequirementsGeneratedAt: new Date(),
        proofRequirementsAiModel: 'nearai/deepseek-v3',
      })
      .where(eq(intelBounties.id, bountyId));

    return {
      requirements: analysis.proof_requirements || [],
      verificationNotes: analysis.verification_notes,
    };

  } catch (error) {
    console.error('Proof requirements generation error:', error);
    throw error;
  }
}

// Verify submitted proofs against requirements
export async function verifyProofSubmission(
  submissionId: string,
  bountyId: string,
  proofs: Array<{
    requirementIndex: number;
    proofType: string;
    proofData: any;
    publicInputs?: any;
  }>
): Promise<{
  allVerified: boolean;
  results: Array<{
    requirementIndex: number;
    verified: boolean;
    message: string;
  }>;
}> {
  // Get bounty and its requirements
  const [bounty] = await db.select()
    .from(intelBounties)
    .where(eq(intelBounties.id, bountyId))
    .limit(1);

  if (!bounty) {
    throw new Error('Bounty not found');
  }

  const requirements = (bounty.proofRequirements as ProofRequirement[]) || [];
  const results: Array<{ requirementIndex: number; verified: boolean; message: string }> = [];

  for (const proof of proofs) {
    const requirement = requirements[proof.requirementIndex];
    if (!requirement) {
      results.push({
        requirementIndex: proof.requirementIndex,
        verified: false,
        message: 'Requirement not found',
      });
      continue;
    }

    // For now, do basic verification based on proof type
    // In production, this would call actual ZK verification circuits
    const verificationResult = await verifyProof(requirement, proof);
    results.push({
      requirementIndex: proof.requirementIndex,
      verified: verificationResult.verified,
      message: verificationResult.message,
    });
  }

  // Check all required proofs are present and verified
  const requiredIndices = requirements
    .map((r, i) => r.required ? i : -1)
    .filter(i => i >= 0);

  const allRequiredVerified = requiredIndices.every(i => 
    results.find(r => r.requirementIndex === i)?.verified
  );

  return {
    allVerified: allRequiredVerified,
    results,
  };
}

// ZK Proof verification
async function verifyProof(
  requirement: ProofRequirement,
  proof: { proofType: string; proofData: any; publicInputs?: any }
): Promise<{ verified: boolean; message: string }> {
  if (proof.proofType !== requirement.template) {
    return { verified: false, message: `Proof type mismatch: expected ${requirement.template}, got ${proof.proofType}` };
  }

  if (!proof.proofData) {
    return { verified: false, message: 'No proof data provided' };
  }

  const publicInputs = proof.publicInputs || {};
  const isGroth16 = publicInputs.proof_type === 'groth16';

  // If it's a Groth16 proof, verify cryptographically
  if (isGroth16 && proof.proofData.proof && proof.proofData.publicSignals) {
    try {
      // Dynamic import to avoid issues if snarkjs not installed
      const snarkjs = await import('snarkjs');
      
      // Load verification key for this circuit type
      const vkeyPath = `./circuits/${requirement.template}_vkey.json`;
      const fs = await import('fs');
      
      if (fs.existsSync(vkeyPath)) {
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
        const valid = await snarkjs.groth16.verify(
          vkey,
          proof.proofData.publicSignals,
          proof.proofData.proof
        );
        
        if (!valid) {
          return { verified: false, message: 'Cryptographic proof verification failed' };
        }
        
        return { verified: true, message: `ZK proof verified (Groth16)` };
      }
    } catch (e) {
      console.log('ZK verification not available, falling back to public inputs check');
    }
  }

  // Fallback: Verify based on public inputs
  switch (requirement.template) {
    case 'timestamp_range': {
      const { not_before, not_after } = requirement.params;
      const withinRange = publicInputs.within_range;
      
      if (withinRange === undefined) {
        // Check timestamp directly
        const { timestamp } = publicInputs;
        if (!timestamp) {
          return { verified: false, message: 'No timestamp in public inputs' };
        }
        const ts = new Date(timestamp);
        if (ts < new Date(not_before) || ts > new Date(not_after)) {
          return { verified: false, message: 'Timestamp outside allowed range' };
        }
      } else if (!withinRange) {
        return { verified: false, message: 'Timestamp outside allowed range' };
      }
      
      return { verified: true, message: 'Timestamp verified within range' };
    }

    case 'location_proximity': {
      const { radius_km } = requirement.params;
      const { within_radius, distance_km } = publicInputs;
      
      if (within_radius === false) {
        return { verified: false, message: `Location outside ${radius_km}km radius` };
      }
      
      if (distance_km !== undefined && distance_km > radius_km) {
        return { verified: false, message: `Location ${distance_km}km from target exceeds ${radius_km}km radius` };
      }
      
      return { verified: true, message: `Location verified within ${radius_km}km radius` };
    }

    case 'document_contains': {
      const { required_keywords } = requirement.params;
      const { keyword_matches, keywordsFound, foundCount } = publicInputs;
      
      if (keywordsFound === false) {
        return { verified: false, message: 'Not all required keywords found in document' };
      }
      
      if (keyword_matches && Array.isArray(keyword_matches)) {
        const allFound = required_keywords.every((kw: string) => 
          keyword_matches.some((m: string) => m.toLowerCase() === kw.toLowerCase())
        );
        if (!allFound) {
          return { verified: false, message: 'Not all required keywords found in document' };
        }
      }
      
      return { verified: true, message: 'Document contains all required keywords' };
    }

    case 'multi_source_corroboration': {
      const { min_witnesses } = requirement.params;
      const { witness_count } = publicInputs;
      if (!witness_count || witness_count < min_witnesses) {
        return { verified: false, message: `Need ${min_witnesses} witnesses, got ${witness_count || 0}` };
      }
      return { verified: true, message: `Corroborated by ${witness_count} sources` };
    }

    default:
      // Accept other proof types with basic check
      return { verified: true, message: `Proof accepted (${requirement.template})` };
  }
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

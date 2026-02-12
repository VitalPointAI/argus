/**
 * AI Proof Requirement Inference
 * 
 * Intelligent system that analyzes bounty requests and determines
 * optimal ZK proof requirements for verification.
 */

import { callNearAI } from '../nearai';

// ============ PROOF TEMPLATES ============

export interface ProofTemplate {
  id: string;
  name: string;
  description: string;
  circuit: string;
  paramSchema: Record<string, ParamDefinition>;
  applicableCategories: string[];
  applicableDomains: string[];
  verificationStrength: 'weak' | 'moderate' | 'strong' | 'cryptographic';
  privacyLevel: 'low' | 'medium' | 'high';
  complexity: number; // 1-10
}

interface ParamDefinition {
  type: 'number' | 'string' | 'boolean' | 'datetime' | 'coordinates' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
  examples?: unknown[];
}

export const PROOF_TEMPLATES: ProofTemplate[] = [
  {
    id: 'location_proximity',
    name: 'Location Proximity',
    description: 'Proves presence within a radius of coordinates without revealing exact location',
    circuit: 'location_proximity.circom',
    paramSchema: {
      target_lat: { type: 'number', required: true, description: 'Target latitude', examples: [51.5074, 40.7128] },
      target_lng: { type: 'number', required: true, description: 'Target longitude', examples: [-0.1278, -74.0060] },
      radius_km: { type: 'number', required: true, description: 'Radius in kilometers', default: 5, examples: [1, 5, 10, 50] },
    },
    applicableCategories: ['conflict_zones', 'osint', 'geopolitics'],
    applicableDomains: ['military', 'conflict', 'humanitarian', 'events'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 3,
  },
  {
    id: 'timestamp_range',
    name: 'Timestamp Range',
    description: 'Proves content was captured within a time window',
    circuit: 'timestamp_range.circom',
    paramSchema: {
      not_before: { type: 'datetime', required: true, description: 'Earliest allowed time (ISO 8601)' },
      not_after: { type: 'datetime', required: true, description: 'Latest allowed time (ISO 8601)' },
    },
    applicableCategories: ['*'], // All categories
    applicableDomains: ['*'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'medium',
    complexity: 2,
  },
  {
    id: 'document_contains',
    name: 'Document Keywords',
    description: 'Proves document contains required keywords without revealing full content',
    circuit: 'document_keywords.circom',
    paramSchema: {
      required_keywords: { type: 'array', required: true, description: 'Keywords that must be present', examples: [['explosion', 'military'], ['contract', 'signed']] },
      document_type: { type: 'string', required: false, description: 'Expected document type', examples: ['report', 'memo', 'transcript'] },
    },
    applicableCategories: ['corporate', 'geopolitics', 'technology'],
    applicableDomains: ['corporate', 'government', 'legal'],
    verificationStrength: 'moderate',
    privacyLevel: 'high',
    complexity: 4,
  },
  {
    id: 'image_exif',
    name: 'Image Metadata',
    description: 'Proves image properties (time, location, device) from EXIF data',
    circuit: 'image_exif.circom',
    paramSchema: {
      min_timestamp: { type: 'datetime', required: false, description: 'Image must be taken after this time' },
      max_timestamp: { type: 'datetime', required: false, description: 'Image must be taken before this time' },
      require_gps: { type: 'boolean', required: false, description: 'Require GPS coordinates in EXIF', default: false },
      min_width: { type: 'number', required: false, description: 'Minimum image width', default: 640 },
      min_height: { type: 'number', required: false, description: 'Minimum image height', default: 480 },
      allowed_devices: { type: 'array', required: false, description: 'Allowed camera/device types' },
    },
    applicableCategories: ['conflict_zones', 'osint', 'general'],
    applicableDomains: ['military', 'conflict', 'events', 'humanitarian'],
    verificationStrength: 'strong',
    privacyLevel: 'high',
    complexity: 5,
  },
  {
    id: 'multi_source_corroboration',
    name: 'Multi-Source Corroboration',
    description: 'Proves multiple independent sources agree on a claim',
    circuit: 'multi_source_corroboration.circom',
    paramSchema: {
      min_sources: { type: 'number', required: true, description: 'Minimum required sources', default: 2, examples: [2, 3, 5] },
      max_time_delta_hours: { type: 'number', required: false, description: 'Max time between submissions', default: 48 },
    },
    applicableCategories: ['conflict_zones', 'geopolitics', 'market_intelligence'],
    applicableDomains: ['*'],
    verificationStrength: 'strong',
    privacyLevel: 'high',
    complexity: 6,
  },
  {
    id: 'credential_ownership',
    name: 'Verifiable Credential',
    description: 'Proves possession of a credential without revealing holder identity',
    circuit: 'credential_ownership.circom',
    paramSchema: {
      credential_type: { type: 'string', required: true, description: 'Type of credential', examples: ['press_pass', 'government_clearance', 'professional_license'] },
      issuer: { type: 'string', required: false, description: 'Expected issuer organization' },
      min_issuance_age_days: { type: 'number', required: false, description: 'Credential must be at least X days old', default: 0 },
    },
    applicableCategories: ['corporate', 'geopolitics', 'conflict_zones'],
    applicableDomains: ['government', 'military', 'corporate', 'media'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 7,
  },
  {
    id: 'financial_threshold',
    name: 'Financial Threshold',
    description: 'Proves value meets threshold without revealing exact amount',
    circuit: 'financial_threshold.circom',
    paramSchema: {
      min_value: { type: 'number', required: false, description: 'Minimum value (in base units)' },
      max_value: { type: 'number', required: false, description: 'Maximum value (in base units)' },
      currency: { type: 'string', required: false, description: 'Currency code', examples: ['USD', 'EUR', 'BTC', 'ETH'] },
    },
    applicableCategories: ['market_intelligence', 'crypto_defi', 'corporate'],
    applicableDomains: ['finance', 'crypto', 'corporate'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 4,
  },
  {
    id: 'network_membership',
    name: 'Network Membership',
    description: 'Proves membership in a group without revealing which member',
    circuit: 'network_membership.circom',
    paramSchema: {
      network_id: { type: 'string', required: true, description: 'Network/organization identifier' },
      min_membership_days: { type: 'number', required: false, description: 'Minimum membership duration', default: 0 },
      required_role: { type: 'string', required: false, description: 'Required role/tier' },
    },
    applicableCategories: ['corporate', 'technology', 'crypto_defi'],
    applicableDomains: ['corporate', 'technology', 'crypto'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 6,
  },
  {
    id: 'temporal_sequence',
    name: 'Temporal Sequence',
    description: 'Proves events occurred in specific order with time constraints',
    circuit: 'temporal_sequence.circom',
    paramSchema: {
      event_count: { type: 'number', required: true, description: 'Number of events in sequence', examples: [2, 3, 5] },
      min_gaps_hours: { type: 'array', required: false, description: 'Minimum hours between consecutive events' },
      max_gaps_hours: { type: 'array', required: false, description: 'Maximum hours between consecutive events' },
    },
    applicableCategories: ['conflict_zones', 'geopolitics', 'corporate'],
    applicableDomains: ['events', 'conflict', 'legal'],
    verificationStrength: 'strong',
    privacyLevel: 'high',
    complexity: 5,
  },
  {
    id: 'chain_of_custody',
    name: 'Chain of Custody',
    description: 'Proves document passed through verified chain without modification',
    circuit: 'chain_of_custody.circom',
    paramSchema: {
      min_handlers: { type: 'number', required: false, description: 'Minimum handlers in chain', default: 1 },
      max_chain_hours: { type: 'number', required: false, description: 'Max hours for full chain', default: 72 },
    },
    applicableCategories: ['corporate', 'geopolitics', 'conflict_zones'],
    applicableDomains: ['legal', 'government', 'corporate'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 7,
  },
  {
    id: 'communication_proof',
    name: 'Communication Receipt',
    description: 'Proves receipt of signed message from specific sender',
    circuit: 'communication_proof.circom',
    paramSchema: {
      sender_type: { type: 'string', required: false, description: 'Type of sender', examples: ['insider', 'official', 'whistleblower'] },
      time_window_hours: { type: 'number', required: false, description: 'Receipt must be within X hours', default: 168 },
      channel_type: { type: 'string', required: false, description: 'Communication channel', examples: ['encrypted_email', 'signal', 'direct'] },
    },
    applicableCategories: ['corporate', 'geopolitics', 'conflict_zones'],
    applicableDomains: ['*'],
    verificationStrength: 'cryptographic',
    privacyLevel: 'high',
    complexity: 6,
  },
];

// ============ CATEGORY PROFILES ============

interface CategoryProfile {
  category: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  defaultProofTypes: string[];
  requiredProofStrength: 'weak' | 'moderate' | 'strong' | 'cryptographic';
  minProofCount: number;
  specialConsiderations: string[];
}

const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  conflict_zones: {
    category: 'conflict_zones',
    riskLevel: 'critical',
    defaultProofTypes: ['location_proximity', 'timestamp_range', 'image_exif'],
    requiredProofStrength: 'strong',
    minProofCount: 2,
    specialConsiderations: [
      'Prioritize source safety - never require revealing exact position',
      'Multi-source corroboration highly valuable',
      'Image/video timestamp and GPS crucial',
      'Consider satellite imagery verification for large events',
    ],
  },
  geopolitics: {
    category: 'geopolitics',
    riskLevel: 'high',
    defaultProofTypes: ['timestamp_range', 'document_contains', 'credential_ownership'],
    requiredProofStrength: 'moderate',
    minProofCount: 2,
    specialConsiderations: [
      'Document authenticity is key',
      'Official credentials add significant weight',
      'Cross-reference with public records when possible',
    ],
  },
  market_intelligence: {
    category: 'market_intelligence',
    riskLevel: 'medium',
    defaultProofTypes: ['timestamp_range', 'financial_threshold', 'network_membership'],
    requiredProofStrength: 'moderate',
    minProofCount: 1,
    specialConsiderations: [
      'Timing is critical for market-moving information',
      'Insider access proofs valuable but sensitive',
      'Financial data requires careful handling',
    ],
  },
  crypto_defi: {
    category: 'crypto_defi',
    riskLevel: 'medium',
    defaultProofTypes: ['timestamp_range', 'financial_threshold', 'chain_of_custody'],
    requiredProofStrength: 'cryptographic',
    minProofCount: 1,
    specialConsiderations: [
      'On-chain verification preferred where possible',
      'Wallet ownership proofs straightforward',
      'Transaction timing critical',
    ],
  },
  corporate: {
    category: 'corporate',
    riskLevel: 'medium',
    defaultProofTypes: ['document_contains', 'network_membership', 'communication_proof'],
    requiredProofStrength: 'moderate',
    minProofCount: 1,
    specialConsiderations: [
      'Internal document leaks require careful handling',
      'Verify employment/access claims',
      'Chain of custody for sensitive documents',
    ],
  },
  osint: {
    category: 'osint',
    riskLevel: 'low',
    defaultProofTypes: ['timestamp_range', 'image_exif'],
    requiredProofStrength: 'weak',
    minProofCount: 1,
    specialConsiderations: [
      'Public source verification often sufficient',
      'Timestamping proves discovery time',
      'Image metadata for geolocation',
    ],
  },
  technology: {
    category: 'technology',
    riskLevel: 'medium',
    defaultProofTypes: ['timestamp_range', 'document_contains', 'credential_ownership'],
    requiredProofStrength: 'moderate',
    minProofCount: 1,
    specialConsiderations: [
      'Technical credential verification useful',
      'Code/document provenance important',
      'Timing for product announcements',
    ],
  },
  energy: {
    category: 'energy',
    riskLevel: 'medium',
    defaultProofTypes: ['timestamp_range', 'location_proximity', 'image_exif'],
    requiredProofStrength: 'moderate',
    minProofCount: 1,
    specialConsiderations: [
      'Facility location proofs valuable',
      'Satellite imagery for infrastructure',
      'Document authenticity for contracts/permits',
    ],
  },
  general: {
    category: 'general',
    riskLevel: 'low',
    defaultProofTypes: ['timestamp_range'],
    requiredProofStrength: 'weak',
    minProofCount: 1,
    specialConsiderations: [
      'Basic timestamp verification as minimum',
      'Adapt requirements based on content',
    ],
  },
};

// ============ AI INFERENCE PROMPT ============

const PROOF_INFERENCE_PROMPT = `You are an expert intelligence analyst AI that determines what ZK (zero-knowledge) proofs would verify an intel submission while protecting source anonymity.

AVAILABLE PROOF TYPES:
${PROOF_TEMPLATES.map(t => `
### ${t.id}
**Name:** ${t.name}
**Description:** ${t.description}
**Privacy Level:** ${t.privacyLevel}
**Verification Strength:** ${t.verificationStrength}
**Parameters:**
${Object.entries(t.paramSchema).map(([k, v]) => `  - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`).join('\n')}
**Best for:** ${t.applicableCategories.join(', ')}
`).join('\n')}

ANALYSIS GUIDELINES:

1. **Understand the claim**: What is being asserted? What would prove it?

2. **Consider source safety**: Never require proofs that could endanger sources. Location proofs should use proximity, not exact coordinates.

3. **Match proof strength to risk**:
   - Conflict zones / critical: Require strong cryptographic proofs
   - Market intelligence: Timing is critical
   - Corporate intel: Document and access verification
   - OSINT: Basic timestamp/source verification

4. **Layer proofs effectively**:
   - Primary proof: Most directly verifies the core claim
   - Supporting proofs: Add corroboration or context
   - Optional proofs: Nice to have, increase confidence

5. **Set realistic parameters**:
   - Location: 5-50km radius (larger for safety)
   - Time: Allow reasonable windows (hours to days based on context)
   - Multiple sources: 2-3 typical, 5+ for critical claims

6. **Consider what sources can actually provide**:
   - Photos with EXIF are common
   - Credentials may be available
   - Exact timestamps may not be
   - Multiple sources require network

OUTPUT JSON FORMAT:
{
  "analysis": {
    "claim_type": "what kind of intel is being requested",
    "key_assertions": ["list of claims that need verification"],
    "risk_level": "low|medium|high|critical",
    "source_safety_concerns": ["any concerns about source safety"]
  },
  "proof_requirements": [
    {
      "template": "template_id",
      "params": { ... template-specific parameters ... },
      "description": "Human-readable description",
      "rationale": "Why this proof verifies this claim",
      "required": true/false,
      "weight": 1-10
    }
  ],
  "verification_strategy": "Brief explanation of overall verification approach",
  "confidence_thresholds": {
    "minimum": "What makes this minimally verified",
    "high": "What would give high confidence"
  }
}`;

// ============ MAIN INFERENCE FUNCTION ============

export interface ProofRequirement {
  template: string;
  params: Record<string, unknown>;
  description: string;
  rationale?: string;
  required: boolean;
  weight: number;
}

export interface ProofInferenceResult {
  analysis: {
    claimType: string;
    keyAssertions: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    sourceSafetyConcerns: string[];
  };
  requirements: ProofRequirement[];
  verificationStrategy: string;
  confidenceThresholds: {
    minimum: string;
    high: string;
  };
}

export async function inferProofRequirements(
  bountyData: {
    title: string;
    description: string;
    category: string;
    regions?: string[];
    domains?: string[];
    intendedUse?: string;
  }
): Promise<ProofInferenceResult> {
  // Get category profile for context
  const categoryProfile = CATEGORY_PROFILES[bountyData.category] || CATEGORY_PROFILES.general;
  
  // Build context for AI
  const bountyContext = `
INTEL BOUNTY REQUEST:
- Title: ${bountyData.title}
- Description: ${bountyData.description}
- Category: ${bountyData.category}
- Risk Level (default): ${categoryProfile.riskLevel}
- Regions: ${bountyData.regions?.join(', ') || 'Not specified'}
- Domains: ${bountyData.domains?.join(', ') || 'Not specified'}
- Intended Use: ${bountyData.intendedUse || 'Not specified'}

CATEGORY GUIDANCE for "${bountyData.category}":
- Default proof types: ${categoryProfile.defaultProofTypes.join(', ')}
- Required strength: ${categoryProfile.requiredProofStrength}
- Minimum proofs: ${categoryProfile.minProofCount}
- Special considerations:
${categoryProfile.specialConsiderations.map(c => `  * ${c}`).join('\n')}

Analyze this bounty and determine optimal ZK proof requirements.
`.trim();

  try {
    const response = await callNearAI({
      systemPrompt: PROOF_INFERENCE_PROMPT,
      userPrompt: bountyContext,
      temperature: 0.2,
      maxTokens: 2000,
    });

    // Parse response
    const jsonMatch = response.content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize
    return {
      analysis: {
        claimType: parsed.analysis?.claim_type || 'unknown',
        keyAssertions: parsed.analysis?.key_assertions || [],
        riskLevel: parsed.analysis?.risk_level || categoryProfile.riskLevel,
        sourceSafetyConcerns: parsed.analysis?.source_safety_concerns || [],
      },
      requirements: (parsed.proof_requirements || []).map((r: any) => ({
        template: r.template,
        params: r.params || {},
        description: r.description || '',
        rationale: r.rationale,
        required: r.required ?? true,
        weight: r.weight || 5,
      })),
      verificationStrategy: parsed.verification_strategy || '',
      confidenceThresholds: {
        minimum: parsed.confidence_thresholds?.minimum || 'At least one required proof verified',
        high: parsed.confidence_thresholds?.high || 'All proofs verified with multi-source corroboration',
      },
    };

  } catch (error) {
    console.error('Proof inference error:', error);
    
    // Fallback to category defaults
    return {
      analysis: {
        claimType: bountyData.category,
        keyAssertions: [bountyData.title],
        riskLevel: categoryProfile.riskLevel,
        sourceSafetyConcerns: [],
      },
      requirements: categoryProfile.defaultProofTypes.map((templateId, i) => {
        const template = PROOF_TEMPLATES.find(t => t.id === templateId);
        return {
          template: templateId,
          params: getDefaultParams(templateId),
          description: template?.description || '',
          required: i === 0, // First one required, rest optional
          weight: 5,
        };
      }),
      verificationStrategy: 'Default verification based on category',
      confidenceThresholds: {
        minimum: 'Primary proof verified',
        high: 'All proofs verified',
      },
    };
  }
}

function getDefaultParams(templateId: string): Record<string, unknown> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  switch (templateId) {
    case 'timestamp_range':
      return {
        not_before: weekAgo.toISOString(),
        not_after: now.toISOString(),
      };
    case 'location_proximity':
      return {
        radius_km: 10,
      };
    case 'image_exif':
      return {
        min_timestamp: weekAgo.toISOString(),
        require_gps: false,
        min_width: 640,
        min_height: 480,
      };
    case 'multi_source_corroboration':
      return {
        min_sources: 2,
        max_time_delta_hours: 48,
      };
    case 'document_contains':
      return {
        required_keywords: [],
      };
    default:
      return {};
  }
}

// ============ VALIDATION ============

export function validateProofParams(
  templateId: string,
  params: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const template = PROOF_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return { valid: false, errors: [`Unknown template: ${templateId}`] };
  }

  const errors: string[] = [];
  
  for (const [key, schema] of Object.entries(template.paramSchema)) {
    const value = params[key];
    
    if (schema.required && (value === undefined || value === null)) {
      errors.push(`Missing required parameter: ${key}`);
      continue;
    }
    
    if (value !== undefined && value !== null) {
      // Type validation
      switch (schema.type) {
        case 'number':
          if (typeof value !== 'number') {
            errors.push(`${key} must be a number`);
          }
          break;
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${key} must be a string`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${key} must be a boolean`);
          }
          break;
        case 'datetime':
          if (typeof value !== 'string' || isNaN(Date.parse(value as string))) {
            errors.push(`${key} must be a valid ISO datetime`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${key} must be an array`);
          }
          break;
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export { PROOF_TEMPLATES, CATEGORY_PROFILES };

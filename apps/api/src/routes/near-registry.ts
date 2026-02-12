/**
 * NEAR Intel Registry API Routes
 * 
 * Endpoints for on-chain proof verification
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { 
  getIntelRegistryClient, 
  IntelRegistryClient,
  ProofType 
} from '../services/near/intel-registry';
import { db } from '../db';
import { zkProofSubmissions, humintSources } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const nearRegistry = new Hono();

// Proof types enum for validation
const proofTypes: ProofType[] = [
  'LocationProximity',
  'TimestampRange',
  'DocumentContains',
  'ImageMetadata',
  'MultiSourceCorroboration',
  'VerifiableCredential',
  'SatelliteImagery',
  'NetworkMembership',
  'FinancialThreshold',
  'GenericCommitment',
];

// ============ SCHEMAS ============

const registerProofSchema = z.object({
  // Can provide existing submission ID or raw proof data
  submissionId: z.string().uuid().optional(),
  // Or provide raw proof data
  proof: z.string().optional(),
  publicInputs: z.string().optional(),
  proofType: z.enum(proofTypes as [string, ...string[]]).optional(),
  intelContent: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const attestSchema = z.object({
  proofId: z.string(),
  confidence: z.number().int().min(1).max(100),
  note: z.string().max(200).optional(),
});

const verifySchema = z.object({
  proofId: z.string(),
  proof: z.string(),
  publicInputs: z.string(),
});

// ============ ROUTES ============

/**
 * Register a proof on-chain
 * 
 * Can either:
 * 1. Provide a submission ID (from existing zk_proof_submissions)
 * 2. Provide raw proof data directly
 */
nearRegistry.post(
  '/register',
  zValidator('json', registerProofSchema),
  async (c) => {
    const body = c.req.valid('json');
    const sourceId = c.get('sourceId') as string | undefined;
    
    if (!sourceId) {
      return c.json({ error: 'Authentication required (source login)' }, 401);
    }

    // Get source codename
    const source = await db.query.humintSources.findFirst({
      where: eq(humintSources.id, sourceId),
      columns: { codename: true },
    });

    if (!source) {
      return c.json({ error: 'Source not found' }, 404);
    }

    let proof: string;
    let publicInputs: string;
    let proofType: ProofType;
    let intelContent: string;
    let metadata = body.metadata;

    if (body.submissionId) {
      // Load from existing submission
      const submission = await db.query.zkProofSubmissions.findFirst({
        where: eq(zkProofSubmissions.id, body.submissionId),
      });

      if (!submission) {
        return c.json({ error: 'Submission not found' }, 404);
      }

      if (submission.sourceId !== sourceId) {
        return c.json({ error: 'Submission belongs to different source' }, 403);
      }

      proof = JSON.stringify(submission.proof);
      publicInputs = JSON.stringify(submission.publicInputs);
      proofType = mapProofType(submission.templateType);
      intelContent = submission.bountyId || submission.id;
      
      // Check if already registered
      if (submission.onChainTxHash) {
        return c.json({ 
          error: 'Proof already registered on-chain',
          txHash: submission.onChainTxHash,
        }, 400);
      }
    } else {
      // Use provided raw data
      if (!body.proof || !body.publicInputs || !body.proofType || !body.intelContent) {
        return c.json({ 
          error: 'Must provide either submissionId or (proof, publicInputs, proofType, intelContent)' 
        }, 400);
      }

      proof = body.proof;
      publicInputs = body.publicInputs;
      proofType = body.proofType as ProofType;
      intelContent = body.intelContent;
    }

    try {
      const client = getIntelRegistryClient();
      const proofId = randomUUID();

      const result = await client.registerProof({
        proofId,
        proof,
        publicInputs,
        sourceCodename: source.codename,
        intelContent,
        proofType,
        metadata,
      });

      // Update submission if we used one
      if (body.submissionId) {
        await db.update(zkProofSubmissions)
          .set({ 
            onChainTxHash: proofId, // Store proof_id (not tx hash, but identifier)
            status: 'verified',
            updatedAt: new Date(),
          })
          .where(eq(zkProofSubmissions.id, body.submissionId));
      }

      return c.json({
        success: true,
        proofId: result.proof_id,
        commitment: result.commitment,
        blockHeight: result.block_height,
        status: result.status,
        explorerUrl: `https://nearblocks.io/txns/${result.proof_id}`, // Approximate
      });
    } catch (error) {
      console.error('Failed to register proof on-chain:', error);
      return c.json({ 
        error: 'Failed to register proof on-chain',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * Get a proof by ID
 */
nearRegistry.get('/proof/:proofId', async (c) => {
  const proofId = c.req.param('proofId');
  
  try {
    const client = getIntelRegistryClient();
    const proof = await client.getProofWithAttestations(proofId);
    
    if (!proof) {
      return c.json({ error: 'Proof not found' }, 404);
    }

    return c.json(proof);
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch proof',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Get all proofs for intel content
 */
nearRegistry.post('/proofs/by-intel', async (c) => {
  const body = await c.req.json();
  const { intelContent } = body;

  if (!intelContent) {
    return c.json({ error: 'intelContent required' }, 400);
  }

  try {
    const client = getIntelRegistryClient();
    const proofs = await client.getIntelProofs(intelContent);
    return c.json({ proofs });
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch proofs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Add attestation to a proof
 */
nearRegistry.post(
  '/attest',
  zValidator('json', attestSchema),
  async (c) => {
    const body = c.req.valid('json');
    
    try {
      const client = getIntelRegistryClient();
      await client.attest(body.proofId, body.confidence, body.note);
      
      // Fetch updated proof
      const proof = await client.getProof(body.proofId);
      
      return c.json({
        success: true,
        proofId: body.proofId,
        newConfidence: proof?.avg_confidence,
        newStatus: proof?.status,
      });
    } catch (error) {
      return c.json({ 
        error: 'Failed to add attestation',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * Verify a commitment (check if data matches on-chain commitment)
 */
nearRegistry.post(
  '/verify',
  zValidator('json', verifySchema),
  async (c) => {
    const body = c.req.valid('json');
    const sourceId = c.get('sourceId') as string | undefined;

    if (!sourceId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const source = await db.query.humintSources.findFirst({
      where: eq(humintSources.id, sourceId),
      columns: { codename: true },
    });

    if (!source) {
      return c.json({ error: 'Source not found' }, 404);
    }

    try {
      const client = getIntelRegistryClient();
      const isValid = await client.verifyCommitment(
        body.proofId,
        body.proof,
        body.publicInputs,
        source.codename
      );

      return c.json({
        proofId: body.proofId,
        valid: isValid,
        message: isValid 
          ? 'Commitment verified - data matches on-chain record'
          : 'Commitment mismatch - data does not match on-chain record',
      });
    } catch (error) {
      return c.json({ 
        error: 'Verification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * Get source reputation from on-chain data
 */
nearRegistry.get('/reputation/:codename', async (c) => {
  const codename = c.req.param('codename');
  
  try {
    const client = getIntelRegistryClient();
    const [reputation, stats] = await Promise.all([
      client.getSourceReputation(codename),
      client.getSourceStats(codename),
    ]);

    return c.json({
      codename,
      reputation,
      stats,
      sourceHash: IntelRegistryClient.hashSourceCodename(codename),
    });
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch reputation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Get registry statistics
 */
nearRegistry.get('/stats', async (c) => {
  try {
    const client = getIntelRegistryClient();
    const stats = await client.getStats();
    const recentProofs = await client.getRecentProofs(5);

    return c.json({
      ...stats,
      recentProofs,
    });
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Get recent proofs
 */
nearRegistry.get('/recent', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  
  try {
    const client = getIntelRegistryClient();
    const proofs = await client.getRecentProofs(Math.min(limit, 50));
    return c.json({ proofs });
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch recent proofs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Compute hashes (utility endpoint for clients)
 */
nearRegistry.post('/hash', async (c) => {
  const body = await c.req.json();
  const { type, value } = body;

  if (!type || !value) {
    return c.json({ error: 'type and value required' }, 400);
  }

  let hash: string;
  switch (type) {
    case 'source':
      hash = IntelRegistryClient.hashSourceCodename(value);
      break;
    case 'intel':
      hash = IntelRegistryClient.hashIntel(value);
      break;
    case 'raw':
      hash = IntelRegistryClient.sha256(value);
      break;
    default:
      return c.json({ error: 'Invalid type. Use: source, intel, raw' }, 400);
  }

  return c.json({ type, hash });
});

// Helper function to map internal proof types to contract types
function mapProofType(templateType: string): ProofType {
  const mapping: Record<string, ProofType> = {
    'location_proximity': 'LocationProximity',
    'timestamp_range': 'TimestampRange',
    'document_contains': 'DocumentContains',
    'image_metadata': 'ImageMetadata',
    'multi_source_corroboration': 'MultiSourceCorroboration',
    'verifiable_credential': 'VerifiableCredential',
    'satellite_imagery_match': 'SatelliteImagery',
    'network_membership': 'NetworkMembership',
    'financial_threshold': 'FinancialThreshold',
  };
  return mapping[templateType] || 'GenericCommitment';
}

export default nearRegistry;

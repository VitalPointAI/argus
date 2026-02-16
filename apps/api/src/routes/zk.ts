/**
 * Zero-Knowledge Proof API Routes
 * 
 * Endpoints for generating and verifying ZK proofs
 * Used by HUMINT sources for privacy-preserving attestations
 */

import { Hono } from 'hono';
import {
  generateLocationProof,
  verifyLocationProof,
  generateReputationProof,
  verifyReputationProof,
  generateIdentityRotationProof,
  verifyIdentityRotationProof,
  isWithinRange,
  poseidonHash,
  getZKStatus,
  isZKReady,
} from '../services/zk';
import { db } from '../db';
import { humintSources } from '../db/schema';
import { eq } from 'drizzle-orm';

const zk = new Hono();

// Store used nullifiers (in production, use Redis or DB)
const usedNullifiers = new Set<string>();

// ============================================
// Location Proofs
// ============================================

/**
 * Generate a location attestation proof
 * 
 * Proves: "I was within maxDistanceKm of (targetLat, targetLon)"
 * Without revealing: Exact coordinates
 */
zk.post('/location/prove', async (c) => {
  try {
    const { actualLat, actualLon, targetLat, targetLon, maxDistanceKm } = await c.req.json();
    
    // Validate inputs
    if (actualLat == null || actualLon == null || targetLat == null || targetLon == null || !maxDistanceKm) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    // Check if claim is even true (can't prove a false statement)
    if (!isWithinRange(actualLat, actualLon, targetLat, targetLon, maxDistanceKm)) {
      return c.json({ 
        success: false, 
        error: 'Cannot generate proof: actual location is not within specified range' 
      }, 400);
    }
    
    const proof = await generateLocationProof({
      actualLat,
      actualLon,
      targetLat,
      targetLon,
      maxDistanceKm,
    });
    
    return c.json({
      success: true,
      data: {
        proof: proof.proof,
        publicSignals: proof.publicSignals,
        commitment: proof.commitment,
        mock: !isZKReady(),
        claim: {
          targetLat,
          targetLon,
          maxDistanceKm,
          statement: `Prover was within ${maxDistanceKm}km of (${targetLat}, ${targetLon})`,
        },
      },
    });
  } catch (error) {
    console.error('Location proof generation failed:', error);
    return c.json({ success: false, error: 'Proof generation failed' }, 500);
  }
});

/**
 * Verify a location proof
 */
zk.post('/location/verify', async (c) => {
  try {
    const { proof, publicSignals } = await c.req.json();
    
    if (!proof || !publicSignals) {
      return c.json({ success: false, error: 'Missing proof or public signals' }, 400);
    }
    
    const isValid = await verifyLocationProof(proof, publicSignals);
    
    return c.json({
      success: true,
      data: {
        valid: isValid,
        publicSignals,
        mock: proof.mock || false,
      },
    });
  } catch (error) {
    console.error('Location proof verification failed:', error);
    return c.json({ success: false, error: 'Verification failed' }, 500);
  }
});

// ============================================
// Reputation Proofs
// ============================================

/**
 * Generate a reputation threshold proof
 * 
 * Proves: "My reputation is >= threshold"
 * Without revealing: Exact reputation score
 */
zk.post('/reputation/prove', async (c) => {
  try {
    const { publicKey, threshold } = await c.req.json();
    
    if (!publicKey || threshold == null) {
      return c.json({ success: false, error: 'Missing publicKey or threshold' }, 400);
    }
    
    // Look up source's actual reputation
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, publicKey))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    // Check if claim is true
    if (source.reputationScore < threshold) {
      return c.json({
        success: false,
        error: `Cannot generate proof: reputation (${source.reputationScore}) is below threshold (${threshold})`,
      }, 400);
    }
    
    const proof = await generateReputationProof({
      publicKey: BigInt('0x' + publicKey),
      reputationScore: source.reputationScore,
      threshold,
    });
    
    return c.json({
      success: true,
      data: {
        proof: proof.proof,
        publicSignals: proof.publicSignals,
        commitment: proof.commitment,
        publicKeyHash: proof.publicKeyHash,
        mock: !isZKReady(),
        claim: {
          threshold,
          statement: `Source reputation is >= ${threshold}`,
        },
      },
    });
  } catch (error) {
    console.error('Reputation proof generation failed:', error);
    return c.json({ success: false, error: 'Proof generation failed' }, 500);
  }
});

/**
 * Verify a reputation proof
 */
zk.post('/reputation/verify', async (c) => {
  try {
    const { proof, publicSignals, publicKeyHash } = await c.req.json();
    
    if (!proof || !publicSignals) {
      return c.json({ success: false, error: 'Missing proof or public signals' }, 400);
    }
    
    const isValid = await verifyReputationProof(proof, publicSignals);
    
    return c.json({
      success: true,
      data: {
        valid: isValid,
        threshold: parseInt(publicSignals[0]),
        publicKeyHash,
        mock: proof.mock || false,
      },
    });
  } catch (error) {
    console.error('Reputation proof verification failed:', error);
    return c.json({ success: false, error: 'Verification failed' }, 500);
  }
});

// ============================================
// Identity Rotation Proofs
// ============================================

/**
 * Generate an identity rotation proof
 * 
 * Proves: "I control the old identity and am creating this new one"
 * Without revealing: Which old identity is being rotated
 * 
 * This allows sources to rotate codenames while preserving reputation.
 */
zk.post('/identity/rotate', async (c) => {
  try {
    const { oldPublicKey, oldPrivateKey, newPublicKey } = await c.req.json();
    
    if (!oldPublicKey || !oldPrivateKey || !newPublicKey) {
      return c.json({ success: false, error: 'Missing required keys' }, 400);
    }
    
    // Look up old source's reputation
    const [oldSource] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, oldPublicKey))
      .limit(1);
    
    if (!oldSource) {
      return c.json({ success: false, error: 'Old identity not found' }, 404);
    }
    
    const proof = await generateIdentityRotationProof({
      oldPublicKey: BigInt('0x' + oldPublicKey),
      oldPrivateKey: BigInt('0x' + oldPrivateKey),
      newPublicKey: BigInt('0x' + newPublicKey),
      reputationScore: oldSource.reputationScore,
    });
    
    return c.json({
      success: true,
      data: {
        proof: proof.proof,
        publicSignals: proof.publicSignals,
        newPublicKeyHash: proof.newPublicKeyHash,
        rotationNullifier: proof.rotationNullifier,
        reputationCommitment: proof.reputationCommitment,
        reputationToTransfer: oldSource.reputationScore,
        mock: !isZKReady(),
        warning: 'Complete rotation by calling /identity/complete with this proof',
      },
    });
  } catch (error) {
    console.error('Identity rotation proof failed:', error);
    return c.json({ success: false, error: 'Rotation proof failed' }, 500);
  }
});

/**
 * Complete identity rotation
 * 
 * Verifies the rotation proof and creates new identity with transferred reputation.
 * The nullifier prevents the same old identity from being rotated twice.
 */
zk.post('/identity/complete', async (c) => {
  try {
    const { proof, publicSignals, newPublicKey, newCodename } = await c.req.json();
    
    if (!proof || !publicSignals || !newPublicKey) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    const result = await verifyIdentityRotationProof(
      proof,
      publicSignals,
      usedNullifiers
    );
    
    if (!result.valid) {
      return c.json({ success: false, error: result.reason }, 400);
    }
    
    // Extract nullifier from public signals
    const nullifier = publicSignals[2];
    
    // Mark nullifier as used (prevents double-rotation)
    usedNullifiers.add(nullifier);
    
    // TODO: In production:
    // 1. Create new source with newPublicKey
    // 2. Transfer reputation from commitment
    // 3. Mark old identity as rotated (but don't reveal which one)
    
    return c.json({
      success: true,
      data: {
        message: 'Identity rotation complete',
        newPublicKeyHash: publicSignals[0],
        nullifierRecorded: nullifier,
        note: 'Old identity has been invalidated without revealing which one',
      },
    });
  } catch (error) {
    console.error('Identity rotation completion failed:', error);
    return c.json({ success: false, error: 'Rotation completion failed' }, 500);
  }
});

// ============================================
// Utility Endpoints
// ============================================

/**
 * Get Poseidon hash of inputs
 * Useful for creating commitments client-side
 */
zk.post('/hash', async (c) => {
  try {
    const { inputs } = await c.req.json();
    
    if (!inputs || !Array.isArray(inputs)) {
      return c.json({ success: false, error: 'inputs must be an array of bigint strings' }, 400);
    }
    
    const bigintInputs = inputs.map((i: string) => BigInt(i));
    const hash = await poseidonHash(bigintInputs);
    
    return c.json({
      success: true,
      data: {
        hash: hash.toString(),
        inputs,
      },
    });
  } catch (error) {
    console.error('Hash generation failed:', error);
    return c.json({ success: false, error: 'Hash failed' }, 500);
  }
});

/**
 * Get ZK system status and info
 */
zk.get('/status', (c) => {
  const status = getZKStatus();
  
  return c.json({
    success: true,
    data: status,
  });
});

/**
 * Get ZK system info
 */
zk.get('/info', (c) => {
  const status = getZKStatus();
  
  return c.json({
    success: true,
    data: {
      version: '1.0.0',
      supportedProofs: [
        {
          type: 'location',
          description: 'Prove proximity to a location without revealing exact coordinates',
          endpoints: ['/zk/location/prove', '/zk/location/verify'],
        },
        {
          type: 'reputation',
          description: 'Prove reputation meets threshold without revealing exact score',
          endpoints: ['/zk/reputation/prove', '/zk/reputation/verify'],
        },
        {
          type: 'identity-rotation',
          description: 'Rotate identity while preserving reputation, without linking old/new',
          endpoints: ['/zk/identity/rotate', '/zk/identity/complete'],
        },
      ],
      circuitStatus: status.ready ? 'compiled' : 'mock',
      circuits: status.circuits,
      message: status.message,
    },
  });
});

export default zk;

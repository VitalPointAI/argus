/**
 * Zero-Knowledge Proof Service
 * 
 * Provides ZK proofs for HUMINT source privacy:
 * - Location attestation (prove proximity without exact coords)
 * - Reputation threshold (prove score >= X without revealing exact)
 * - Identity rotation (prove continuity without linking identities)
 */

import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Poseidon hasher
let poseidon: any;
let F: any; // Finite field

async function initPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  }
  return { poseidon, F };
}

/**
 * Hash inputs using Poseidon (ZK-friendly hash)
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await initPoseidon();
  const hash = poseidon(inputs);
  return F.toObject(hash);
}

// ============================================
// Location Proof
// ============================================

export interface LocationProofInput {
  actualLat: number;      // Actual latitude (degrees)
  actualLon: number;      // Actual longitude (degrees)
  targetLat: number;      // Target latitude (degrees)
  targetLon: number;      // Target longitude (degrees)
  maxDistanceKm: number;  // Maximum distance (km)
}

export interface LocationProof {
  proof: any;
  publicSignals: string[];
  commitment: string;
}

/**
 * Convert coordinates to microcoordinates (scaled by 1e6)
 */
function toMicroCoords(degrees: number): bigint {
  return BigInt(Math.round(degrees * 1e6));
}

/**
 * Convert km to squared micro-distance
 * 1 degree ≈ 111km at equator, so 1 micro-degree ≈ 0.000111km
 * For simplicity, we use a rough conversion factor
 */
function kmToSquaredMicroDistance(km: number): bigint {
  const microDegreesPerKm = 1e6 / 111; // ~9009 micro-degrees per km
  const microDistance = km * microDegreesPerKm;
  return BigInt(Math.round(microDistance * microDistance));
}

/**
 * Generate a location attestation proof
 */
export async function generateLocationProof(
  input: LocationProofInput
): Promise<LocationProof> {
  const { poseidon, F } = await initPoseidon();
  
  // Convert to micro-coordinates
  const actualLat = toMicroCoords(input.actualLat);
  const actualLon = toMicroCoords(input.actualLon);
  const targetLat = toMicroCoords(input.targetLat);
  const targetLon = toMicroCoords(input.targetLon);
  const maxDistanceSquared = kmToSquaredMicroDistance(input.maxDistanceKm);
  
  // Generate random salt
  const salt = BigInt('0x' + [...Array(32)].map(() => 
    Math.floor(Math.random() * 16).toString(16)).join(''));
  
  // Create commitment
  const commitment = F.toObject(poseidon([actualLat, actualLon, salt]));
  
  // Circuit inputs
  const circuitInputs = {
    targetLat: targetLat.toString(),
    targetLon: targetLon.toString(),
    maxDistanceSquared: maxDistanceSquared.toString(),
    commitmentHash: commitment.toString(),
    actualLat: actualLat.toString(),
    actualLon: actualLon.toString(),
    salt: salt.toString(),
  };
  
  // In production, load compiled circuit files
  // For now, return a mock proof structure
  const mockProof = {
    protocol: 'groth16',
    curve: 'bn128',
    pi_a: ['0x...', '0x...', '1'],
    pi_b: [['0x...', '0x...'], ['0x...', '0x...'], ['1', '0']],
    pi_c: ['0x...', '0x...', '1'],
  };
  
  return {
    proof: mockProof,
    publicSignals: [
      targetLat.toString(),
      targetLon.toString(),
      maxDistanceSquared.toString(),
      commitment.toString(),
    ],
    commitment: commitment.toString(),
  };
}

/**
 * Verify a location proof
 */
export async function verifyLocationProof(
  proof: any,
  publicSignals: string[],
  verificationKey: any
): Promise<boolean> {
  try {
    // In production, use actual snarkjs verification
    // return await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    
    // For now, return true (mock)
    return true;
  } catch (error) {
    console.error('Location proof verification failed:', error);
    return false;
  }
}

// ============================================
// Reputation Threshold Proof
// ============================================

export interface ReputationProofInput {
  publicKey: bigint;
  reputationScore: number;
  threshold: number;
}

export interface ReputationProof {
  proof: any;
  publicSignals: string[];
  commitment: string;
  publicKeyHash: string;
}

/**
 * Generate a reputation threshold proof
 */
export async function generateReputationProof(
  input: ReputationProofInput
): Promise<ReputationProof> {
  const { poseidon, F } = await initPoseidon();
  
  const salt = BigInt('0x' + [...Array(32)].map(() => 
    Math.floor(Math.random() * 16).toString(16)).join(''));
  
  // Create commitments
  const sourceCommitment = F.toObject(poseidon([
    input.publicKey, 
    BigInt(input.reputationScore),
    salt
  ]));
  
  const publicKeyHash = F.toObject(poseidon([input.publicKey]));
  
  const circuitInputs = {
    threshold: input.threshold.toString(),
    sourceCommitment: sourceCommitment.toString(),
    publicKeyHash: publicKeyHash.toString(),
    reputationScore: input.reputationScore.toString(),
    publicKey: input.publicKey.toString(),
    salt: salt.toString(),
  };
  
  // Mock proof (production would use compiled circuit)
  const mockProof = {
    protocol: 'groth16',
    curve: 'bn128',
    pi_a: ['0x...', '0x...', '1'],
    pi_b: [['0x...', '0x...'], ['0x...', '0x...'], ['1', '0']],
    pi_c: ['0x...', '0x...', '1'],
  };
  
  return {
    proof: mockProof,
    publicSignals: [
      input.threshold.toString(),
      sourceCommitment.toString(),
      publicKeyHash.toString(),
    ],
    commitment: sourceCommitment.toString(),
    publicKeyHash: publicKeyHash.toString(),
  };
}

/**
 * Verify a reputation proof
 */
export async function verifyReputationProof(
  proof: any,
  publicSignals: string[],
  verificationKey: any
): Promise<boolean> {
  try {
    return true; // Mock - use snarkjs.groth16.verify in production
  } catch (error) {
    console.error('Reputation proof verification failed:', error);
    return false;
  }
}

// ============================================
// Identity Rotation Proof
// ============================================

export interface IdentityRotationInput {
  oldPublicKey: bigint;
  oldPrivateKey: bigint;
  newPublicKey: bigint;
  reputationScore: number;
}

export interface IdentityRotationProof {
  proof: any;
  publicSignals: string[];
  newPublicKeyHash: string;
  rotationNullifier: string;
  reputationCommitment: string;
}

/**
 * Generate an identity rotation proof
 */
export async function generateIdentityRotationProof(
  input: IdentityRotationInput
): Promise<IdentityRotationProof> {
  const { poseidon, F } = await initPoseidon();
  
  const rotationSalt = BigInt('0x' + [...Array(32)].map(() => 
    Math.floor(Math.random() * 16).toString(16)).join(''));
  
  // New public key hash
  const newPublicKeyHash = F.toObject(poseidon([input.newPublicKey]));
  
  // Reputation commitment (links old identity to reputation)
  const reputationCommitment = F.toObject(poseidon([
    input.oldPublicKey,
    BigInt(input.reputationScore)
  ]));
  
  // Rotation nullifier (prevents reuse)
  const rotationNullifier = F.toObject(poseidon([
    input.oldPublicKey,
    rotationSalt
  ]));
  
  // Mock proof
  const mockProof = {
    protocol: 'groth16',
    curve: 'bn128',
    pi_a: ['0x...', '0x...', '1'],
    pi_b: [['0x...', '0x...'], ['0x...', '0x...'], ['1', '0']],
    pi_c: ['0x...', '0x...', '1'],
  };
  
  return {
    proof: mockProof,
    publicSignals: [
      newPublicKeyHash.toString(),
      reputationCommitment.toString(),
      rotationNullifier.toString(),
    ],
    newPublicKeyHash: newPublicKeyHash.toString(),
    rotationNullifier: rotationNullifier.toString(),
    reputationCommitment: reputationCommitment.toString(),
  };
}

/**
 * Verify an identity rotation proof and check nullifier hasn't been used
 */
export async function verifyIdentityRotationProof(
  proof: any,
  publicSignals: string[],
  verificationKey: any,
  usedNullifiers: Set<string>
): Promise<{ valid: boolean; reason?: string }> {
  const nullifier = publicSignals[2];
  
  // Check nullifier hasn't been used (prevents double-rotation)
  if (usedNullifiers.has(nullifier)) {
    return { valid: false, reason: 'Nullifier already used - identity already rotated' };
  }
  
  try {
    // Verify the proof (mock for now)
    const proofValid = true; // await snarkjs.groth16.verify(...)
    
    if (proofValid) {
      return { valid: true };
    } else {
      return { valid: false, reason: 'Invalid proof' };
    }
  } catch (error) {
    return { valid: false, reason: String(error) };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Check if actual location is within range of target
 * (Non-ZK version for testing)
 */
export function isWithinRange(
  actualLat: number, actualLon: number,
  targetLat: number, targetLon: number,
  maxDistanceKm: number
): boolean {
  const distance = haversineDistance(actualLat, actualLon, targetLat, targetLon);
  return distance <= maxDistanceKm;
}

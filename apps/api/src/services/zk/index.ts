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

// Build directory containing compiled circuits
const BUILD_DIR = path.join(__dirname, 'build');

// Check if circuits are compiled
const CIRCUITS_COMPILED = fs.existsSync(path.join(BUILD_DIR, 'reputation_final.zkey'));

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
 * Load verification key for a circuit
 */
function loadVerificationKey(circuit: string): any {
  const vkPath = path.join(BUILD_DIR, `${circuit}_verification_key.json`);
  if (!fs.existsSync(vkPath)) {
    throw new Error(`Verification key not found for ${circuit}. Run build-circuits.sh first.`);
  }
  return JSON.parse(fs.readFileSync(vkPath, 'utf-8'));
}

/**
 * Hash inputs using Poseidon (ZK-friendly hash)
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await initPoseidon();
  const hash = poseidon(inputs);
  return F.toObject(hash);
}

/**
 * Check if ZK circuits are compiled and ready
 */
export function isZKReady(): boolean {
  return CIRCUITS_COMPILED;
}

/**
 * Get ZK system status
 */
export function getZKStatus(): { ready: boolean; circuits: string[]; message: string } {
  const circuits = ['reputation', 'location', 'identity-rotation'];
  const compiled = circuits.filter(c => 
    fs.existsSync(path.join(BUILD_DIR, `${c}_final.zkey`))
  );
  
  return {
    ready: compiled.length === circuits.length,
    circuits: compiled,
    message: compiled.length === circuits.length 
      ? 'All ZK circuits compiled and ready'
      : `${compiled.length}/${circuits.length} circuits compiled. Run build-circuits.sh to compile all.`
  };
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
  
  if (!CIRCUITS_COMPILED) {
    // Return mock proof if circuits not compiled
    console.warn('ZK circuits not compiled - returning mock proof');
    return {
      proof: { protocol: 'groth16', curve: 'bn128', mock: true },
      publicSignals: [
        targetLat.toString(),
        targetLon.toString(),
        maxDistanceSquared.toString(),
        commitment.toString(),
      ],
      commitment: commitment.toString(),
    };
  }
  
  // Generate real proof
  const wasmPath = path.join(BUILD_DIR, 'location_js', 'location.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'location_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
    commitment: commitment.toString(),
  };
}

/**
 * Verify a location proof
 */
export async function verifyLocationProof(
  proof: any,
  publicSignals: string[]
): Promise<boolean> {
  if (proof.mock) {
    console.warn('Verifying mock proof - always returns true');
    return true;
  }
  
  try {
    const vk = loadVerificationKey('location');
    return await snarkjs.groth16.verify(vk, publicSignals, proof);
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
  
  if (!CIRCUITS_COMPILED) {
    console.warn('ZK circuits not compiled - returning mock proof');
    return {
      proof: { protocol: 'groth16', curve: 'bn128', mock: true },
      publicSignals: [
        input.threshold.toString(),
        sourceCommitment.toString(),
        publicKeyHash.toString(),
      ],
      commitment: sourceCommitment.toString(),
      publicKeyHash: publicKeyHash.toString(),
    };
  }
  
  // Generate real proof
  const wasmPath = path.join(BUILD_DIR, 'reputation_js', 'reputation.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'reputation_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
    commitment: sourceCommitment.toString(),
    publicKeyHash: publicKeyHash.toString(),
  };
}

/**
 * Verify a reputation proof
 */
export async function verifyReputationProof(
  proof: any,
  publicSignals: string[]
): Promise<boolean> {
  if (proof.mock) {
    console.warn('Verifying mock proof - always returns true');
    return true;
  }
  
  try {
    const vk = loadVerificationKey('reputation');
    return await snarkjs.groth16.verify(vk, publicSignals, proof);
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
  
  const circuitInputs = {
    newPublicKeyHash: newPublicKeyHash.toString(),
    reputationCommitment: reputationCommitment.toString(),
    rotationNullifier: rotationNullifier.toString(),
    oldPublicKey: input.oldPublicKey.toString(),
    oldPrivateKey: input.oldPrivateKey.toString(),
    newPublicKey: input.newPublicKey.toString(),
    reputationScore: input.reputationScore.toString(),
    rotationSalt: rotationSalt.toString(),
  };
  
  if (!CIRCUITS_COMPILED) {
    console.warn('ZK circuits not compiled - returning mock proof');
    return {
      proof: { protocol: 'groth16', curve: 'bn128', mock: true },
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
  
  // Generate real proof
  const wasmPath = path.join(BUILD_DIR, 'identity-rotation_js', 'identity-rotation.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'identity-rotation_final.zkey');
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );
  
  return {
    proof,
    publicSignals,
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
  usedNullifiers: Set<string>
): Promise<{ valid: boolean; reason?: string }> {
  const nullifier = publicSignals[2];
  
  // Check nullifier hasn't been used (prevents double-rotation)
  if (usedNullifiers.has(nullifier)) {
    return { valid: false, reason: 'Nullifier already used - identity already rotated' };
  }
  
  if (proof.mock) {
    console.warn('Verifying mock proof - always returns true');
    return { valid: true };
  }
  
  try {
    const vk = loadVerificationKey('identity-rotation');
    const proofValid = await snarkjs.groth16.verify(vk, publicSignals, proof);
    
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

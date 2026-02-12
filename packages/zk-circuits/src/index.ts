/**
 * ZK Circuits for Argus Intel Verification
 * 
 * Provides proof generation and verification for:
 * - Location proximity proofs
 * - Timestamp range proofs
 * - Document keyword proofs
 */

import * as snarkjs from 'snarkjs';
import path from 'path';
import fs from 'fs';

// Types
export interface LocationProofInput {
  actualLat: number; // Actual latitude (microdegrees)
  actualLng: number; // Actual longitude (microdegrees)
  targetLat: number; // Target latitude (microdegrees)
  targetLng: number; // Target longitude (microdegrees)
  radiusMeters: number; // Radius in meters
}

export interface TimestampProofInput {
  timestamp: number; // Unix timestamp in seconds
  notBefore: number; // Start of range (Unix seconds)
  notAfter: number; // End of range (Unix seconds)
}

export interface DocumentProofInput {
  documentPreimage: [bigint, bigint, bigint, bigint]; // Poseidon hash preimage
  keywordFlags: number[]; // Array of 0/1 for each keyword
  documentHash: bigint; // Hash of document
  keywordHashes: bigint[]; // Hashes of required keywords
  requiredCount: number; // How many keywords needed
}

export interface Proof {
  proof: snarkjs.Groth16Proof;
  publicSignals: string[];
}

export interface VerificationResult {
  valid: boolean;
  publicSignals?: Record<string, any>;
}

// Paths to circuit artifacts
const KEYS_DIR = path.join(__dirname, '../keys');
const BUILD_DIR = path.join(__dirname, '../build');

// ============================================
// Location Proximity Proof
// ============================================

export async function generateLocationProof(input: LocationProofInput): Promise<Proof> {
  const wasmPath = path.join(BUILD_DIR, 'location_proximity/location_proximity_js/location_proximity.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'location_proximity/location_proximity.zkey');

  // Convert coordinates to microdegrees (integer math)
  const circuitInput = {
    actualLat: Math.round(input.actualLat * 1e6),
    actualLng: Math.round(input.actualLng * 1e6),
    targetLat: Math.round(input.targetLat * 1e6),
    targetLng: Math.round(input.targetLng * 1e6),
    radiusMeters: input.radiusMeters,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath
  );

  return { proof, publicSignals };
}

export async function verifyLocationProof(proof: Proof): Promise<VerificationResult> {
  const vkeyPath = path.join(KEYS_DIR, 'location_proximity/location_proximity_vkey.json');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));

  const valid = await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);

  return {
    valid,
    publicSignals: {
      targetLat: Number(proof.publicSignals[0]) / 1e6,
      targetLng: Number(proof.publicSignals[1]) / 1e6,
      radiusMeters: Number(proof.publicSignals[2]),
      withinRadius: proof.publicSignals[3] === '1',
      distanceSquared: Number(proof.publicSignals[4]),
    },
  };
}

// ============================================
// Timestamp Range Proof
// ============================================

export async function generateTimestampProof(input: TimestampProofInput): Promise<Proof> {
  const wasmPath = path.join(BUILD_DIR, 'timestamp_range/timestamp_range_js/timestamp_range.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'timestamp_range/timestamp_range.zkey');

  const circuitInput = {
    timestamp: input.timestamp,
    notBefore: input.notBefore,
    notAfter: input.notAfter,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath
  );

  return { proof, publicSignals };
}

export async function verifyTimestampProof(proof: Proof): Promise<VerificationResult> {
  const vkeyPath = path.join(KEYS_DIR, 'timestamp_range/timestamp_range_vkey.json');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));

  const valid = await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);

  return {
    valid,
    publicSignals: {
      notBefore: new Date(Number(proof.publicSignals[0]) * 1000).toISOString(),
      notAfter: new Date(Number(proof.publicSignals[1]) * 1000).toISOString(),
      withinRange: proof.publicSignals[2] === '1',
    },
  };
}

// ============================================
// Document Keywords Proof
// ============================================

export async function generateDocumentProof(input: DocumentProofInput): Promise<Proof> {
  const wasmPath = path.join(BUILD_DIR, 'document_keywords/document_keywords_js/document_keywords.wasm');
  const zkeyPath = path.join(KEYS_DIR, 'document_keywords/document_keywords.zkey');

  // Pad keyword arrays to expected size (10)
  const keywordFlags = [...input.keywordFlags];
  const keywordHashes = [...input.keywordHashes];
  while (keywordFlags.length < 10) keywordFlags.push(0);
  while (keywordHashes.length < 10) keywordHashes.push(0n);

  const circuitInput = {
    documentPreimage: input.documentPreimage.map(x => x.toString()),
    keywordFlags,
    documentHash: input.documentHash.toString(),
    keywordHashes: keywordHashes.map(x => x.toString()),
    requiredCount: input.requiredCount,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath
  );

  return { proof, publicSignals };
}

export async function verifyDocumentProof(proof: Proof): Promise<VerificationResult> {
  const vkeyPath = path.join(KEYS_DIR, 'document_keywords/document_keywords_vkey.json');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));

  const valid = await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);

  return {
    valid,
    publicSignals: {
      documentHash: proof.publicSignals[0],
      keywordsFound: proof.publicSignals[11] === '1', // After 10 keyword hashes
      foundCount: Number(proof.publicSignals[12]),
    },
  };
}

// ============================================
// Browser-compatible proof generation
// ============================================

/**
 * Generate proof in browser using WASM
 * Requires WASM and zkey files to be served at known URLs
 */
export async function generateProofBrowser(
  circuitName: string,
  input: Record<string, any>,
  wasmUrl: string,
  zkeyUrl: string
): Promise<Proof> {
  // Fetch WASM
  const wasmResponse = await fetch(wasmUrl);
  const wasmBuffer = await wasmResponse.arrayBuffer();

  // Fetch zkey
  const zkeyResponse = await fetch(zkeyUrl);
  const zkeyBuffer = await zkeyResponse.arrayBuffer();

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    new Uint8Array(wasmBuffer),
    new Uint8Array(zkeyBuffer)
  );

  return { proof, publicSignals };
}

/**
 * Verify proof in browser (no file system access needed)
 */
export async function verifyProofBrowser(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
  vkey: snarkjs.VerificationKey
): Promise<boolean> {
  return await snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// ============================================
// Utility functions
// ============================================

/**
 * Convert decimal degrees to microdegrees (integer)
 */
export function degreesToMicrodegrees(degrees: number): number {
  return Math.round(degrees * 1e6);
}

/**
 * Convert microdegrees back to decimal degrees
 */
export function microdegreesToDegrees(microdegrees: number): number {
  return microdegrees / 1e6;
}

/**
 * Convert Date to Unix seconds
 */
export function dateToUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Hash a string using Poseidon (for document hashing)
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash);
}

/**
 * Convert proof to Solidity calldata (for on-chain verification)
 */
export async function proofToSolidityCalldata(proof: Proof): Promise<string> {
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof.proof,
    proof.publicSignals
  );
  return calldata;
}

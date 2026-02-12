/**
 * Browser-side ZK Proof Generation
 * 
 * Uses snarkjs in the browser to generate Groth16 proofs
 * WASM and zkey files must be served from the server
 */

import * as snarkjs from 'snarkjs';

// Base URL for circuit artifacts
const CIRCUITS_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

// Circuit artifact URLs
const CIRCUIT_URLS = {
  location_proximity: {
    wasm: `${CIRCUITS_BASE_URL}/circuits/location_proximity.wasm`,
    zkey: `${CIRCUITS_BASE_URL}/circuits/location_proximity.zkey`,
    vkey: `${CIRCUITS_BASE_URL}/circuits/location_proximity_vkey.json`,
  },
  timestamp_range: {
    wasm: `${CIRCUITS_BASE_URL}/circuits/timestamp_range.wasm`,
    zkey: `${CIRCUITS_BASE_URL}/circuits/timestamp_range.zkey`,
    vkey: `${CIRCUITS_BASE_URL}/circuits/timestamp_range_vkey.json`,
  },
  document_keywords: {
    wasm: `${CIRCUITS_BASE_URL}/circuits/document_keywords.wasm`,
    zkey: `${CIRCUITS_BASE_URL}/circuits/document_keywords.zkey`,
    vkey: `${CIRCUITS_BASE_URL}/circuits/document_keywords_vkey.json`,
  },
};

// Types
export interface ZKProof {
  proof: any; // Groth16 proof
  publicSignals: string[];
}

export interface LocationProofParams {
  actualLat: number; // Decimal degrees
  actualLng: number; // Decimal degrees  
  targetLat: number;
  targetLng: number;
  radiusMeters: number;
}

export interface TimestampProofParams {
  timestamp: Date;
  notBefore: Date;
  notAfter: Date;
}

export interface DocumentProofParams {
  documentText: string;
  requiredKeywords: string[];
}

// Cache for loaded artifacts
const artifactCache: Record<string, { wasm?: ArrayBuffer; zkey?: ArrayBuffer; vkey?: any }> = {};

/**
 * Load circuit artifacts (WASM, zkey, vkey)
 */
async function loadCircuitArtifacts(circuitName: keyof typeof CIRCUIT_URLS): Promise<{
  wasm: ArrayBuffer;
  zkey: ArrayBuffer;
  vkey: any;
}> {
  if (!artifactCache[circuitName]) {
    artifactCache[circuitName] = {};
  }

  const cache = artifactCache[circuitName];
  const urls = CIRCUIT_URLS[circuitName];

  // Load in parallel
  const [wasmResponse, zkeyResponse, vkeyResponse] = await Promise.all([
    cache.wasm ? Promise.resolve({ arrayBuffer: () => cache.wasm }) : fetch(urls.wasm),
    cache.zkey ? Promise.resolve({ arrayBuffer: () => cache.zkey }) : fetch(urls.zkey),
    cache.vkey ? Promise.resolve({ json: () => cache.vkey }) : fetch(urls.vkey),
  ]);

  if (!cache.wasm) {
    cache.wasm = await (wasmResponse as Response).arrayBuffer();
  }
  if (!cache.zkey) {
    cache.zkey = await (zkeyResponse as Response).arrayBuffer();
  }
  if (!cache.vkey) {
    cache.vkey = await (vkeyResponse as Response).json();
  }

  return {
    wasm: cache.wasm!,
    zkey: cache.zkey!,
    vkey: cache.vkey!,
  };
}

// ============================================
// Location Proximity Proof
// ============================================

/**
 * Generate a ZK proof that you were within a certain radius of a target location
 * WITHOUT revealing your exact coordinates
 */
export async function generateLocationProof(params: LocationProofParams): Promise<{
  proof: ZKProof;
  publicInputs: {
    targetLat: number;
    targetLng: number;
    radiusMeters: number;
    withinRadius: boolean;
  };
}> {
  console.log('🔐 Generating location proximity proof...');

  try {
    const { wasm, zkey } = await loadCircuitArtifacts('location_proximity');

    // Convert to microdegrees (integer math in circuit)
    const input = {
      actualLat: Math.round(params.actualLat * 1e6),
      actualLng: Math.round(params.actualLng * 1e6),
      targetLat: Math.round(params.targetLat * 1e6),
      targetLng: Math.round(params.targetLng * 1e6),
      radiusMeters: params.radiusMeters,
    };

    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasm),
      new Uint8Array(zkey)
    );

    const withinRadius = publicSignals[3] === '1';

    return {
      proof: { proof, publicSignals },
      publicInputs: {
        targetLat: params.targetLat,
        targetLng: params.targetLng,
        radiusMeters: params.radiusMeters,
        withinRadius,
      },
    };
  } catch (error) {
    console.error('Location proof generation failed:', error);
    throw error;
  }
}

/**
 * Verify a location proximity proof
 */
export async function verifyLocationProof(proof: ZKProof): Promise<boolean> {
  const { vkey } = await loadCircuitArtifacts('location_proximity');
  return await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);
}

// ============================================
// Timestamp Range Proof
// ============================================

/**
 * Generate a ZK proof that content was created within a time range
 * WITHOUT revealing the exact timestamp
 */
export async function generateTimestampProof(params: TimestampProofParams): Promise<{
  proof: ZKProof;
  publicInputs: {
    notBefore: string;
    notAfter: string;
    withinRange: boolean;
  };
}> {
  console.log('🔐 Generating timestamp range proof...');

  try {
    const { wasm, zkey } = await loadCircuitArtifacts('timestamp_range');

    // Convert to Unix seconds
    const input = {
      timestamp: Math.floor(params.timestamp.getTime() / 1000),
      notBefore: Math.floor(params.notBefore.getTime() / 1000),
      notAfter: Math.floor(params.notAfter.getTime() / 1000),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasm),
      new Uint8Array(zkey)
    );

    const withinRange = publicSignals[2] === '1';

    return {
      proof: { proof, publicSignals },
      publicInputs: {
        notBefore: params.notBefore.toISOString(),
        notAfter: params.notAfter.toISOString(),
        withinRange,
      },
    };
  } catch (error) {
    console.error('Timestamp proof generation failed:', error);
    throw error;
  }
}

/**
 * Verify a timestamp range proof
 */
export async function verifyTimestampProof(proof: ZKProof): Promise<boolean> {
  const { vkey } = await loadCircuitArtifacts('timestamp_range');
  return await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);
}

// ============================================
// Document Keywords Proof  
// ============================================

/**
 * Generate a ZK proof that a document contains certain keywords
 * WITHOUT revealing the document content
 */
export async function generateDocumentProof(params: DocumentProofParams): Promise<{
  proof: ZKProof;
  publicInputs: {
    keywordsFound: boolean;
    foundCount: number;
    requiredCount: number;
  };
}> {
  console.log('🔐 Generating document keywords proof...');

  try {
    const { wasm, zkey } = await loadCircuitArtifacts('document_keywords');

    // Check which keywords are present
    const lowerText = params.documentText.toLowerCase();
    const keywordFlags = params.requiredKeywords.map(kw => 
      lowerText.includes(kw.toLowerCase()) ? 1 : 0
    );

    // Pad to 10 keywords (circuit expects fixed size)
    while (keywordFlags.length < 10) keywordFlags.push(0);

    // Create document hash (simplified - in production use Poseidon)
    const docHash = await hashString(params.documentText);
    const keywordHashes = await Promise.all(
      params.requiredKeywords.map(kw => hashString(kw))
    );
    while (keywordHashes.length < 10) keywordHashes.push(BigInt(0));

    // Create preimage (simplified)
    const preimage: [bigint, bigint, bigint, bigint] = [
      docHash, 
      BigInt(params.documentText.length), 
      BigInt(0), 
      BigInt(0)
    ];

    const input = {
      documentPreimage: preimage.map(x => x.toString()),
      keywordFlags,
      documentHash: docHash.toString(),
      keywordHashes: keywordHashes.map(x => x.toString()),
      requiredCount: params.requiredKeywords.length,
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasm),
      new Uint8Array(zkey)
    );

    const foundCount = keywordFlags.filter(f => f === 1).length;
    const keywordsFound = foundCount >= params.requiredKeywords.length;

    return {
      proof: { proof, publicSignals },
      publicInputs: {
        keywordsFound,
        foundCount,
        requiredCount: params.requiredKeywords.length,
      },
    };
  } catch (error) {
    console.error('Document proof generation failed:', error);
    throw error;
  }
}

/**
 * Verify a document keywords proof
 */
export async function verifyDocumentProof(proof: ZKProof): Promise<boolean> {
  const { vkey } = await loadCircuitArtifacts('document_keywords');
  return await snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Simple string hashing (for demo - use Poseidon in production)
 */
async function hashString(str: string): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert to bigint (truncate to fit field)
  let hash = BigInt(0);
  for (let i = 0; i < 31; i++) { // 31 bytes to stay within field
    hash = (hash << BigInt(8)) + BigInt(hashArray[i]);
  }
  return hash;
}

/**
 * Calculate Haversine distance between two coordinates
 */
export function haversineDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if circuits are available (for graceful degradation)
 */
export async function checkCircuitsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(CIRCUIT_URLS.location_proximity.vkey, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

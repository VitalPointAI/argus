/**
 * IPFS Storage via Pinata
 * 
 * Handles encrypted user data storage on IPFS
 */

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface StoredData {
  cid: string;
  size: number;
  timestamp: string;
}

/**
 * Pin JSON data to IPFS via Pinata
 */
export async function pinJSON(
  data: object,
  name: string,
  metadata?: Record<string, string>
): Promise<StoredData> {
  if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_SECRET_KEY)) {
    throw new Error('Pinata credentials not configured');
  }

  const body = {
    pinataContent: data,
    pinataMetadata: {
      name,
      keyvalues: metadata || {},
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (PINATA_JWT) {
    headers['Authorization'] = `Bearer ${PINATA_JWT}`;
  } else {
    headers['pinata_api_key'] = PINATA_API_KEY!;
    headers['pinata_secret_api_key'] = PINATA_SECRET_KEY!;
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const result: PinataResponse = await res.json();

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    timestamp: result.Timestamp,
  };
}

/**
 * Pin raw bytes/file to IPFS via Pinata
 */
export async function pinFile(
  data: Buffer | Uint8Array,
  name: string,
  metadata?: Record<string, string>
): Promise<StoredData> {
  if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_SECRET_KEY)) {
    throw new Error('Pinata credentials not configured');
  }

  const formData = new FormData();
  formData.append('file', new Blob([data]), name);
  formData.append('pinataMetadata', JSON.stringify({
    name,
    keyvalues: metadata || {},
  }));
  formData.append('pinataOptions', JSON.stringify({
    cidVersion: 1,
  }));

  const headers: Record<string, string> = {};

  if (PINATA_JWT) {
    headers['Authorization'] = `Bearer ${PINATA_JWT}`;
  } else {
    headers['pinata_api_key'] = PINATA_API_KEY!;
    headers['pinata_secret_api_key'] = PINATA_SECRET_KEY!;
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const result: PinataResponse = await res.json();

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    timestamp: result.Timestamp,
  };
}

/**
 * Fetch data from IPFS via Pinata gateway
 */
export async function fetchFromIPFS<T = unknown>(cid: string): Promise<T> {
  const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
  
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Failed to fetch from IPFS: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch raw bytes from IPFS
 */
export async function fetchBytesFromIPFS(cid: string): Promise<Uint8Array> {
  const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
  
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Failed to fetch from IPFS: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Unpin data from Pinata (delete)
 */
export async function unpin(cid: string): Promise<boolean> {
  if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_SECRET_KEY)) {
    throw new Error('Pinata credentials not configured');
  }

  const headers: Record<string, string> = {};

  if (PINATA_JWT) {
    headers['Authorization'] = `Bearer ${PINATA_JWT}`;
  } else {
    headers['pinata_api_key'] = PINATA_API_KEY!;
    headers['pinata_secret_api_key'] = PINATA_SECRET_KEY!;
  }

  const res = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    method: 'DELETE',
    headers,
  });

  return res.ok;
}

/**
 * List user's pinned items
 */
export async function listPins(filters?: {
  status?: 'pinned' | 'unpinned' | 'all';
  metadata?: Record<string, string>;
}): Promise<{ cid: string; name: string; size: number; date: string }[]> {
  if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_SECRET_KEY)) {
    throw new Error('Pinata credentials not configured');
  }

  const headers: Record<string, string> = {};

  if (PINATA_JWT) {
    headers['Authorization'] = `Bearer ${PINATA_JWT}`;
  } else {
    headers['pinata_api_key'] = PINATA_API_KEY!;
    headers['pinata_secret_api_key'] = PINATA_SECRET_KEY!;
  }

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.metadata) {
    params.set('metadata', JSON.stringify({ keyvalues: filters.metadata }));
  }

  const res = await fetch(`https://api.pinata.cloud/data/pinList?${params}`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to list pins: ${res.status}`);
  }

  const data = await res.json();
  
  return data.rows.map((row: any) => ({
    cid: row.ipfs_pin_hash,
    name: row.metadata?.name || 'Unnamed',
    size: row.size,
    date: row.date_pinned,
  }));
}

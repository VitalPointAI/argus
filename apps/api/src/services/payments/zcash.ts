/**
 * Zcash Shielded Payment Service
 * 
 * For maximum privacy HUMINT payouts using z-addresses.
 * Shielded transactions hide sender, receiver, AND amount.
 * 
 * This is separate from 1Click because shielded ZEC requires
 * direct wallet integration - can't use transparent bridges.
 */

// Zcash node configuration
const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL;
const ZCASH_RPC_USER = process.env.ZCASH_RPC_USER;
const ZCASH_RPC_PASS = process.env.ZCASH_RPC_PASS;

/**
 * Validate a Zcash address
 * - t-addresses: transparent (like Bitcoin, NOT private)
 * - z-addresses: shielded (fully private) - START WITH 'zs' for Sapling
 */
export function validateZcashAddress(address: string): {
  valid: boolean;
  type: 'transparent' | 'shielded' | 'invalid';
  warning?: string;
} {
  // Transparent addresses (t1... or t3...)
  if (/^t[13][a-zA-HJ-NP-Z0-9]{33}$/.test(address)) {
    return {
      valid: true,
      type: 'transparent',
      warning: '⚠️ TRANSPARENT ADDRESS - Not private! Visible on blockchain like Bitcoin. Use a z-address for privacy.',
    };
  }
  
  // Sapling shielded addresses (zs1...) - typically 78 chars total
  if (/^zs1[a-z0-9]{75,80}$/.test(address)) {
    return {
      valid: true,
      type: 'shielded',
    };
  }
  
  // Legacy Sprout addresses (zc...) - deprecated but still valid
  if (/^zc[a-zA-HJ-NP-Z0-9]{93}$/.test(address)) {
    return {
      valid: true,
      type: 'shielded',
      warning: 'Legacy Sprout address. Consider upgrading to Sapling (zs1...) for better performance.',
    };
  }
  
  // Unified addresses (u1...) - newest format
  if (/^u1[a-z0-9]{100,}$/.test(address)) {
    return {
      valid: true,
      type: 'shielded', // Unified addresses are shielded by default
    };
  }
  
  return { valid: false, type: 'invalid' };
}

/**
 * Check if ZEC payments are configured
 */
export function isZcashConfigured(): boolean {
  return !!(ZCASH_RPC_URL && ZCASH_RPC_USER && ZCASH_RPC_PASS);
}

/**
 * Get wallet balance (requires configured node)
 */
export async function getWalletBalance(): Promise<{
  transparent: number;
  shielded: number;
  total: number;
}> {
  if (!isZcashConfigured()) {
    throw new Error('Zcash node not configured');
  }
  
  const response = await rpcCall('z_gettotalbalance');
  
  return {
    transparent: parseFloat(response.transparent),
    shielded: parseFloat(response.private),
    total: parseFloat(response.total),
  };
}

/**
 * Send shielded ZEC payment
 * Uses z_sendmany for shielded transactions
 */
export async function sendShieldedPayment(params: {
  toAddress: string;
  amountZec: number;
  memo?: string;
  fromAddress?: string;
}): Promise<{
  operationId: string;
  status: 'queued' | 'executing' | 'success' | 'failed';
}> {
  if (!isZcashConfigured()) {
    throw new Error('Zcash node not configured');
  }
  
  const { toAddress, amountZec, memo, fromAddress } = params;
  
  // Validate recipient address
  const validation = validateZcashAddress(toAddress);
  if (!validation.valid) {
    throw new Error('Invalid Zcash address');
  }
  
  if (validation.type === 'transparent') {
    throw new Error('Cannot send to transparent address - use shielded (z-address) for privacy');
  }
  
  // Build the send request
  const amounts = [{
    address: toAddress,
    amount: amountZec,
    memo: memo ? Buffer.from(memo).toString('hex') : undefined,
  }];
  
  // Use z_sendmany for shielded sends
  // First arg: from address (use our shielded pool)
  const from = fromAddress || 'ANY_SAPLING'; // Let wallet pick from shielded pool
  
  const operationId = await rpcCall('z_sendmany', [from, amounts, 1, 0.0001]);
  
  return {
    operationId,
    status: 'queued',
  };
}

/**
 * Check operation status
 */
export async function getOperationStatus(operationId: string): Promise<{
  id: string;
  status: 'queued' | 'executing' | 'success' | 'failed' | 'cancelled';
  result?: { txid: string };
  error?: { code: number; message: string };
}> {
  if (!isZcashConfigured()) {
    throw new Error('Zcash node not configured');
  }
  
  const results = await rpcCall('z_getoperationstatus', [[operationId]]);
  
  if (!results || results.length === 0) {
    throw new Error('Operation not found');
  }
  
  return results[0];
}

/**
 * Internal RPC call helper
 */
async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const response = await fetch(ZCASH_RPC_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${ZCASH_RPC_USER}:${ZCASH_RPC_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: Date.now(),
      method,
      params,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Zcash RPC error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Zcash RPC error: ${data.error.message}`);
  }
  
  return data.result;
}

/**
 * Privacy levels for payment methods
 */
export const PAYMENT_PRIVACY_LEVELS = {
  'zec-shielded': {
    level: 5,
    name: 'Maximum',
    description: 'Fully private. Sender, receiver, and amount are all hidden.',
    risks: [],
  },
  'xmr': {
    level: 4,
    name: 'Very High', 
    description: 'Strong privacy by default. Some exchanges delisting due to regulations.',
    risks: ['Exchange availability'],
  },
  'zec-transparent': {
    level: 2,
    name: 'Low',
    description: 'Visible on blockchain like Bitcoin. NOT recommended for HUMINT.',
    risks: ['Chain analysis', 'Address clustering', 'Exchange tracking'],
  },
  'btc': {
    level: 2,
    name: 'Low',
    description: 'Pseudonymous only. Sophisticated chain analysis can trace.',
    risks: ['Chain analysis', 'Address clustering', 'Exchange tracking'],
  },
  'eth': {
    level: 1,
    name: 'Very Low',
    description: 'Account-based model. Easier to track than UTXO chains.',
    risks: ['Chain analysis', 'ENS linking', 'DeFi interaction tracking'],
  },
  'sol': {
    level: 1,
    name: 'Very Low',
    description: 'Fast but transparent. All transactions visible.',
    risks: ['Full transparency', 'Chain analysis'],
  },
};

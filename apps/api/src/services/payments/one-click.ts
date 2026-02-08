/**
 * NEAR Intents 1Click Payment Service
 * 
 * Handles cross-chain payments to HUMINT sources using NEAR Intents.
 * Users can receive payments on ANY chain (ETH, SOL, BTC, etc.) via chain abstraction.
 * 
 * Flow:
 * 1. Get quote from 1Click API with destination chain/address
 * 2. Receive unique deposit address
 * 3. Deposit USDC (or other origin asset) to deposit address
 * 4. 1Click handles cross-chain swap automatically
 * 5. Recipient receives funds on their preferred chain
 * 
 * @see https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 */

const ONE_CLICK_BASE_URL = process.env.ONE_CLICK_API_URL || 'https://1click.chaindefuser.com';
const ONE_CLICK_JWT = process.env.ONE_CLICK_JWT;

// USDC token IDs by chain (NEAR Intents format)
export const USDC_TOKEN_IDS: Record<string, string> = {
  near: 'nep141:usdc.near',
  eth: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
  arb: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
  sol: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
  base: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  bnb: 'nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omft.near',
};

// Native token IDs (for non-USDC payments)
export const NATIVE_TOKEN_IDS: Record<string, string> = {
  btc: 'nep141:btc.omft.near',
  eth: 'nep141:eth.omft.near',
  sol: 'nep141:sol.omft.near',
  near: 'near:mainnet',
  doge: 'nep141:doge.omft.near',
  zec: 'nep141:zec.omft.near', // Zcash - NOTE: 1Click uses transparent addresses
  xrp: 'nep141:xrp.omft.near',
  ltc: 'nep141:ltc.omft.near',
  ada: 'nep141:cardano.omft.near',
  trx: 'nep141:tron.omft.near',
};

export interface QuoteRequest {
  dry?: boolean;
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT';
  slippageTolerance: number; // basis points (100 = 1%)
  originAsset: string;
  depositType: 'ORIGIN_CHAIN' | 'INTENTS';
  destinationAsset: string;
  amount: string; // smallest unit
  refundTo: string;
  refundType: 'ORIGIN_CHAIN' | 'INTENTS';
  recipient: string;
  recipientType: 'DESTINATION_CHAIN' | 'INTENTS';
  deadline: string; // ISO timestamp
}

export interface QuoteResponse {
  quoteId?: string;
  amountIn: string;
  amountOut: string;
  amountOutUsd?: string; // display only
  depositAddress?: string;
  depositMemo?: string;
  timeWhenInactive?: string;
  deadline?: string;
  estimatedTimeMs?: number;
}

export interface PaymentStatus {
  depositAddress: string;
  status: 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED';
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
}

/**
 * Get a cross-chain payment quote from 1Click
 */
export async function getPaymentQuote(params: {
  amountUsdc: number;
  recipientAddress: string;
  recipientChain: string;
  recipientTokenId?: string; // if not USDC, specify token
  refundAddress: string;
  dry?: boolean;
}): Promise<QuoteResponse> {
  const { amountUsdc, recipientAddress, recipientChain, recipientTokenId, refundAddress, dry = false } = params;

  if (!ONE_CLICK_JWT) {
    throw new Error('ONE_CLICK_JWT not configured');
  }

  // Origin: USDC on NEAR (our treasury)
  const originAsset = USDC_TOKEN_IDS.near;
  
  // Destination: USDC on recipient's chain (or specified token)
  const destinationAsset = recipientTokenId || USDC_TOKEN_IDS[recipientChain] || NATIVE_TOKEN_IDS[recipientChain];
  
  if (!destinationAsset) {
    throw new Error(`Unsupported chain: ${recipientChain}`);
  }

  // Amount in USDC smallest units (6 decimals)
  const amountSmallest = Math.floor(amountUsdc * 1_000_000).toString();

  // Deadline: 1 hour from now
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const quoteRequest: QuoteRequest = {
    dry,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: amountSmallest,
    refundTo: refundAddress,
    refundType: 'ORIGIN_CHAIN',
    recipient: recipientAddress,
    recipientType: 'DESTINATION_CHAIN',
    deadline,
  };

  const response = await fetch(`${ONE_CLICK_BASE_URL}/v0/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_CLICK_JWT}`,
    },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Click quote failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Submit deposit notification to 1Click (optional, speeds up processing)
 */
export async function submitDeposit(params: {
  txHash: string;
  depositAddress: string;
  memo?: string;
}): Promise<{ success: boolean }> {
  if (!ONE_CLICK_JWT) {
    throw new Error('ONE_CLICK_JWT not configured');
  }

  const response = await fetch(`${ONE_CLICK_BASE_URL}/v0/deposit/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONE_CLICK_JWT}`,
    },
    body: JSON.stringify({
      txHash: params.txHash,
      depositAddress: params.depositAddress,
      memo: params.memo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Click deposit submit failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get payment status from 1Click
 */
export async function getPaymentStatus(depositAddress: string, memo?: string): Promise<PaymentStatus> {
  if (!ONE_CLICK_JWT) {
    throw new Error('ONE_CLICK_JWT not configured');
  }

  const params = new URLSearchParams({ depositAddress });
  if (memo) params.append('depositMemo', memo);

  const response = await fetch(`${ONE_CLICK_BASE_URL}/v0/status?${params}`, {
    headers: {
      'Authorization': `Bearer ${ONE_CLICK_JWT}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Click status failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get list of supported tokens
 */
export async function getSupportedTokens(): Promise<Array<{
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  chain: string;
}>> {
  const response = await fetch(`${ONE_CLICK_BASE_URL}/v0/tokens`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Click tokens failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Supported chains for HUMINT payments
 */
export const SUPPORTED_CHAINS = [
  { id: 'near', name: 'NEAR', native: 'NEAR' },
  { id: 'zec', name: 'Zcash', native: 'ZEC', privacyNote: 'Use t-address for 1Click; z-address for maximum privacy requires direct ZEC wallet' },
  { id: 'eth', name: 'Ethereum', native: 'ETH' },
  { id: 'arb', name: 'Arbitrum', native: 'ETH' },
  { id: 'sol', name: 'Solana', native: 'SOL' },
  { id: 'base', name: 'Base', native: 'ETH' },
  { id: 'btc', name: 'Bitcoin', native: 'BTC' },
  { id: 'bnb', name: 'BNB Chain', native: 'BNB' },
  { id: 'doge', name: 'Dogecoin', native: 'DOGE' },
  { id: 'xrp', name: 'XRP Ledger', native: 'XRP' },
  { id: 'ltc', name: 'Litecoin', native: 'LTC' },
  { id: 'ada', name: 'Cardano', native: 'ADA' },
  { id: 'trx', name: 'Tron', native: 'TRX' },
];

/**
 * Validate an address for a specific chain
 */
export function validateAddress(address: string, chain: string): boolean {
  switch (chain) {
    case 'near':
      // NEAR accounts: lowercase, 2-64 chars, alphanumeric + . - _
      return /^[a-z0-9._-]{2,64}$/.test(address);
    case 'eth':
    case 'arb':
    case 'base':
    case 'bnb':
      // EVM: 0x + 40 hex chars
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'sol':
      // Solana: base58, 32-44 chars
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    case 'btc':
      // Bitcoin: various formats (legacy, segwit, taproot)
      return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
    case 'doge':
      // Dogecoin: D prefix
      return /^D[a-zA-HJ-NP-Z0-9]{33}$/.test(address);
    case 'zec':
      // Zcash: t-addresses (transparent) for 1Click, z-addresses (shielded) need special handling
      // t1/t3 = transparent, zs1 = shielded Sapling
      return /^t[13][a-zA-HJ-NP-Z0-9]{33}$/.test(address) || 
             /^zs1[a-z0-9]{75,80}$/.test(address);
    case 'xrp':
      // XRP: starts with r, 25-35 chars
      return /^r[a-zA-HJ-NP-Z0-9]{24,34}$/.test(address);
    case 'ltc':
      // Litecoin: L/M/3 prefix or ltc1 (segwit)
      return /^(L|M|3|ltc1)[a-zA-HJ-NP-Z0-9]{26,62}$/.test(address);
    case 'ada':
      // Cardano: addr1 prefix (Shelley era)
      return /^addr1[a-z0-9]{50,}$/.test(address);
    case 'trx':
      // Tron: T prefix, 34 chars
      return /^T[a-zA-HJ-NP-Z0-9]{33}$/.test(address);
    default:
      return false;
  }
}

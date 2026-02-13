/**
 * Source List NFT Access Pass Service
 * 
 * Mints NFT access passes on the source-lists.argus-intel.near contract.
 * NFT ownership grants access to encrypted source list content.
 */

import * as nearAPI from 'near-api-js';

const { connect, keyStores, KeyPair } = nearAPI;

const CONTRACT_ID = 'source-lists.argus-intel.near';
const NETWORK_ID = 'mainnet';
const RPC_URL = 'https://rpc.mainnet.fastnear.com';

// Contract owner key for minting (stored securely)
const OWNER_PRIVATE_KEY = process.env.NFT_CONTRACT_OWNER_KEY;

interface MintParams {
  listId: string;
  subscriberAccount: string;
  packageId: string;
  metadata?: {
    title?: string;
    description?: string;
    media?: string;
  };
}

interface AccessPassToken {
  token_id: string;
  owner_id: string;
  metadata: {
    title: string;
    description: string;
    media?: string;
    issued_at: string;
    extra?: string;
  };
}

let nearConnection: nearAPI.Near | null = null;
let contractAccount: nearAPI.Account | null = null;

/**
 * Initialize NEAR connection
 */
async function initNear(): Promise<nearAPI.Account> {
  if (contractAccount) return contractAccount;

  if (!OWNER_PRIVATE_KEY) {
    throw new Error('NFT_CONTRACT_OWNER_KEY not configured');
  }

  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(OWNER_PRIVATE_KEY);
  await keyStore.setKey(NETWORK_ID, CONTRACT_ID, keyPair);

  const config = {
    networkId: NETWORK_ID,
    keyStore,
    nodeUrl: RPC_URL,
    headers: {},
  };

  nearConnection = await connect(config);
  contractAccount = await nearConnection.account(CONTRACT_ID);
  
  return contractAccount;
}

/**
 * Mint an access pass NFT for a subscriber
 */
export async function mintAccessPass(params: MintParams): Promise<string> {
  const { listId, subscriberAccount, packageId, metadata } = params;
  
  const account = await initNear();

  // Token ID format: list:{listId}:{subscriberAccount}
  const tokenId = `list:${listId}:${subscriberAccount}`;

  // Default metadata
  const tokenMetadata = {
    title: metadata?.title || `Access Pass - List ${listId.slice(0, 8)}`,
    description: metadata?.description || `Access pass granting entry to source list ${listId}`,
    media: metadata?.media || null,
    issued_at: new Date().toISOString(),
    extra: JSON.stringify({ listId, packageId }),
  };

  try {
    // Call mint_access_pass on contract
    const result = await account.functionCall({
      contractId: CONTRACT_ID,
      methodName: 'mint_access_pass',
      args: {
        token_id: tokenId,
        receiver_id: subscriberAccount,
        token_metadata: tokenMetadata,
        list_id: listId,
      },
      gas: BigInt('100000000000000'), // 100 TGas
      attachedDeposit: BigInt('10000000000000000000000'), // 0.01 NEAR for storage
    });

    console.log(`Minted access pass: ${tokenId}`, result);
    return tokenId;
  } catch (error: any) {
    // Check if token already exists (user re-subscribing)
    if (error.message?.includes('already exists')) {
      console.log(`Access pass ${tokenId} already exists, skipping mint`);
      return tokenId;
    }
    throw error;
  }
}

/**
 * Check if an account has an access pass for a list
 */
export async function hasAccessPass(listId: string, accountId: string): Promise<boolean> {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: CONTRACT_ID,
          method_name: 'has_access',
          args_base64: Buffer.from(JSON.stringify({ list_id: listId, account_id: accountId })).toString('base64'),
        },
      }),
    });

    const data = await response.json();
    if (data.result?.result) {
      const result = JSON.parse(Buffer.from(data.result.result).toString());
      return result === true;
    }
    return false;
  } catch (error) {
    console.error('Access check error:', error);
    return false;
  }
}

/**
 * Get all access passes for an account
 */
export async function getAccessPasses(accountId: string): Promise<AccessPassToken[]> {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: CONTRACT_ID,
          method_name: 'nft_tokens_for_owner',
          args_base64: Buffer.from(JSON.stringify({ 
            account_id: accountId,
            from_index: '0',
            limit: 100,
          })).toString('base64'),
        },
      }),
    });

    const data = await response.json();
    if (data.result?.result) {
      return JSON.parse(Buffer.from(data.result.result).toString());
    }
    return [];
  } catch (error) {
    console.error('Get access passes error:', error);
    return [];
  }
}

/**
 * Get access pass details by token ID
 */
export async function getAccessPass(tokenId: string): Promise<AccessPassToken | null> {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: CONTRACT_ID,
          method_name: 'nft_token',
          args_base64: Buffer.from(JSON.stringify({ token_id: tokenId })).toString('base64'),
        },
      }),
    });

    const data = await response.json();
    if (data.result?.result) {
      const result = JSON.parse(Buffer.from(data.result.result).toString());
      return result || null;
    }
    return null;
  } catch (error) {
    console.error('Get access pass error:', error);
    return null;
  }
}

/**
 * Revoke access pass (transfer back to contract/burn)
 */
export async function revokeAccessPass(tokenId: string): Promise<boolean> {
  const account = await initNear();

  try {
    await account.functionCall({
      contractId: CONTRACT_ID,
      methodName: 'revoke_access_pass',
      args: { token_id: tokenId },
      gas: BigInt('50000000000000'), // 50 TGas
    });
    return true;
  } catch (error) {
    console.error('Revoke access pass error:', error);
    return false;
  }
}

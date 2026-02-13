/**
 * Access Pass Verification Service
 * 
 * On-chain verification of Access Pass ownership.
 * Uses NEAR RPC to query the source-lists contract directly.
 * No database trust - pure blockchain verification.
 */

const NFT_CONTRACT = process.env.NFT_CONTRACT_ID || 'source-lists.argus-intel.near';
const NEAR_RPC = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const NEAR_NETWORK = process.env.NEAR_NETWORK || 'mainnet';

interface AccessPassInfo {
  hasAccess: boolean;
  tokenId?: string;
  expiresAt?: string;
  listCid?: string;
}

interface TokenMetadata {
  title?: string;
  expires_at?: string;
  extra?: string;
}

interface SourceListMetadata {
  cid: string;
  source_count: number;
  domain: string;
  creator: string;
  is_active: boolean;
}

/**
 * Call a view method on the NFT contract
 */
async function callViewMethod<T>(method: string, args: Record<string, any>): Promise<T | null> {
  try {
    const response = await fetch(NEAR_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'access-check',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: NFT_CONTRACT,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        },
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error(`NEAR RPC error for ${method}:`, data.error);
      return null;
    }

    if (data.result?.result) {
      const resultBytes = new Uint8Array(data.result.result);
      const resultStr = new TextDecoder().decode(resultBytes);
      return JSON.parse(resultStr);
    }

    return null;
  } catch (error) {
    console.error(`Access Pass verification error (${method}):`, error);
    return null;
  }
}

/**
 * Check if an account has access to a specific source list
 * Uses on-chain verification via the contract's has_access method
 */
export async function verifyAccessPass(
  accountId: string,
  listId: string
): Promise<AccessPassInfo> {
  // Token ID format: list:{listId}:{subscriberAccount}
  const tokenId = `list:${listId}:${accountId}`;
  
  // Method 1: Direct has_access check on contract
  const hasAccess = await callViewMethod<boolean>('has_access', {
    account_id: accountId,
    token_id: tokenId,
  });

  if (hasAccess) {
    // Get token metadata for expiry info
    const token = await callViewMethod<{
      token_id: string;
      owner_id: string;
      metadata?: TokenMetadata;
    }>('nft_token', { token_id: tokenId });

    // Get list metadata for CID
    const listMeta = await callViewMethod<SourceListMetadata>('get_list_metadata', {
      token_id: tokenId,
    });

    return {
      hasAccess: true,
      tokenId,
      expiresAt: token?.metadata?.expires_at,
      listCid: listMeta?.cid,
    };
  }

  // Method 2: Check if user owns any token for this list
  // (handles case where token ID format is different)
  const ownedTokens = await callViewMethod<string[]>('get_lists_for_owner', {
    account_id: accountId,
  });

  if (ownedTokens && ownedTokens.length > 0) {
    // Check if any owned token matches this list
    const matchingToken = ownedTokens.find(tid => tid.includes(listId));
    if (matchingToken) {
      const listMeta = await callViewMethod<SourceListMetadata>('get_list_metadata', {
        token_id: matchingToken,
      });

      return {
        hasAccess: true,
        tokenId: matchingToken,
        listCid: listMeta?.cid,
      };
    }
  }

  return { hasAccess: false };
}

/**
 * Get all Access Passes owned by an account
 */
export async function getOwnedAccessPasses(accountId: string): Promise<string[]> {
  const tokens = await callViewMethod<string[]>('get_lists_for_owner', {
    account_id: accountId,
  });
  return tokens || [];
}

/**
 * Check access and return decryption key if authorized
 * This is the main entry point for content gating
 */
export async function getAccessWithKey(
  accountId: string,
  listId: string
): Promise<{ authorized: boolean; decryptionKey?: string; cid?: string }> {
  const accessInfo = await verifyAccessPass(accountId, listId);

  if (!accessInfo.hasAccess) {
    return { authorized: false };
  }

  // Check expiration
  if (accessInfo.expiresAt) {
    const expiryTime = new Date(accessInfo.expiresAt).getTime();
    if (expiryTime < Date.now()) {
      return { authorized: false };
    }
  }

  // TODO: Retrieve decryption key from secure storage
  // For now, return the CID and let the client handle decryption
  // In production, this would:
  // 1. Verify on-chain ownership
  // 2. Retrieve encrypted decryption key from secure storage
  // 3. Return key only if ownership verified
  
  return {
    authorized: true,
    cid: accessInfo.listCid,
    // decryptionKey would come from HSM/KMS in production
  };
}

/**
 * Mint Access Pass for a subscriber
 * Called after successful payment
 */
export async function mintAccessPass(
  subscriberAccount: string,
  listId: string,
  packageId: string,
  durationDays: number | null
): Promise<{ success: boolean; tokenId?: string; error?: string }> {
  // This would be called from the payment callback
  // Need the contract owner key to mint
  
  const tokenId = `list:${listId}:${subscriberAccount}`;
  
  // Calculate expiration
  const expiresAt = durationDays 
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  // TODO: Implement actual minting via near-api-js
  // This requires the contract owner's private key
  // Should be done via a secure backend service
  
  console.log(`[AccessPass] Mint request:`, {
    tokenId,
    subscriberAccount,
    listId,
    packageId,
    expiresAt,
  });

  return {
    success: true,
    tokenId,
  };
}

export default {
  verifyAccessPass,
  getOwnedAccessPasses,
  getAccessWithKey,
  mintAccessPass,
};

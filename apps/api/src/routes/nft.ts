/**
 * NFT Routes - Source List NFT Marketplace
 * 
 * Integrates with NEAR contracts for:
 * - Minting source lists as NFTs
 * - Listing NFTs for sale
 * - Purchasing NFTs
 * - Viewing owned NFTs
 */

import { Hono } from 'hono';
import { db } from '../db';
import { sourceLists, sourceListItems, sources } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

// NEAR utils - basic implementation without near-api-js dependency
const parseNearAmount = (amount: string): string => {
  // Convert NEAR to yoctoNEAR (1 NEAR = 10^24 yoctoNEAR)
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return '0';
  return BigInt(Math.floor(parsed * 1e24)).toString();
};

// NEAR configuration
const NEAR_NETWORK = process.env.NEAR_NETWORK || 'testnet';
const NFT_CONTRACT = process.env.NFT_CONTRACT_ID || 'argus-nft.testnet';
const DATA_REGISTRY_CONTRACT = process.env.DATA_REGISTRY_CONTRACT_ID || 'argus-data.testnet';

interface NftMintRequest {
  listId: string;
  price?: string; // In NEAR
  royaltyPercent?: number;
}

interface NftListingInfo {
  tokenId: string;
  name: string;
  description: string;
  sourceCount: number;
  domain: string;
  creator: string;
  owner: string;
  price?: string;
  royaltyPercent: number;
  cid: string;
  isActive: boolean;
}

const nft = new Hono();

// Get current user from auth middleware
function getUser(c: any): { id: string; email: string } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string; email: string } : null;
}

// ============================================
// NFT Marketplace API
// ============================================

/**
 * Get all NFTs listed for sale
 */
nft.get('/marketplace', async (c) => {
  try {
    // In production, this would query the NEAR contract
    // For now, return mock data structure
    const listings: NftListingInfo[] = [];
    
    // TODO: Query NFT contract for all tokens with prices
    // const nearConnection = await getNearConnection();
    // const contract = new nearAPI.Contract(nearConnection.account, NFT_CONTRACT, {...});
    
    return c.json({
      success: true,
      data: listings,
      meta: {
        total: listings.length,
        network: NEAR_NETWORK,
        contract: NFT_CONTRACT,
      }
    });
  } catch (error) {
    console.error('Marketplace error:', error);
    return c.json({ success: false, error: 'Failed to fetch marketplace' }, 500);
  }
});

/**
 * Get NFTs owned by a NEAR account
 */
nft.get('/owned/:accountId', async (c) => {
  try {
    const { accountId } = c.req.param();
    
    // TODO: Query NFT contract for tokens owned by this account
    const ownedNfts: NftListingInfo[] = [];
    
    return c.json({
      success: true,
      data: ownedNfts,
      meta: {
        owner: accountId,
        network: NEAR_NETWORK,
      }
    });
  } catch (error) {
    console.error('Owned NFTs error:', error);
    return c.json({ success: false, error: 'Failed to fetch owned NFTs' }, 500);
  }
});

/**
 * Get details of a specific NFT
 */
nft.get('/token/:tokenId', async (c) => {
  try {
    const { tokenId } = c.req.param();
    
    // TODO: Query NFT contract for token details
    // const tokenInfo = await contract.nft_token({ token_id: tokenId });
    // const listMetadata = await contract.get_list_metadata({ token_id: tokenId });
    
    return c.json({
      success: false,
      error: 'NFT contract not configured',
      tokenId,
      network: NEAR_NETWORK,
    }, 501);
  } catch (error) {
    console.error('Token detail error:', error);
    return c.json({ success: false, error: 'Failed to fetch token' }, 500);
  }
});

/**
 * Prepare mint transaction (returns unsigned transaction for frontend to sign)
 */
nft.post('/prepare-mint', async (c) => {
  const user = getUser(c);
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { listId, price, royaltyPercent = 10 } = body as NftMintRequest;
    
    if (!listId) {
      return c.json({ success: false, error: 'listId is required' }, 400);
    }
    
    // Get the source list from our database
    const [list] = await db.select()
      .from(sourceLists)
      .where(eq(sourceLists.id, listId))
      .limit(1);
    
    if (!list) {
      return c.json({ success: false, error: 'Source list not found' }, 404);
    }
    
    // Get source count
    const items = await db.select()
      .from(sourceListItems)
      .where(eq(sourceListItems.listId, listId));
    
    // Get the sources to build the list data
    const sourceIds = items.map(i => i.sourceId);
    const listSources = sourceIds.length > 0 
      ? await db.select().from(sources).where(inArray(sources.id, sourceIds))
      : [];
    
    // Build the NFT metadata
    const nftData = {
      name: list.name,
      description: list.description || `A curated list of ${items.length} intelligence sources`,
      sourceCount: items.length,
      domain: 'intelligence', // Could be derived from source domains
      price: price ? parseNearAmount(price) : null,
      royaltyPercent,
      // The actual source data would be encrypted and stored on IPFS
      sources: listSources.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        reliabilityScore: s.reliabilityScore,
      })),
    };
    
    // TODO: 
    // 1. Encrypt source data with user's public key
    // 2. Upload to IPFS
    // 3. Get CID
    // 4. Return transaction to call contract.mint()
    
    return c.json({
      success: true,
      data: {
        listId,
        name: nftData.name,
        description: nftData.description,
        sourceCount: nftData.sourceCount,
        price: price || null,
        royaltyPercent,
        // Transaction details for frontend to sign
        transaction: {
          contractId: NFT_CONTRACT,
          methodName: 'mint',
          args: {
            name: nftData.name,
            description: nftData.description,
            cid: 'PENDING_IPFS_UPLOAD', // Would be set after IPFS upload
            source_count: nftData.sourceCount,
            domain: nftData.domain,
            price: nftData.price,
            royalty_percent: royaltyPercent,
          },
          deposit: '100000000000000000000000', // 0.1 NEAR for storage
        },
        message: 'IPFS upload and wallet signature required to complete mint',
      }
    });
  } catch (error) {
    console.error('Prepare mint error:', error);
    return c.json({ success: false, error: 'Failed to prepare mint' }, 500);
  }
});

/**
 * Prepare purchase transaction
 */
nft.post('/prepare-purchase/:tokenId', async (c) => {
  const user = getUser(c);
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  try {
    const { tokenId } = c.req.param();
    
    // TODO: Get token price from contract
    // const listMetadata = await contract.get_list_metadata({ token_id: tokenId });
    
    return c.json({
      success: true,
      data: {
        tokenId,
        transaction: {
          contractId: NFT_CONTRACT,
          methodName: 'purchase',
          args: {
            token_id: tokenId,
          },
          deposit: 'PRICE_FROM_CONTRACT', // Would be fetched from contract
        },
        message: 'Wallet signature required to complete purchase',
      }
    });
  } catch (error) {
    console.error('Prepare purchase error:', error);
    return c.json({ success: false, error: 'Failed to prepare purchase' }, 500);
  }
});

/**
 * Set/update price for an owned NFT
 */
nft.post('/set-price/:tokenId', async (c) => {
  const user = getUser(c);
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  try {
    const { tokenId } = c.req.param();
    const { price } = await c.req.json();
    
    return c.json({
      success: true,
      data: {
        tokenId,
        transaction: {
          contractId: NFT_CONTRACT,
          methodName: 'set_price',
          args: {
            token_id: tokenId,
            price: price ? parseNearAmount(price) : null,
          },
          deposit: '1', // 1 yoctoNEAR for function call
        },
        message: 'Wallet signature required to update price',
      }
    });
  } catch (error) {
    console.error('Set price error:', error);
    return c.json({ success: false, error: 'Failed to prepare price update' }, 500);
  }
});

/**
 * Check if user has access to a source list (owns the NFT)
 */
nft.get('/access/:tokenId/:accountId', async (c) => {
  try {
    const { tokenId, accountId } = c.req.param();
    
    // TODO: Query contract
    // const hasAccess = await contract.has_access({ account_id: accountId, token_id: tokenId });
    
    return c.json({
      success: true,
      data: {
        tokenId,
        accountId,
        hasAccess: false, // Would be from contract
        network: NEAR_NETWORK,
      }
    });
  } catch (error) {
    console.error('Access check error:', error);
    return c.json({ success: false, error: 'Failed to check access' }, 500);
  }
});

/**
 * Get contract info
 */
// NEAR RPC endpoints - FastNEAR for better performance
const NEAR_RPC_URL = process.env.NEAR_RPC_URL || (
  NEAR_NETWORK === 'mainnet' 
    ? 'https://rpc.mainnet.fastnear.com'
    : 'https://rpc.testnet.fastnear.com'
);

nft.get('/contract-info', async (c) => {
  return c.json({
    success: true,
    data: {
      network: NEAR_NETWORK,
      nftContract: NFT_CONTRACT,
      dataRegistryContract: DATA_REGISTRY_CONTRACT,
      rpcEndpoint: NEAR_RPC_URL,
    }
  });
});

export default nft;

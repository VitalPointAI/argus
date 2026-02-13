/**
 * Access Pass Routes
 * 
 * On-chain verification of Access Pass ownership.
 * All access checks go through NEAR RPC - no database trust.
 */

import { Hono } from 'hono';
import { verifyAccessPass, getOwnedAccessPasses, getAccessWithKey } from '../services/access/access-pass';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const app = new Hono();

/**
 * Verify access to a source list (on-chain)
 * GET /access/verify/:listId
 * 
 * Requires user to have a NEAR account linked
 */
app.get('/verify/:listId', async (c) => {
  try {
    const listId = c.req.param('listId');
    const user = c.get('user');

    if (!user) {
      return c.json({ 
        success: false, 
        hasAccess: false,
        error: 'Authentication required' 
      }, 401);
    }

    // Get user's NEAR account
    const [dbUser] = await db
      .select({ nearAccountId: users.nearAccountId })
      .from(users)
      .where(eq(users.id, user.id));

    if (!dbUser?.nearAccountId) {
      return c.json({
        success: false,
        hasAccess: false,
        error: 'No NEAR wallet connected. Connect a wallet to access source lists.',
        needsWallet: true,
      });
    }

    // On-chain verification
    const accessInfo = await verifyAccessPass(dbUser.nearAccountId, listId);

    return c.json({
      success: true,
      hasAccess: accessInfo.hasAccess,
      tokenId: accessInfo.tokenId,
      expiresAt: accessInfo.expiresAt,
      verifiedOnChain: true,
    });
  } catch (error) {
    console.error('Access verification error:', error);
    return c.json({ success: false, hasAccess: false, error: 'Verification failed' }, 500);
  }
});

/**
 * Get source list content (gated by Access Pass)
 * GET /access/content/:listId
 * 
 * Returns the content CID only if user has valid Access Pass
 */
app.get('/content/:listId', async (c) => {
  try {
    const listId = c.req.param('listId');
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    // Get user's NEAR account
    const [dbUser] = await db
      .select({ nearAccountId: users.nearAccountId })
      .from(users)
      .where(eq(users.id, user.id));

    if (!dbUser?.nearAccountId) {
      return c.json({
        success: false,
        error: 'Connect a NEAR wallet to access content',
        needsWallet: true,
      });
    }

    // On-chain verification + get content
    const access = await getAccessWithKey(dbUser.nearAccountId, listId);

    if (!access.authorized) {
      return c.json({
        success: false,
        error: 'Access Pass required. Subscribe to access this content.',
        needsSubscription: true,
      });
    }

    return c.json({
      success: true,
      authorized: true,
      cid: access.cid,
      // decryptionKey would be included here in production
    });
  } catch (error) {
    console.error('Content access error:', error);
    return c.json({ success: false, error: 'Failed to verify access' }, 500);
  }
});

/**
 * Get all Access Passes owned by current user
 * GET /access/my-passes
 */
app.get('/my-passes', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    // Get user's NEAR account
    const [dbUser] = await db
      .select({ nearAccountId: users.nearAccountId })
      .from(users)
      .where(eq(users.id, user.id));

    if (!dbUser?.nearAccountId) {
      return c.json({
        success: true,
        passes: [],
        message: 'Connect a NEAR wallet to view Access Passes',
      });
    }

    // Get all owned passes from chain
    const passes = await getOwnedAccessPasses(dbUser.nearAccountId);

    return c.json({
      success: true,
      passes,
      nearAccountId: dbUser.nearAccountId,
    });
  } catch (error) {
    console.error('Get passes error:', error);
    return c.json({ success: false, error: 'Failed to fetch passes' }, 500);
  }
});

/**
 * Activate subscription (after payment)
 * POST /access/activate
 * 
 * Called by payment webhook to mint Access Pass
 */
app.post('/activate', async (c) => {
  try {
    const body = await c.req.json();
    const { listId, packageId, nearAccountId, paymentTxHash } = body;

    if (!listId || !packageId || !nearAccountId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    // TODO: Verify payment transaction on-chain
    // TODO: Mint Access Pass NFT to subscriber
    
    // For now, log the activation request
    console.log('[AccessPass] Activation request:', {
      listId,
      packageId,
      nearAccountId,
      paymentTxHash,
      timestamp: new Date().toISOString(),
    });

    return c.json({
      success: true,
      message: 'Access Pass activation initiated',
      // tokenId would be returned after actual minting
    });
  } catch (error) {
    console.error('Activation error:', error);
    return c.json({ success: false, error: 'Activation failed' }, 500);
  }
});

export default app;

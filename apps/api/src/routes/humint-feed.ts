// HUMINT Feed API Routes
// Handles encrypted post creation, feed retrieval, and access management
// All content is encrypted client-side - server only stores ciphertext

import { Hono } from 'hono';
import { db } from '../db';
import { 
  humintSources, 
  humintPosts,
  humintPostGrants,
  humintFeedSubscriptions,
} from '../db/schema';
import { eq, desc, sql, and, gte, or, inArray } from 'drizzle-orm';
import { uploadToIPFS, fetchFromIPFS } from '../services/storage/ipfs';
import { getPhantomUser, requirePhantomAuth, type PhantomUser } from './phantom-auth';
import { createHash } from 'crypto';

const feed = new Hono();

// Helper to get authenticated user
function getUser(c: any): { id: string } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string } : null;
}

// ============================================
// FEED RETRIEVAL
// ============================================

/**
 * Get feed for authenticated user
 * Returns posts from sources they have access to
 */
feed.get('/', async (c) => {
  try {
    const user = getUser(c);
    const { 
      limit = '20', 
      offset = '0',
      sourceHash,
      tier,
      epoch,
    } = c.req.query();
    
    // Build query
    let query = db.select({
      id: humintPosts.id,
      postId: humintPosts.postId,
      sourceHash: humintPosts.sourceHash,
      contentCid: humintPosts.contentCid,
      contentHash: humintPosts.contentHash,
      tier: humintPosts.tier,
      epoch: humintPosts.epoch,
      mediaCount: humintPosts.mediaCount,
      createdAt: humintPosts.createdAt,
      // Source info
      sourceCodename: humintSources.codename,
      sourceReputation: humintSources.reputationScore,
      sourcePubkey: humintSources.publicKey,
    })
    .from(humintPosts)
    .leftJoin(humintSources, eq(humintPosts.sourceHash, sql`encode(sha256(${humintSources.codename}::bytea), 'hex')`))
    .$dynamic();
    
    const conditions = [];
    
    // Filter by source
    if (sourceHash) {
      conditions.push(eq(humintPosts.sourceHash, sourceHash));
    }
    
    // Filter by tier
    if (tier) {
      conditions.push(eq(humintPosts.tier, tier));
    }
    
    // Filter by epoch
    if (epoch) {
      conditions.push(eq(humintPosts.epoch, epoch));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query
      .orderBy(desc(humintPosts.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    const posts = await query;
    
    // If user is authenticated, check their access for each post
    // This helps the client know which posts it can decrypt
    let postsWithAccess = posts;
    if (user) {
      // Get user's subscriptions
      const subscriptions = await db.select()
        .from(humintFeedSubscriptions)
        .where(and(
          eq(humintFeedSubscriptions.subscriberId, user.id),
          or(
            sql`${humintFeedSubscriptions.expiresAt} IS NULL`,
            gte(humintFeedSubscriptions.expiresAt, new Date())
          )
        ));
      
      const accessMap = new Map(
        subscriptions.map(s => [`${s.sourceHash}:${s.tier}`, true])
      );
      
      // Get per-post grants
      const postIds = posts.map(p => p.postId);
      const grants = postIds.length > 0 ? await db.select()
        .from(humintPostGrants)
        .where(and(
          inArray(humintPostGrants.postId, postIds),
          eq(humintPostGrants.granteeId, user.id)
        )) : [];
      
      const grantMap = new Map(grants.map(g => [g.postId, true]));
      
      postsWithAccess = posts.map(post => ({
        ...post,
        hasAccess: accessMap.has(`${post.sourceHash}:${post.tier}`) || 
                   accessMap.has(`${post.sourceHash}:gold`) || // Gold includes all
                   grantMap.has(post.postId),
      }));
    }
    
    return c.json({
      success: true,
      data: postsWithAccess,
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: posts.length,
      }
    });
  } catch (error) {
    console.error('Get feed error:', error);
    return c.json({ success: false, error: 'Failed to get feed' }, 500);
  }
});

// ============================================
// POST CREATION (Sources Only)
// ============================================

/**
 * Create a new encrypted post
 * Content is already encrypted client-side
 */
feed.post('/posts', requirePhantomAuth, async (c) => {
  try {
    const phantomUser = c.get('phantomUser') as PhantomUser;
    const body = await c.req.json();
    
    const {
      postId,           // Client-generated UUID
      encryptedContent, // Base64 encrypted content
      contentHash,      // SHA256 of plaintext (for integrity)
      contentKeyWrapped,// Wrapped content key (Base64)
      iv,              // IV used for encryption (hex)
      tier,            // "free", "bronze", "silver", "gold"
      epoch,           // "2026-02"
      mediaCids,       // Array of IPFS CIDs for encrypted media
    } = body;
    
    // Validate required fields
    if (!postId || !encryptedContent || !contentHash || !tier || !epoch) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    // Get source by pubkey
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, phantomUser.mpcPublicKey))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Not registered as HUMINT source' }, 403);
    }
    
    // Calculate source hash
    const sourceHash = createHash('sha256')
      .update(source.codename)
      .digest('hex');
    
    // Upload encrypted content to IPFS
    const contentBuffer = Buffer.from(encryptedContent, 'base64');
    const contentCid = await uploadToIPFS(contentBuffer, {
      name: `humint-post-${postId}`,
      type: 'application/octet-stream',
    });
    
    // Create post record
    const [post] = await db.insert(humintPosts)
      .values({
        postId,
        sourceId: source.id,
        sourceHash,
        contentCid,
        contentHash,
        contentKeyWrapped,
        iv,
        tier,
        epoch,
        mediaCids: mediaCids || [],
        mediaCount: mediaCids?.length || 0,
      })
      .returning();
    
    // Update source stats
    await db.update(humintSources)
      .set({
        totalSubmissions: sql`${humintSources.totalSubmissions} + 1`,
        lastActiveAt: new Date(),
      })
      .where(eq(humintSources.id, source.id));
    
    console.log('HUMINT post created:', {
      postId,
      sourceHash: sourceHash.slice(0, 16) + '...',
      tier,
      epoch,
      mediaCount: mediaCids?.length || 0,
    });
    
    return c.json({
      success: true,
      data: {
        postId: post.postId,
        contentCid,
        tier,
        epoch,
        createdAt: post.createdAt,
      }
    });
  } catch (error) {
    console.error('Create post error:', error);
    return c.json({ success: false, error: 'Failed to create post' }, 500);
  }
});

/**
 * Get a specific post
 */
feed.get('/posts/:postId', async (c) => {
  try {
    const { postId } = c.req.param();
    
    const [post] = await db.select({
      id: humintPosts.id,
      postId: humintPosts.postId,
      sourceHash: humintPosts.sourceHash,
      contentCid: humintPosts.contentCid,
      contentHash: humintPosts.contentHash,
      contentKeyWrapped: humintPosts.contentKeyWrapped,
      iv: humintPosts.iv,
      tier: humintPosts.tier,
      epoch: humintPosts.epoch,
      mediaCids: humintPosts.mediaCids,
      mediaCount: humintPosts.mediaCount,
      createdAt: humintPosts.createdAt,
      // Source info
      sourceCodename: humintSources.codename,
      sourceReputation: humintSources.reputationScore,
      sourcePubkey: humintSources.publicKey,
    })
    .from(humintPosts)
    .leftJoin(humintSources, eq(humintPosts.sourceId, humintSources.id))
    .where(eq(humintPosts.postId, postId))
    .limit(1);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    return c.json({ success: true, data: post });
  } catch (error) {
    console.error('Get post error:', error);
    return c.json({ success: false, error: 'Failed to get post' }, 500);
  }
});

/**
 * Get encrypted content from IPFS
 */
feed.get('/posts/:postId/content', async (c) => {
  try {
    const { postId } = c.req.param();
    
    const [post] = await db.select()
      .from(humintPosts)
      .where(eq(humintPosts.postId, postId))
      .limit(1);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    // Fetch from IPFS
    const content = await fetchFromIPFS(post.contentCid);
    
    // Return as base64
    return c.json({
      success: true,
      data: {
        encryptedContent: content.toString('base64'),
        contentKeyWrapped: post.contentKeyWrapped,
        iv: post.iv,
        contentHash: post.contentHash,
      }
    });
  } catch (error) {
    console.error('Get content error:', error);
    return c.json({ success: false, error: 'Failed to get content' }, 500);
  }
});

// ============================================
// MEDIA UPLOAD
// ============================================

/**
 * Upload encrypted media blob
 * Returns IPFS CID
 */
feed.post('/media', requirePhantomAuth, async (c) => {
  try {
    const phantomUser = c.get('phantomUser') as PhantomUser;
    
    // Verify is a registered source
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, phantomUser.mpcPublicKey))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Not registered as HUMINT source' }, 403);
    }
    
    const body = await c.req.json();
    const { encryptedBlob, filename, mimeType } = body;
    
    if (!encryptedBlob) {
      return c.json({ success: false, error: 'Missing encryptedBlob' }, 400);
    }
    
    // Upload to IPFS
    const buffer = Buffer.from(encryptedBlob, 'base64');
    const cid = await uploadToIPFS(buffer, {
      name: filename || 'encrypted-media',
      type: mimeType || 'application/octet-stream',
    });
    
    return c.json({
      success: true,
      data: { cid }
    });
  } catch (error) {
    console.error('Upload media error:', error);
    return c.json({ success: false, error: 'Failed to upload media' }, 500);
  }
});

/**
 * Get encrypted media from IPFS
 */
feed.get('/media/:cid', async (c) => {
  try {
    const { cid } = c.req.param();
    
    const content = await fetchFromIPFS(cid);
    
    return c.json({
      success: true,
      data: {
        encryptedBlob: content.toString('base64'),
      }
    });
  } catch (error) {
    console.error('Get media error:', error);
    return c.json({ success: false, error: 'Failed to get media' }, 500);
  }
});

// ============================================
// ACCESS GRANTS (Per-Post)
// ============================================

/**
 * Grant access to a specific post for a specific user
 * Source encrypts content key for grantee's pubkey client-side
 */
feed.post('/posts/:postId/grant', requirePhantomAuth, async (c) => {
  try {
    const phantomUser = c.get('phantomUser') as PhantomUser;
    const { postId } = c.req.param();
    const body = await c.req.json();
    
    const { granteePubkey, encryptedKeyForGrantee } = body;
    
    if (!granteePubkey || !encryptedKeyForGrantee) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    // Verify caller is the post's source
    const [post] = await db.select()
      .from(humintPosts)
      .innerJoin(humintSources, eq(humintPosts.sourceId, humintSources.id))
      .where(eq(humintPosts.postId, postId))
      .limit(1);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    if (post.humint_sources.publicKey !== phantomUser.mpcPublicKey) {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }
    
    // Create grant
    await db.insert(humintPostGrants)
      .values({
        postId,
        granteePubkey,
        encryptedContentKey: encryptedKeyForGrantee,
        grantedBy: post.humint_sources.id,
      })
      .onConflictDoUpdate({
        target: [humintPostGrants.postId, humintPostGrants.granteePubkey],
        set: {
          encryptedContentKey: encryptedKeyForGrantee,
          grantedAt: new Date(),
        }
      });
    
    console.log('Post grant created:', {
      postId,
      granteePubkey: granteePubkey.slice(0, 16) + '...',
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Grant access error:', error);
    return c.json({ success: false, error: 'Failed to grant access' }, 500);
  }
});

/**
 * Revoke access to a specific post
 */
feed.delete('/posts/:postId/grant/:granteePubkey', requirePhantomAuth, async (c) => {
  try {
    const phantomUser = c.get('phantomUser') as PhantomUser;
    const { postId, granteePubkey } = c.req.param();
    
    // Verify caller is the post's source
    const [post] = await db.select()
      .from(humintPosts)
      .innerJoin(humintSources, eq(humintPosts.sourceId, humintSources.id))
      .where(eq(humintPosts.postId, postId))
      .limit(1);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    if (post.humint_sources.publicKey !== phantomUser.mpcPublicKey) {
      return c.json({ success: false, error: 'Not authorized' }, 403);
    }
    
    // Delete grant
    await db.delete(humintPostGrants)
      .where(and(
        eq(humintPostGrants.postId, postId),
        eq(humintPostGrants.granteePubkey, granteePubkey)
      ));
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Revoke access error:', error);
    return c.json({ success: false, error: 'Failed to revoke access' }, 500);
  }
});

/**
 * Get my grant for a post (if any)
 */
feed.get('/posts/:postId/my-grant', async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    
    const { postId } = c.req.param();
    const { myPubkey } = c.req.query();
    
    if (!myPubkey) {
      return c.json({ success: false, error: 'myPubkey required' }, 400);
    }
    
    const [grant] = await db.select()
      .from(humintPostGrants)
      .where(and(
        eq(humintPostGrants.postId, postId),
        eq(humintPostGrants.granteePubkey, myPubkey)
      ))
      .limit(1);
    
    if (!grant) {
      return c.json({ success: true, data: null });
    }
    
    return c.json({
      success: true,
      data: {
        encryptedContentKey: grant.encryptedContentKey,
        grantedAt: grant.grantedAt,
      }
    });
  } catch (error) {
    console.error('Get grant error:', error);
    return c.json({ success: false, error: 'Failed to get grant' }, 500);
  }
});

// ============================================
// SOURCE PROFILE
// ============================================

/**
 * Get source profile with posts
 */
feed.get('/sources/:codenameHash', async (c) => {
  try {
    const { codenameHash } = c.req.param();
    const { limit = '20', offset = '0' } = c.req.query();
    
    // Get source by hash
    const sources = await db.select()
      .from(humintSources);
    
    // Find matching source (hash their codename)
    const source = sources.find(s => {
      const hash = createHash('sha256').update(s.codename).digest('hex');
      return hash === codenameHash;
    });
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    // Get source's posts
    const posts = await db.select()
      .from(humintPosts)
      .where(eq(humintPosts.sourceHash, codenameHash))
      .orderBy(desc(humintPosts.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    return c.json({
      success: true,
      data: {
        source: {
          codenameHash,
          publicKey: source.publicKey,
          reputationScore: source.reputationScore,
          totalPosts: source.totalSubmissions,
          subscriberCount: source.subscriberCount,
          tiers: [
            { name: 'free', level: 0, priceUsdc: 0 },
            { name: 'bronze', level: 1, priceUsdc: source.subscriptionPriceUsdc || 5 },
            { name: 'silver', level: 2, priceUsdc: (source.subscriptionPriceUsdc || 5) * 2 },
            { name: 'gold', level: 3, priceUsdc: (source.subscriptionPriceUsdc || 5) * 5 },
          ],
          createdAt: source.createdAt,
        },
        posts,
      }
    });
  } catch (error) {
    console.error('Get source profile error:', error);
    return c.json({ success: false, error: 'Failed to get source' }, 500);
  }
});

export default feed;

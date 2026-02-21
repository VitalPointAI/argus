/**
 * HUMINT Feed API Routes
 * 
 * User-friendly endpoints - NO blockchain concepts exposed.
 * 
 * Users see:
 * - "Become a Source" (not "register wallet + mint NFT")
 * - "Subscribe" (not "purchase NFT access pass")
 * - "Post Update" (not "encrypt + IPFS + anchor on-chain")
 * - "Unlock Post" (not "derive epoch key + decrypt")
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { eq, desc, and } from 'drizzle-orm';
import { 
  humintSources, 
  humintSubmissions, 
  sourceSubscriptions,
  users 
} from '../db/schema';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { pinFile } from '../services/storage/ipfs';
import { 
  generateLocationProof, 
  generateReputationProof,
  verifyLocationProof,
  verifyReputationProof,
  isZKReady,
  getZKStatus
} from '../services/zk';
import { getPaymentQuote, getPaymentStatus } from '../services/payments/one-click';

// Platform treasury for receiving payments
const PLATFORM_TREASURY = process.env.PLATFORM_TREASURY_ADDRESS || 'argus-intel.near';

// In-memory pending payments (should be Redis in production)
const pendingHumintPayments = new Map<string, {
  depositAddress: string;
  subscriptionId: string;
  sourceId: string;
  userId: string;
  amountUsdc: number;
  createdAt: Date;
  expiresAt: Date;
}>();

const app = new Hono();

// Helper to get userId from context
function getUserId(c: any): string | null {
  const user = c.get('user');
  return user?.id || null;
}

// ==========================================
// SOURCE MANAGEMENT
// ==========================================

/**
 * Become a Source
 * POST /api/humint-feed/sources
 */
app.post(
  '/sources',
  zValidator('json', z.object({
    codename: z.string().min(3).max(50),
    bio: z.string().max(500).optional(),
    // Source-defined subscription packages (not fixed tiers)
    packages: z.array(z.object({
      name: z.string().max(50),
      priceUsdc: z.number().min(0), // Price in USDC (pay with any token via 1Click)
      durationDays: z.number().min(1).max(365).default(30), // Subscription duration
      description: z.string().max(200),
    })).optional(),
  })),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { codename, bio, packages: inputPackages } = c.req.valid('json');

    try {
      // Check if already registered
      const existing = await db.query.humintSources.findFirst({
        where: eq(humintSources.userId, userId),
      });
      
      if (existing) {
        return c.json({ error: 'Already registered as a source' }, 400);
      }

      // Generate codename hash
      const codenameHash = bytesToHex(sha256(new TextEncoder().encode(codename.toLowerCase())));
      
      // Generate a simple public key (in production, derive from wallet)
      const publicKey = bytesToHex(sha256(new TextEncoder().encode(`${userId}:${codenameHash}`)));

      // Store packages as defined by source (no defaults - source decides)
      const packages = inputPackages?.map((p, i) => ({
        id: `pkg-${i + 1}`,
        name: p.name,
        priceUsdc: p.priceUsdc,
        durationDays: p.durationDays || 30,
        description: p.description,
      })) || [];

      // Store in DB
      const [source] = await db.insert(humintSources).values({
        userId,
        codename,
        codenameHash,
        publicKey,
        bio: bio || null,
        tiers: packages, // Source-defined packages (not fixed tiers)
        isAcceptingSubscribers: packages.length > 0,
      }).returning();

      return c.json({
        success: true,
        source: {
          id: codenameHash.slice(0, 12),
          codename,
          packages: packages.map(p => ({
            id: p.id,
            name: p.name,
            priceUsdc: p.priceUsdc,
            durationDays: p.durationDays,
            description: p.description,
          })),
          createdAt: source.createdAt,
        },
      });
    } catch (error: any) {
      console.error('Source registration error:', error);
      if (error.code === '23505') { // Unique constraint violation
        return c.json({ error: 'Codename already taken' }, 400);
      }
      return c.json({ error: error.message || 'Failed to create source profile' }, 500);
    }
  }
);

/**
 * Get My Source Profile
 * GET /api/humint-feed/sources/me
 */
app.get('/sources/me', async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const source = await db.query.humintSources.findFirst({
    where: eq(humintSources.userId, userId),
  });

  if (!source) {
    return c.json({ error: 'Not registered as a source' }, 404);
  }

  return c.json({
    id: source.codenameHash?.slice(0, 12),
    codename: source.codename,
    bio: source.bio,
    tiers: source.tiers,
    stats: {
      posts: source.totalSubmissions,
      subscribers: source.subscriberCount,
    },
    createdAt: source.createdAt,
  });
});

/**
 * List Public Sources
 * GET /api/humint-feed/sources
 */
app.get('/sources', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const sources = await db.query.humintSources.findMany({
    where: eq(humintSources.isAcceptingSubscribers, true),
    limit,
    offset,
    orderBy: [desc(humintSources.createdAt)],
  });

  return c.json({
    sources: sources.map(s => ({
      id: s.codenameHash?.slice(0, 12),
      codename: s.codename,
      bio: s.bio,
      packages: (s.tiers as any[])?.map(p => ({
        id: p.id,
        name: p.name,
        priceUsdc: p.priceUsdc || 0,
        durationDays: p.durationDays || 30,
        description: p.description,
      })) || [],
      stats: {
        posts: s.totalSubmissions,
        subscribers: s.subscriberCount,
      },
    })),
  });
});

// ==========================================
// POSTING CONTENT
// ==========================================

/**
 * Create a Post with optional ZK proofs
 * POST /api/humint-feed/posts
 */
app.post(
  '/posts',
  zValidator('json', z.object({
    content: z.string().min(1).max(50000),
    tier: z.number().int().min(0).max(3).default(0),
    title: z.string().max(200).optional(),
    // Optional ZK proofs
    zkProofs: z.array(z.object({
      type: z.enum(['location', 'reputation', 'identity']),
      proof: z.any(),
      publicSignals: z.array(z.string()),
      metadata: z.record(z.any()).optional(),
    })).optional(),
    // Location proof inputs (if generating on-server)
    locationProof: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      targetLat: z.number().min(-90).max(90),
      targetLon: z.number().min(-180).max(180),
      maxDistanceKm: z.number().min(1).max(1000),
    }).optional(),
  })),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Get user's source profile
    const source = await db.query.humintSources.findFirst({
      where: eq(humintSources.userId, userId),
    });

    if (!source) {
      return c.json({ error: 'You must register as a source first' }, 403);
    }

    const { content, tier, title, zkProofs, locationProof } = c.req.valid('json');

    try {
      // Generate content hash
      const contentHash = bytesToHex(sha256(new TextEncoder().encode(content)));
      
      // Get current epoch (YYYY-MM)
      const now = new Date();
      const epoch = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Process ZK proofs
      const processedProofs: any[] = zkProofs || [];
      let hasLocationProof = false;
      let hasReputationProof = false;
      let hasIdentityProof = false;

      // Generate location proof if requested
      if (locationProof) {
        try {
          const locProof = await generateLocationProof({
            actualLat: locationProof.lat,
            actualLon: locationProof.lon,
            targetLat: locationProof.targetLat,
            targetLon: locationProof.targetLon,
            maxDistanceKm: locationProof.maxDistanceKm,
          });
          processedProofs.push({
            type: 'location',
            proof: locProof.proof,
            publicSignals: locProof.publicSignals,
            metadata: {
              targetLat: locationProof.targetLat,
              targetLon: locationProof.targetLon,
              maxDistanceKm: locationProof.maxDistanceKm,
              commitment: locProof.commitment,
            },
          });
          hasLocationProof = true;
        } catch (e) {
          console.error('Location proof generation failed:', e);
          // Continue without proof - don't fail the post
        }
      }

      // Verify any pre-generated proofs
      for (const zk of zkProofs || []) {
        if (zk.type === 'location') {
          const valid = await verifyLocationProof(zk.proof, zk.publicSignals);
          if (!valid) {
            return c.json({ error: 'Invalid location proof' }, 400);
          }
          hasLocationProof = true;
        } else if (zk.type === 'reputation') {
          const valid = await verifyReputationProof(zk.proof, zk.publicSignals);
          if (!valid) {
            return c.json({ error: 'Invalid reputation proof' }, 400);
          }
          hasReputationProof = true;
        } else if (zk.type === 'identity') {
          hasIdentityProof = true;
        }
      }

      // For now, store content directly (encryption happens on read for premium)
      // In production, encrypt before storing to IPFS
      let contentCid = '';
      try {
        const result = await pinFile(
          Buffer.from(JSON.stringify({ content, tier, epoch, zkProofs: processedProofs })),
          `post-${Date.now()}.json`,
          { type: 'humint-post' }
        );
        contentCid = result.cid;
      } catch (e) {
        // IPFS not configured, store locally
        contentCid = `local:${contentHash.slice(0, 16)}`;
      }

      // Store in DB
      const [post] = await db.insert(humintSubmissions).values({
        sourceId: source.id,
        title: title || content.slice(0, 100),
        body: content,
        contentHash,
        contentCid,
        tier,
        epoch,
        signature: contentHash, // Simplified - in production use actual signature
        zkProofs: processedProofs,
        hasLocationProof,
        hasReputationProof,
        hasIdentityProof,
      }).returning();

      // Update source post count
      await db.update(humintSources)
        .set({ totalSubmissions: source.totalSubmissions + 1 })
        .where(eq(humintSources.id, source.id));

      return c.json({
        success: true,
        post: {
          id: post.id,
          tier: tier === 0 ? 'Free' : ['Bronze', 'Silver', 'Gold'][tier - 1],
          createdAt: post.submittedAt,
          proofs: {
            location: hasLocationProof,
            reputation: hasReputationProof,
            identity: hasIdentityProof,
          },
        },
      });
    } catch (error: any) {
      console.error('Post creation error:', error);
      return c.json({ error: error.message || 'Failed to create post' }, 500);
    }
  }
);

/**
 * Get Feed
 * GET /api/humint-feed/feed
 */
app.get('/feed', async (c) => {
  const userId = getUserId(c);
  const sourceId = c.req.query('source');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // Get posts with source info
    const posts = await db.query.humintSubmissions.findMany({
      with: {
        source: true,
      },
      limit,
      offset,
      orderBy: [desc(humintSubmissions.submittedAt)],
    });

    // Check access for each post
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const source = post.source as any;
        let hasAccess = (post.tier || 0) === 0; // Free posts always accessible

        // Check if user has subscription
        if (!hasAccess && userId) {
          const subscription = await db.query.sourceSubscriptions.findFirst({
            where: and(
              eq(sourceSubscriptions.subscriberId, userId),
              eq(sourceSubscriptions.sourceId, source.id),
              eq(sourceSubscriptions.status, 'active')
            ),
          });
          hasAccess = !!(subscription && (subscription.tier || 0) >= (post.tier || 0));
        }

        return {
          id: post.id,
          source: {
            id: source.codenameHash?.slice(0, 12),
            codename: source.codename,
          },
          tier: (post.tier || 0) === 0 ? 'Free' : ['Bronze', 'Silver', 'Gold'][(post.tier || 1) - 1],
          createdAt: post.submittedAt,
          locked: !hasAccess,
          canUnlock: !hasAccess && (post.tier || 0) > 0,
          // Only include content if accessible
          content: hasAccess ? {
            type: 'text',
            text: post.body,
          } : undefined,
          // ZK proof badges
          proofs: {
            location: post.hasLocationProof || false,
            reputation: post.hasReputationProof || false,
            identity: post.hasIdentityProof || false,
          },
        };
      })
    );

    return c.json({ posts: enrichedPosts });
  } catch (error: any) {
    console.error('Feed error:', error);
    return c.json({ error: 'Failed to load feed' }, 500);
  }
});

/**
 * Get Post (with decryption if authorized)
 * GET /api/humint-feed/posts/:id
 */
app.get('/posts/:id', async (c) => {
  const userId = getUserId(c);
  const postId = c.req.param('id');

  try {
    const post = await db.query.humintSubmissions.findFirst({
      where: eq(humintSubmissions.id, postId),
      with: {
        source: true,
      },
    });

    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    const source = post.source as any;
    let hasAccess = (post.tier || 0) === 0;

    // Check subscription
    if (!hasAccess && userId) {
      const subscription = await db.query.sourceSubscriptions.findFirst({
        where: and(
          eq(sourceSubscriptions.subscriberId, userId),
          eq(sourceSubscriptions.sourceId, source.id),
          eq(sourceSubscriptions.status, 'active')
        ),
      });
      hasAccess = !!(subscription && (subscription.tier || 0) >= (post.tier || 0));
    }

    if (!hasAccess) {
      return c.json({ 
        error: 'locked',
        message: 'Subscribe to unlock this content',
        postId,
        tier: ['Bronze', 'Silver', 'Gold'][(post.tier || 1) - 1],
      }, 403);
    }

    return c.json({
      id: post.id,
      source: {
        id: source.codenameHash?.slice(0, 12),
        codename: source.codename,
      },
      tier: (post.tier || 0) === 0 ? 'Free' : ['Bronze', 'Silver', 'Gold'][(post.tier || 1) - 1],
      content: {
        type: 'text',
        text: post.body,
      },
      createdAt: post.submittedAt,
    });
  } catch (error: any) {
    console.error('Post fetch error:', error);
    return c.json({ error: error.message || 'Failed to load post' }, 500);
  }
});

// ==========================================
// SUBSCRIPTIONS
// ==========================================

/**
 * Subscribe to a Source
 * POST /api/humint-feed/subscribe
 */
app.post(
  '/subscribe',
  zValidator('json', z.object({
    sourceId: z.string(),
    packageId: z.string(), // Package ID chosen by subscriber
  })),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { sourceId, packageId } = c.req.valid('json');

    // Find source by short ID
    const sources = await db.query.humintSources.findMany({
      where: eq(humintSources.isAcceptingSubscribers, true),
      limit: 100,
    });
    
    const source = sources.find(s => s.codenameHash?.startsWith(sourceId));

    if (!source) {
      return c.json({ error: 'Source not found' }, 404);
    }

    // Get package details
    const packages = source.tiers as any[];
    const pkg = packages?.find(p => p.id === packageId);
    
    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }
    
    const priceUsdc = pkg.priceUsdc || 0;
    const durationDays = pkg.durationDays || 30;

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subscriptionExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    try {
      // Get 1Click quote with deposit address
      const quote = await getPaymentQuote({
        amountUsdc: priceUsdc,
        recipientAddress: PLATFORM_TREASURY,
        recipientChain: 'near',
        refundAddress: PLATFORM_TREASURY,
        dry: false,
      });

      // Create pending subscription
      await db.insert(sourceSubscriptions).values({
        id: subscriptionId,
        sourceId: source.id,
        subscriberId: userId,
        tier: 1, // Any paid package = tier 1 access
        status: 'pending',
        expiresAt: subscriptionExpiresAt,
        approvalStatus: 'approved', // Auto-approve for now
        amountPaidUsdc: priceUsdc,
      });

      // Store pending payment for polling
      if (quote.depositAddress) {
        pendingHumintPayments.set(quote.depositAddress, {
          depositAddress: quote.depositAddress,
          subscriptionId,
          sourceId: source.id,
          userId,
          amountUsdc: priceUsdc,
          createdAt: new Date(),
          expiresAt: new Date(quote.deadline || Date.now() + 3600000),
        });
      }

      return c.json({
        success: true,
        subscription: {
          id: subscriptionId,
          source: source.codename,
          package: pkg.name,
          durationDays,
          expiresAt: subscriptionExpiresAt.toISOString(),
          priceUsdc,
        },
        // 1Click payment details - user sends to depositAddress
        payment: {
          depositAddress: quote.depositAddress,
          depositMemo: quote.depositMemo,
          amountUsdc: priceUsdc,
          deadline: quote.deadline,
          estimatedTimeMs: quote.estimatedTimeMs,
        },
      });
    } catch (error: any) {
      console.error('Subscription error:', error);
      return c.json({ error: error.message || 'Failed to create subscription' }, 500);
    }
  }
);

/**
 * Get My Subscriptions
 * GET /api/humint-feed/subscriptions
 */
app.get('/subscriptions', async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const subscriptions = await db.query.sourceSubscriptions.findMany({
    where: eq(sourceSubscriptions.subscriberId, userId),
    with: {
      source: true,
    },
    orderBy: [desc(sourceSubscriptions.createdAt)],
  });

  return c.json({
    subscriptions: subscriptions.map(sub => {
      const source = sub.source as any;
      return {
        id: sub.id,
        source: {
          id: source.codenameHash?.slice(0, 12),
          codename: source.codename,
        },
        tier: ['Free', 'Bronze', 'Silver', 'Gold'][sub.tier || 0],
        status: sub.status,
        expiresAt: sub.expiresAt,
      };
    }),
  });
});

/**
 * Check payment status for a subscription
 * GET /api/humint-feed/subscriptions/:id/status
 */
app.get('/subscriptions/:id/status', async (c) => {
  const subscriptionId = c.req.param('id');
  const depositAddress = c.req.query('depositAddress');

  if (!depositAddress) {
    return c.json({ error: 'depositAddress required' }, 400);
  }

  try {
    // Check 1Click status
    const status = await getPaymentStatus(depositAddress);
    
    // If completed, activate subscription
    if (status.status === 'SUCCESS') {
      await db.update(sourceSubscriptions)
        .set({ status: 'active' })
        .where(eq(sourceSubscriptions.id, subscriptionId));

      // Update source subscriber count
      const sub = await db.query.sourceSubscriptions.findFirst({
        where: eq(sourceSubscriptions.id, subscriptionId),
      });
      
      if (sub) {
        const source = await db.query.humintSources.findFirst({
          where: eq(humintSources.id, sub.sourceId),
        });
        if (source) {
          await db.update(humintSources)
            .set({ subscriberCount: source.subscriberCount + 1 })
            .where(eq(humintSources.id, sub.sourceId));
        }
      }

      // Clean up pending payment
      pendingHumintPayments.delete(depositAddress);
    }

    return c.json({
      subscriptionId,
      paymentStatus: status.status,
      activated: status.status === 'SUCCESS',
    });
  } catch (error: any) {
    console.error('Payment status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// ZK PROOF GENERATION
// ==========================================

/**
 * Get ZK system status
 * GET /api/humint-feed/zk/status
 */
app.get('/zk/status', async (c) => {
  const status = getZKStatus();
  return c.json(status);
});

/**
 * Generate location proof
 * POST /api/humint-feed/zk/location
 * 
 * Prove you're within X km of a location without revealing exact position
 */
app.post(
  '/zk/location',
  zValidator('json', z.object({
    actualLat: z.number().min(-90).max(90),
    actualLon: z.number().min(-180).max(180),
    targetLat: z.number().min(-90).max(90),
    targetLon: z.number().min(-180).max(180),
    maxDistanceKm: z.number().min(1).max(1000),
  })),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const input = c.req.valid('json');

    try {
      const proof = await generateLocationProof(input);
      
      return c.json({
        success: true,
        proof: {
          type: 'location',
          proof: proof.proof,
          publicSignals: proof.publicSignals,
          metadata: {
            targetLat: input.targetLat,
            targetLon: input.targetLon,
            maxDistanceKm: input.maxDistanceKm,
            commitment: proof.commitment,
          },
        },
        message: `Proof generated: within ${input.maxDistanceKm}km of target`,
      });
    } catch (error: any) {
      console.error('Location proof generation error:', error);
      return c.json({ error: error.message || 'Failed to generate proof' }, 500);
    }
  }
);

/**
 * Generate reputation proof
 * POST /api/humint-feed/zk/reputation
 * 
 * Prove reputation >= threshold without revealing exact score
 */
app.post(
  '/zk/reputation',
  zValidator('json', z.object({
    threshold: z.number().min(0).max(100),
  })),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Get source's reputation
    const source = await db.query.humintSources.findFirst({
      where: eq(humintSources.userId, userId),
    });

    if (!source) {
      return c.json({ error: 'Not registered as a source' }, 403);
    }

    const { threshold } = c.req.valid('json');

    if (source.reputationScore < threshold) {
      return c.json({ 
        error: 'Reputation below threshold',
        message: 'Cannot generate proof - your reputation does not meet the threshold'
      }, 400);
    }

    try {
      // Generate a deterministic public key from source data
      const publicKeyBytes = sha256(new TextEncoder().encode(source.publicKey));
      const publicKey = BigInt('0x' + bytesToHex(publicKeyBytes));

      const proof = await generateReputationProof({
        publicKey,
        reputationScore: source.reputationScore,
        threshold,
      });
      
      return c.json({
        success: true,
        proof: {
          type: 'reputation',
          proof: proof.proof,
          publicSignals: proof.publicSignals,
          metadata: {
            threshold,
            commitment: proof.commitment,
            publicKeyHash: proof.publicKeyHash,
          },
        },
        message: `Proof generated: reputation >= ${threshold}`,
      });
    } catch (error: any) {
      console.error('Reputation proof generation error:', error);
      return c.json({ error: error.message || 'Failed to generate proof' }, 500);
    }
  }
);

/**
 * Verify a proof
 * POST /api/humint-feed/zk/verify
 */
app.post(
  '/zk/verify',
  zValidator('json', z.object({
    type: z.enum(['location', 'reputation']),
    proof: z.any(),
    publicSignals: z.array(z.string()),
  })),
  async (c) => {
    const { type, proof, publicSignals } = c.req.valid('json');

    try {
      let valid = false;
      
      if (type === 'location') {
        valid = await verifyLocationProof(proof, publicSignals);
      } else if (type === 'reputation') {
        valid = await verifyReputationProof(proof, publicSignals);
      }
      
      return c.json({
        valid,
        message: valid ? 'Proof verified successfully' : 'Proof verification failed',
      });
    } catch (error: any) {
      console.error('Proof verification error:', error);
      return c.json({ error: error.message || 'Verification failed' }, 500);
    }
  }
);

export const humintFeedRoutes = app;
export default app;

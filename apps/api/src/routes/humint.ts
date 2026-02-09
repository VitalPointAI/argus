// HUMINT (Human Intelligence) API Routes
// Handles anonymous source registration, submissions, ratings, and discovery

import { Hono } from 'hono';
import { db } from '../db';
import { 
  humintSources, 
  humintSubmissions, 
  submissionRatings,
  sourceSubscriptions,
  sourcePaymentAddresses,
  humintPayments
} from '../db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { createHash } from 'crypto';
import { 
  SUPPORTED_CHAINS, 
  validateAddress, 
  getPaymentQuote,
  getPaymentStatus,
  getSupportedTokens,
  USDC_TOKEN_IDS
} from '../services/payments/one-click';
import { getPhantomUser, requirePhantomAuth, type PhantomUser } from './phantom-auth';

// Helper to get authenticated user from context
function getUser(c: any): { id: string } | null {
  const user = c.get('user' as never);
  return user && typeof user === 'object' && 'id' in user ? user as { id: string } : null;
}

// Middleware to require authentication
async function requireAuth(c: any, next: () => Promise<void>): Promise<Response | void> {
  const user = getUser(c);
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  await next();
}

const humint = new Hono();

// ============================================
// Codename Generation
// ============================================

const CODENAME_ADJECTIVES = [
  'ALPINE', 'ARCTIC', 'AZURE', 'BRONZE', 'CARBON', 'CIPHER', 'COBALT', 'CORAL',
  'CRIMSON', 'CRYSTAL', 'DELTA', 'ECHO', 'EMBER', 'FALCON', 'FROST', 'GHOST',
  'GRANITE', 'HARBOR', 'HAWK', 'HORIZON', 'IRON', 'JADE', 'LUNAR', 'MERCURY',
  'NEBULA', 'ONYX', 'PHOENIX', 'PRISM', 'RAVEN', 'RUBY', 'SHADOW', 'SIERRA',
  'SILVER', 'SOLAR', 'SPARTAN', 'STORM', 'SUMMIT', 'THUNDER', 'TITAN', 'VECTOR',
  'VIPER', 'WINTER', 'WOLF', 'ZENITH', 'ZEPHYR'
];

function generateCodename(): string {
  const adj = CODENAME_ADJECTIVES[Math.floor(Math.random() * CODENAME_ADJECTIVES.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}-${num}`;
}

async function generateUniqueCodename(): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    const codename = generateCodename();
    const existing = await db.select().from(humintSources).where(eq(humintSources.codename, codename)).limit(1);
    if (existing.length === 0) {
      return codename;
    }
    attempts++;
  }
  // Fallback: add timestamp
  return `${generateCodename()}-${Date.now().toString(36)}`;
}

// ============================================
// Reputation Algorithm
// ============================================

function calculateReputation(source: {
  totalSubmissions: number;
  verifiedCount: number;
  contradictedCount: number;
  createdAt: Date;
}): number {
  const { totalSubmissions, verifiedCount, contradictedCount, createdAt } = source;
  
  // Base score
  let score = 50;
  
  // Verification ratio (up to +35)
  if (totalSubmissions > 0) {
    const verifyRatio = verifiedCount / totalSubmissions;
    score += verifyRatio * 35;
  }
  
  // Contradiction penalty (-10 each, max -30)
  const contradictionPenalty = Math.min(contradictedCount * 10, 30);
  score -= contradictionPenalty;
  
  // Longevity bonus (up to +10 for 1 year)
  const accountAgeDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const longevityBonus = Math.min(accountAgeDays / 36.5, 10);
  score += longevityBonus;
  
  // Activity bonus (up to +5)
  if (totalSubmissions >= 10) score += 2;
  if (totalSubmissions >= 50) score += 3;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================
// Source Registration (Anonymous)
// ============================================

// ============================================
// SECURITY: HUMINT Registration
// ============================================
// Registration uses Phantom Auth (passkey-based anonymous authentication)
// The source must be authenticated via /api/phantom/* endpoints first.
// Their phantom identity (codename + NEAR account) is cryptographically verified.
// ============================================

humint.post('/register', requirePhantomAuth, async (c) => {
  try {
    const phantomUser = c.get('phantomUser') as PhantomUser;
    const body = await c.req.json().catch(() => ({}));
    const { bio, domains, regions, eventTypes } = body;
    
    // Check if already registered as HUMINT source
    const existing = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, phantomUser.mpcPublicKey))
      .limit(1);
    
    if (existing.length > 0) {
      return c.json({ 
        success: true, 
        data: { 
          codename: existing[0].codename,
          alreadyRegistered: true,
        },
        message: 'Source already registered'
      });
    }
    
    // Use the phantom codename (already generated during phantom auth)
    const codename = phantomUser.codename;
    
    // Create HUMINT source record
    const [source] = await db.insert(humintSources)
      .values({
        codename,
        publicKey: phantomUser.mpcPublicKey,
        nearAccountId: phantomUser.nearAccountId,
        bio: bio || null,
        domains: domains || [],
        regions: regions || [],
        eventTypes: eventTypes || [],
      })
      .returning();
    
    // Log registration (without identifying info)
    console.log('HUMINT source registered:', { 
      codename, 
      publicKeyPrefix: phantomUser.mpcPublicKey.slice(0, 16),
      nearAccountPrefix: phantomUser.nearAccountId.slice(0, 20),
    });
    
    return c.json({
      success: true,
      data: {
        codename: source.codename,
        nearAccountId: phantomUser.nearAccountId,
      }
    });
  } catch (error) {
    console.error('HUMINT registration error:', error);
    return c.json({ success: false, error: 'Registration failed' }, 500);
  }
});

// ============================================
// Source Profile
// ============================================

// Get source profile by codename
humint.get('/sources/:codename', async (c) => {
  try {
    const { codename } = c.req.param();
    
    const [source] = await db.select({
      codename: humintSources.codename,
      bio: humintSources.bio,
      domains: humintSources.domains,
      regions: humintSources.regions,
      eventTypes: humintSources.eventTypes,
      reputationScore: humintSources.reputationScore,
      totalSubmissions: humintSources.totalSubmissions,
      verifiedCount: humintSources.verifiedCount,
      contradictedCount: humintSources.contradictedCount,
      subscriberCount: humintSources.subscriberCount,
      subscriptionPriceUsdc: humintSources.subscriptionPriceUsdc,
      isAcceptingSubscribers: humintSources.isAcceptingSubscribers,
      createdAt: humintSources.createdAt,
      lastActiveAt: humintSources.lastActiveAt,
    })
    .from(humintSources)
    .where(eq(humintSources.codename, codename.toUpperCase()))
    .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    // Get recent submissions
    const recentSubmissions = await db.select({
      id: humintSubmissions.id,
      title: humintSubmissions.title,
      locationRegion: humintSubmissions.locationRegion,
      locationCountry: humintSubmissions.locationCountry,
      eventTag: humintSubmissions.eventTag,
      verificationStatus: humintSubmissions.verificationStatus,
      verifiedCount: humintSubmissions.verifiedCount,
      submittedAt: humintSubmissions.submittedAt,
    })
    .from(humintSubmissions)
    .innerJoin(humintSources, eq(humintSubmissions.sourceId, humintSources.id))
    .where(eq(humintSources.codename, codename.toUpperCase()))
    .orderBy(desc(humintSubmissions.submittedAt))
    .limit(10);
    
    return c.json({
      success: true,
      data: {
        ...source,
        recentSubmissions,
      }
    });
  } catch (error) {
    console.error('Get source error:', error);
    return c.json({ success: false, error: 'Failed to get source' }, 500);
  }
});

// List/search sources
humint.get('/sources', async (c) => {
  try {
    const { 
      regions, 
      domains, 
      eventTypes,
      minReputation,
      minPosts,
      acceptingSubscribers,
      sort = 'reputation',
      limit = '20',
      offset = '0'
    } = c.req.query();
    
    let query = db.select({
      codename: humintSources.codename,
      bio: humintSources.bio,
      domains: humintSources.domains,
      regions: humintSources.regions,
      eventTypes: humintSources.eventTypes,
      reputationScore: humintSources.reputationScore,
      totalSubmissions: humintSources.totalSubmissions,
      verifiedCount: humintSources.verifiedCount,
      subscriberCount: humintSources.subscriberCount,
      subscriptionPriceUsdc: humintSources.subscriptionPriceUsdc,
      isAcceptingSubscribers: humintSources.isAcceptingSubscribers,
      lastActiveAt: humintSources.lastActiveAt,
    })
    .from(humintSources)
    .$dynamic();
    
    const conditions = [];
    
    // Region filter
    if (regions) {
      const regionList = regions.split(',').map(r => r.trim().toLowerCase());
      conditions.push(sql`${humintSources.regions} && ${regionList}`);
    }
    
    // Domain filter
    if (domains) {
      const domainList = domains.split(',').map(d => d.trim().toLowerCase());
      conditions.push(sql`${humintSources.domains} && ${domainList}`);
    }
    
    // Event type filter
    if (eventTypes) {
      const eventList = eventTypes.split(',').map(e => e.trim().toLowerCase());
      conditions.push(sql`${humintSources.eventTypes} && ${eventList}`);
    }
    
    // Min reputation
    if (minReputation) {
      conditions.push(gte(humintSources.reputationScore, parseInt(minReputation)));
    }
    
    // Min posts
    if (minPosts) {
      conditions.push(gte(humintSources.totalSubmissions, parseInt(minPosts)));
    }
    
    // Accepting subscribers
    if (acceptingSubscribers === 'true') {
      conditions.push(eq(humintSources.isAcceptingSubscribers, true));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sort
    if (sort === 'reputation') {
      query = query.orderBy(desc(humintSources.reputationScore));
    } else if (sort === 'recent') {
      query = query.orderBy(desc(humintSources.lastActiveAt));
    } else if (sort === 'subscribers') {
      query = query.orderBy(desc(humintSources.subscriberCount));
    }
    
    query = query.limit(parseInt(limit)).offset(parseInt(offset));
    
    const sources = await query;
    
    return c.json({
      success: true,
      data: sources,
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: sources.length,
      }
    });
  } catch (error) {
    console.error('List sources error:', error);
    return c.json({ success: false, error: 'Failed to list sources' }, 500);
  }
});

// ============================================
// SECURITY: Update Source Profile
// ============================================
// Profile updates require cryptographic proof of key ownership.
// DISABLED until Bastion auth is integrated.
// ============================================

humint.patch('/sources/:codename', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Profile updates require wallet signature verification. This feature is not yet available.',
    code: 'AUTH_NOT_CONFIGURED'
  }, 503);
});

// ============================================
// Submissions
// ============================================

// ============================================
// SECURITY: HUMINT Submission
// ============================================
// Submissions require cryptographic proof that the submitter controls
// the private key associated with the registered source.
// This is DISABLED until Bastion auth is integrated.
// ============================================

humint.post('/submit', async (c) => {
  // SECURITY: Submissions are disabled until Bastion auth is integrated
  return c.json({ 
    success: false, 
    error: 'HUMINT submissions require wallet signature verification. This feature is not yet available.',
    code: 'AUTH_NOT_CONFIGURED'
  }, 503);
  
  // ============================================
  // IMPLEMENTATION (to be enabled with Bastion):
  // ============================================
  /*
  try {
    const body = await c.req.json();
    const { 
      publicKey, 
      signature, 
      title, 
      content, 
      mediaUrls,
      locationRegion,
      locationCountry,
      eventTag,
      occurredAt,
      isTimeSensitive
    } = body;
    
    if (!publicKey || !signature || !title || !content) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    // Find source by public key
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.publicKey, publicKey))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Source not registered' }, 404);
    }
    
    // SECURITY: Verify signature proves ownership of private key
    // The signature must be over the content hash to prove:
    // 1. The submitter controls the private key for this source
    // 2. The content hasn't been tampered with
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ title, content, mediaUrls, occurredAt }))
      .digest('hex');
    
    const isValidSignature = await verifyEd25519Signature(publicKey, signature, contentHash);
    if (!isValidSignature) {
      return c.json({ success: false, error: 'Invalid signature' }, 401);
    }
    
    // SECURITY: Strip EXIF/metadata from media to protect source location
    const safeMediaUrls = await stripMediaMetadata(mediaUrls || []);
    
    // Create submission
    const [submission] = await db.insert(humintSubmissions)
      .values({
        sourceId: source.id,
        title,
        body: content,
        mediaUrls: safeMediaUrls,
        locationRegion: locationRegion?.toLowerCase(),
        locationCountry: locationCountry?.toLowerCase(),
        eventTag: eventTag?.toLowerCase(),
        occurredAt: occurredAt ? new Date(occurredAt) : null,
        isTimeSensitive: isTimeSensitive || false,
        contentHash,
        signature,
      })
      .returning();
    
    // Update source stats
    await db.update(humintSources)
      .set({
        totalSubmissions: sql`${humintSources.totalSubmissions} + 1`,
        lastActiveAt: new Date(),
      })
      .where(eq(humintSources.id, source.id));
    
    // Log submission (without content)
    console.log('HUMINT submission:', { 
      codename: source.codename, 
      submissionId: submission.id,
      region: locationRegion 
    });
    
    return c.json({
      success: true,
      data: {
        id: submission.id,
        title: submission.title,
        submittedAt: submission.submittedAt,
      }
    });
  } catch (error) {
    console.error('Submit intel error:', error);
    return c.json({ success: false, error: 'Submission failed' }, 500);
  }
  */
});

// Get submission by ID
humint.get('/submissions/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const [submission] = await db.select({
      id: humintSubmissions.id,
      title: humintSubmissions.title,
      body: humintSubmissions.body,
      mediaUrls: humintSubmissions.mediaUrls,
      locationRegion: humintSubmissions.locationRegion,
      locationCountry: humintSubmissions.locationCountry,
      eventTag: humintSubmissions.eventTag,
      occurredAt: humintSubmissions.occurredAt,
      isTimeSensitive: humintSubmissions.isTimeSensitive,
      verificationStatus: humintSubmissions.verificationStatus,
      verifiedCount: humintSubmissions.verifiedCount,
      contradictedCount: humintSubmissions.contradictedCount,
      neutralCount: humintSubmissions.neutralCount,
      submittedAt: humintSubmissions.submittedAt,
      contentHash: humintSubmissions.contentHash,
      sourceCodename: humintSources.codename,
      sourceReputation: humintSources.reputationScore,
    })
    .from(humintSubmissions)
    .innerJoin(humintSources, eq(humintSubmissions.sourceId, humintSources.id))
    .where(eq(humintSubmissions.id, id))
    .limit(1);
    
    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }
    
    return c.json({ success: true, data: submission });
  } catch (error) {
    console.error('Get submission error:', error);
    return c.json({ success: false, error: 'Failed to get submission' }, 500);
  }
});

// List submissions (filterable)
humint.get('/submissions', async (c) => {
  try {
    const {
      sourceCodename,
      region,
      country,
      eventTag,
      status,
      timeSensitive,
      sort = 'recent',
      limit = '20',
      offset = '0'
    } = c.req.query();
    
    let query = db.select({
      id: humintSubmissions.id,
      title: humintSubmissions.title,
      locationRegion: humintSubmissions.locationRegion,
      locationCountry: humintSubmissions.locationCountry,
      eventTag: humintSubmissions.eventTag,
      occurredAt: humintSubmissions.occurredAt,
      isTimeSensitive: humintSubmissions.isTimeSensitive,
      verificationStatus: humintSubmissions.verificationStatus,
      verifiedCount: humintSubmissions.verifiedCount,
      contradictedCount: humintSubmissions.contradictedCount,
      submittedAt: humintSubmissions.submittedAt,
      sourceCodename: humintSources.codename,
      sourceReputation: humintSources.reputationScore,
    })
    .from(humintSubmissions)
    .innerJoin(humintSources, eq(humintSubmissions.sourceId, humintSources.id))
    .$dynamic();
    
    const conditions = [];
    
    if (sourceCodename) {
      conditions.push(eq(humintSources.codename, sourceCodename.toUpperCase()));
    }
    if (region) {
      conditions.push(eq(humintSubmissions.locationRegion, region.toLowerCase()));
    }
    if (country) {
      conditions.push(eq(humintSubmissions.locationCountry, country.toLowerCase()));
    }
    if (eventTag) {
      conditions.push(eq(humintSubmissions.eventTag, eventTag.toLowerCase()));
    }
    if (status) {
      conditions.push(eq(humintSubmissions.verificationStatus, status));
    }
    if (timeSensitive === 'true') {
      conditions.push(eq(humintSubmissions.isTimeSensitive, true));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sort
    if (sort === 'recent') {
      query = query.orderBy(desc(humintSubmissions.submittedAt));
    } else if (sort === 'verified') {
      query = query.orderBy(desc(humintSubmissions.verifiedCount));
    }
    
    query = query.limit(parseInt(limit)).offset(parseInt(offset));
    
    const submissions = await query;
    
    return c.json({
      success: true,
      data: submissions,
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: submissions.length,
      }
    });
  } catch (error) {
    console.error('List submissions error:', error);
    return c.json({ success: false, error: 'Failed to list submissions' }, 500);
  }
});

// ============================================
// Ratings (Crowd Verification)
// ============================================

// Rate a submission (requires authenticated user)
humint.post('/submissions/:id/rate', requireAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const user = getUser(c)!;
    const body = await c.req.json();
    const { rating, evidenceUrl, comment } = body;
    
    if (!['verified', 'contradicted', 'neutral'].includes(rating)) {
      return c.json({ success: false, error: 'Invalid rating' }, 400);
    }
    
    // Check submission exists
    const [submission] = await db.select()
      .from(humintSubmissions)
      .where(eq(humintSubmissions.id, id))
      .limit(1);
    
    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }
    
    // Upsert rating
    await db.insert(submissionRatings)
      .values({
        submissionId: id,
        userId: user.id,
        rating,
        evidenceUrl: evidenceUrl || null,
        comment: comment || null,
      })
      .onConflictDoUpdate({
        target: [submissionRatings.submissionId, submissionRatings.userId],
        set: {
          rating,
          evidenceUrl: evidenceUrl || null,
          comment: comment || null,
          ratedAt: new Date(),
        }
      });
    
    // Recalculate counts
    const ratingCounts = await db.select({
      rating: submissionRatings.rating,
      count: sql<number>`count(*)::int`,
    })
    .from(submissionRatings)
    .where(eq(submissionRatings.submissionId, id))
    .groupBy(submissionRatings.rating);
    
    const counts = {
      verified: 0,
      contradicted: 0,
      neutral: 0,
    };
    ratingCounts.forEach(r => {
      counts[r.rating as keyof typeof counts] = r.count;
    });
    
    // Determine verification status
    let verificationStatus = 'unverified';
    if (counts.verified >= 3 && counts.verified > counts.contradicted * 2) {
      verificationStatus = 'verified';
    } else if (counts.contradicted >= 3 && counts.contradicted > counts.verified) {
      verificationStatus = 'contradicted';
    } else if (counts.verified > 0 || counts.contradicted > 0) {
      verificationStatus = 'disputed';
    }
    
    // Update submission
    await db.update(humintSubmissions)
      .set({
        verifiedCount: counts.verified,
        contradictedCount: counts.contradicted,
        neutralCount: counts.neutral,
        verificationStatus,
      })
      .where(eq(humintSubmissions.id, id));
    
    // Update source reputation
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.id, submission.sourceId))
      .limit(1);
    
    if (source) {
      // Recalculate source totals
      const sourceTotals = await db.select({
        verified: sql<number>`sum(verified_count)::int`,
        contradicted: sql<number>`sum(contradicted_count)::int`,
      })
      .from(humintSubmissions)
      .where(eq(humintSubmissions.sourceId, source.id));
      
      const newReputation = calculateReputation({
        totalSubmissions: source.totalSubmissions,
        verifiedCount: sourceTotals[0]?.verified || 0,
        contradictedCount: sourceTotals[0]?.contradicted || 0,
        createdAt: source.createdAt,
      });
      
      await db.update(humintSources)
        .set({
          verifiedCount: sourceTotals[0]?.verified || 0,
          contradictedCount: sourceTotals[0]?.contradicted || 0,
          reputationScore: newReputation,
        })
        .where(eq(humintSources.id, source.id));
    }
    
    return c.json({
      success: true,
      data: {
        verificationStatus,
        counts,
      }
    });
  } catch (error) {
    console.error('Rate submission error:', error);
    return c.json({ success: false, error: 'Rating failed' }, 500);
  }
});

// ============================================
// Subscriptions
// ============================================

// Subscribe to a source
humint.post('/sources/:codename/subscribe', requireAuth, async (c) => {
  try {
    const { codename } = c.req.param();
    const user = getUser(c)!;
    const body = await c.req.json();
    const { months = 1, paymentTxHash } = body;
    
    // Find source
    const [source] = await db.select()
      .from(humintSources)
      .where(eq(humintSources.codename, codename.toUpperCase()))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    if (!source.isAcceptingSubscribers) {
      return c.json({ success: false, error: 'Source not accepting subscribers' }, 400);
    }
    
    // TODO: Verify payment via NEAR RPC
    const amountPaid = (source.subscriptionPriceUsdc || 0) * months;
    
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
    
    // Upsert subscription
    await db.insert(sourceSubscriptions)
      .values({
        sourceId: source.id,
        subscriberId: user.id,
        expiresAt,
        amountPaidUsdc: amountPaid,
        paymentTxHash,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [sourceSubscriptions.sourceId, sourceSubscriptions.subscriberId],
        set: {
          expiresAt,
          amountPaidUsdc: sql`${sourceSubscriptions.amountPaidUsdc} + ${amountPaid}`,
          paymentTxHash,
          status: 'active',
        }
      });
    
    // Update subscriber count
    const [{ count }] = await db.select({
      count: sql<number>`count(*)::int`,
    })
    .from(sourceSubscriptions)
    .where(and(
      eq(sourceSubscriptions.sourceId, source.id),
      eq(sourceSubscriptions.status, 'active')
    ));
    
    await db.update(humintSources)
      .set({ subscriberCount: count })
      .where(eq(humintSources.id, source.id));
    
    return c.json({
      success: true,
      data: {
        codename: source.codename,
        expiresAt,
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return c.json({ success: false, error: 'Subscription failed' }, 500);
  }
});

// Get my subscriptions
humint.get('/subscriptions', requireAuth, async (c) => {
  try {
    const user = getUser(c)!;
    
    const subscriptions = await db.select({
      id: sourceSubscriptions.id,
      sourceCodename: humintSources.codename,
      sourceReputation: humintSources.reputationScore,
      startsAt: sourceSubscriptions.startsAt,
      expiresAt: sourceSubscriptions.expiresAt,
      status: sourceSubscriptions.status,
    })
    .from(sourceSubscriptions)
    .innerJoin(humintSources, eq(sourceSubscriptions.sourceId, humintSources.id))
    .where(eq(sourceSubscriptions.subscriberId, user.id))
    .orderBy(desc(sourceSubscriptions.expiresAt));
    
    return c.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return c.json({ success: false, error: 'Failed to get subscriptions' }, 500);
  }
});

// ============================================
// Payment System (1Click Cross-Chain)
// ============================================

// Get supported chains for payment
humint.get('/payment/chains', async (c) => {
  return c.json({
    success: true,
    data: SUPPORTED_CHAINS.map(chain => ({
      ...chain,
      hasUsdc: !!USDC_TOKEN_IDS[chain.id],
    }))
  });
});

// Get all supported tokens from 1Click
humint.get('/payment/tokens', async (c) => {
  try {
    const tokens = await getSupportedTokens();
    return c.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Get tokens error:', error);
    return c.json({ success: false, error: 'Failed to get tokens' }, 500);
  }
});

// Validate a payment address
humint.post('/payment/validate-address', async (c) => {
  try {
    const { address, chain } = await c.req.json();
    
    if (!address || !chain) {
      return c.json({ success: false, error: 'Address and chain required' }, 400);
    }
    
    const isValid = validateAddress(address, chain);
    
    return c.json({
      success: true,
      data: {
        address,
        chain,
        isValid,
        chainName: SUPPORTED_CHAINS.find(c => c.id === chain)?.name || chain,
      }
    });
  } catch (error) {
    console.error('Validate address error:', error);
    return c.json({ success: false, error: 'Validation failed' }, 500);
  }
});

// Get payment quote (preview cross-chain payment)
humint.post('/payment/quote', async (c) => {
  try {
    const { amountUsdc, recipientAddress, recipientChain, recipientTokenId } = await c.req.json();
    
    if (!amountUsdc || !recipientAddress || !recipientChain) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    if (!validateAddress(recipientAddress, recipientChain)) {
      return c.json({ success: false, error: 'Invalid address for chain' }, 400);
    }
    
    // Get dry quote (no commitment)
    const quote = await getPaymentQuote({
      amountUsdc,
      recipientAddress,
      recipientChain,
      recipientTokenId,
      refundAddress: process.env.ARGUS_TREASURY_ADDRESS || 'argus.near',
      dry: true,
    });
    
    return c.json({
      success: true,
      data: {
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        amountOutUsd: quote.amountOutUsd,
        estimatedTimeMs: quote.estimatedTimeMs,
        chain: recipientChain,
      }
    });
  } catch (error) {
    console.error('Payment quote error:', error);
    return c.json({ success: false, error: 'Failed to get quote' }, 500);
  }
});

// ============================================
// Payment Addresses (Source Management)
// ============================================
// SECURITY: Requires wallet signature verification.
// DISABLED until Bastion auth is integrated.
// ============================================

humint.post('/payment-address', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Payment address management requires wallet signature verification. This feature is not yet available.',
    code: 'AUTH_NOT_CONFIGURED'
  }, 503);
});

// Get payment addresses for a source (public - just shows chains, not addresses)
humint.get('/sources/:codename/payment-info', async (c) => {
  try {
    const { codename } = c.req.param();
    
    const [source] = await db.select({ id: humintSources.id })
      .from(humintSources)
      .where(eq(humintSources.codename, codename.toUpperCase()))
      .limit(1);
    
    if (!source) {
      return c.json({ success: false, error: 'Source not found' }, 404);
    }
    
    // Only return chain info, not actual addresses (privacy)
    const addresses = await db.select({
      chain: sourcePaymentAddresses.chain,
      isPrimary: sourcePaymentAddresses.isPrimary,
    })
    .from(sourcePaymentAddresses)
    .where(eq(sourcePaymentAddresses.sourceId, source.id));
    
    const supportedChains = addresses.map(a => ({
      chain: a.chain,
      chainName: SUPPORTED_CHAINS.find(c => c.id === a.chain)?.name || a.chain,
      isPrimary: a.isPrimary,
    }));
    
    return c.json({
      success: true,
      data: {
        codename,
        acceptsPayments: addresses.length > 0,
        supportedChains,
      }
    });
  } catch (error) {
    console.error('Get payment info error:', error);
    return c.json({ success: false, error: 'Failed to get payment info' }, 500);
  }
});

// Get payment status by deposit address
humint.get('/payment/status/:depositAddress', async (c) => {
  try {
    const { depositAddress } = c.req.param();
    
    // Check local DB first
    const [payment] = await db.select()
      .from(humintPayments)
      .where(eq(humintPayments.depositAddress, depositAddress))
      .limit(1);
    
    if (!payment) {
      return c.json({ success: false, error: 'Payment not found' }, 404);
    }
    
    // Get live status from 1Click
    try {
      const liveStatus = await getPaymentStatus(depositAddress);
      
      // Update local record if status changed
      if (liveStatus.status !== payment.status.toUpperCase()) {
        const newStatus = liveStatus.status.toLowerCase();
        await db.update(humintPayments)
          .set({
            status: newStatus,
            settlementTxHash: liveStatus.txHash || undefined,
            completedAt: ['success', 'failed', 'refunded'].includes(newStatus) ? new Date() : undefined,
          })
          .where(eq(humintPayments.id, payment.id));
      }
      
      return c.json({
        success: true,
        data: {
          ...payment,
          liveStatus: liveStatus.status,
          settlementTxHash: liveStatus.txHash,
        }
      });
    } catch (err) {
      // Return local status if 1Click fails
      return c.json({ success: true, data: payment });
    }
  } catch (error) {
    console.error('Get payment status error:', error);
    return c.json({ success: false, error: 'Failed to get status' }, 500);
  }
});

// ============================================
// Stats
// ============================================

humint.get('/stats', async (c) => {
  try {
    const [stats] = await db.select({
      totalSources: sql<number>`count(*)::int`,
      totalSubmissions: sql<number>`sum(total_submissions)::int`,
      avgReputation: sql<number>`avg(reputation_score)::int`,
    })
    .from(humintSources);
    
    const [submissionStats] = await db.select({
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where verification_status = 'verified')::int`,
      disputed: sql<number>`count(*) filter (where verification_status = 'disputed')::int`,
    })
    .from(humintSubmissions);
    
    return c.json({
      success: true,
      data: {
        sources: {
          total: stats?.totalSources || 0,
          avgReputation: stats?.avgReputation || 50,
        },
        submissions: {
          total: submissionStats?.total || 0,
          verified: submissionStats?.verified || 0,
          disputed: submissionStats?.disputed || 0,
        }
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ success: false, error: 'Failed to get stats' }, 500);
  }
});

export default humint;

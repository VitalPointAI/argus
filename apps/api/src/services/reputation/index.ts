/**
 * Source Reputation Service
 * 
 * Handles:
 * - User rating submission with anti-gaming measures
 * - Weighted rating calculation based on user trust scores
 * - Anomaly detection (sudden rating spikes, coordinated attacks)
 * - Reputation decay for stale sources
 * - Cross-reference accuracy tracking
 * - Reliability score updates with history
 */

import { db, sources, users, sourceRatings, reliabilityHistory, userRatingLimits, crossReferenceResults, ratingAnomalies, content, articleClaims } from '../../db';
import { eq, and, gte, lte, desc, sql, count, avg } from 'drizzle-orm';

// Configuration
const CONFIG = {
  // Rate limiting
  MAX_RATINGS_PER_DAY: 20,
  
  // Trust score weights
  MIN_TRUST_SCORE: 0.1,
  MAX_TRUST_SCORE: 3.0,
  NEW_USER_TRUST_SCORE: 1.0,
  
  // Anomaly detection thresholds
  SPIKE_THRESHOLD: 5, // 5+ ratings in 1 hour = suspicious
  SPIKE_WINDOW_HOURS: 1,
  COORDINATED_THRESHOLD: 0.8, // 80% same rating = suspicious
  MIN_RATINGS_FOR_ANOMALY: 10,
  
  // Decay settings
  STALE_DAYS: 30,
  DECAY_PER_WEEK: 2, // points per week after 30 days
  MAX_DECAY: 20, // never decay more than 20 points total
  
  // Score calculation weights
  WEIGHT_USER_RATINGS: 0.3,
  WEIGHT_CROSS_REFERENCE: 0.5,
  WEIGHT_CURRENT_SCORE: 0.2,
};

interface RatingResult {
  success: boolean;
  rating?: {
    id: string;
    rating: number;
    weight: number;
    isUpdate: boolean;
  };
  error?: string;
  warning?: string;
}

interface SourceReputation {
  sourceId: string;
  reliabilityScore: number;
  totalRatings: number;
  averageRating: number;
  weightedAverageRating: number;
  accurateClaims: number;
  totalClaimsVerified: number;
  accuracyRate: number;
  isStale: boolean;
  lastArticleAt: Date | null;
  recentRatings: Array<{
    id: string;
    rating: number;
    comment: string | null;
    userName: string;
    createdAt: Date;
  }>;
}

/**
 * Submit or update a user's rating for a source
 */
export async function rateSource(
  sourceId: string,
  userId: string,
  rating: number,
  comment?: string
): Promise<RatingResult> {
  // Validate rating
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, error: 'Rating must be an integer between 1 and 5' };
  }
  
  // Check source exists
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) {
    return { success: false, error: 'Source not found' };
  }
  
  // Get user with trust score
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  // Check rate limit
  const today = new Date().toISOString().split('T')[0];
  const [limitRecord] = await db.select()
    .from(userRatingLimits)
    .where(and(
      eq(userRatingLimits.userId, userId),
      sql`DATE(${userRatingLimits.date}) = ${today}`
    ))
    .limit(1);
  
  const currentCount = limitRecord?.ratingCount || 0;
  
  // Check if this is an update (updates don't count against limit)
  const [existingRating] = await db.select()
    .from(sourceRatings)
    .where(and(
      eq(sourceRatings.sourceId, sourceId),
      eq(sourceRatings.userId, userId)
    ))
    .limit(1);
  
  if (!existingRating && currentCount >= CONFIG.MAX_RATINGS_PER_DAY) {
    return { 
      success: false, 
      error: `Daily rating limit reached (${CONFIG.MAX_RATINGS_PER_DAY} per day)` 
    };
  }
  
  // Calculate weight based on user trust score
  const weight = Math.max(CONFIG.MIN_TRUST_SCORE, Math.min(CONFIG.MAX_TRUST_SCORE, user.trustScore));
  
  let resultRating;
  let isUpdate = false;
  
  if (existingRating) {
    // Update existing rating
    isUpdate = true;
    [resultRating] = await db.update(sourceRatings)
      .set({
        rating,
        comment: comment || null,
        weight,
        updatedAt: new Date(),
      })
      .where(eq(sourceRatings.id, existingRating.id))
      .returning();
  } else {
    // Insert new rating
    [resultRating] = await db.insert(sourceRatings)
      .values({
        sourceId,
        userId,
        rating,
        comment: comment || null,
        weight,
      })
      .returning();
    
    // Update rate limit counter
    if (limitRecord) {
      await db.update(userRatingLimits)
        .set({ ratingCount: currentCount + 1 })
        .where(eq(userRatingLimits.id, limitRecord.id));
    } else {
      await db.insert(userRatingLimits).values({
        userId,
        ratingCount: 1,
      });
    }
    
    // Update user's total ratings count
    await db.update(users)
      .set({ totalRatingsGiven: (user.totalRatingsGiven || 0) + 1 })
      .where(eq(users.id, userId));
  }
  
  // Check for anomalies
  const anomalyWarning = await detectAnomalies(sourceId);
  
  // Recalculate source reliability score
  await updateSourceReliabilityFromRatings(sourceId);
  
  return {
    success: true,
    rating: {
      id: resultRating.id,
      rating: resultRating.rating,
      weight: resultRating.weight,
      isUpdate,
    },
    warning: anomalyWarning || undefined,
  };
}

/**
 * Get ratings for a source with pagination
 */
export async function getSourceRatings(
  sourceId: string,
  limit = 20,
  offset = 0
): Promise<{
  ratings: Array<{
    id: string;
    rating: number;
    comment: string | null;
    weight: number;
    userName: string;
    createdAt: Date;
    isFlagged: boolean;
  }>;
  stats: {
    totalRatings: number;
    averageRating: number;
    weightedAverageRating: number;
    ratingDistribution: Record<number, number>;
  };
}> {
  // Get ratings with user names
  const ratings = await db.select({
    id: sourceRatings.id,
    rating: sourceRatings.rating,
    comment: sourceRatings.comment,
    weight: sourceRatings.weight,
    userName: users.name,
    createdAt: sourceRatings.createdAt,
    isFlagged: sourceRatings.isFlagged,
  })
    .from(sourceRatings)
    .leftJoin(users, eq(sourceRatings.userId, users.id))
    .where(eq(sourceRatings.sourceId, sourceId))
    .orderBy(desc(sourceRatings.createdAt))
    .limit(limit)
    .offset(offset);
  
  // Get stats (only non-flagged ratings)
  const [statsResult] = await db.select({
    totalRatings: count(sourceRatings.id),
    avgRating: avg(sourceRatings.rating),
    weightedSum: sql<number>`SUM(${sourceRatings.rating} * ${sourceRatings.weight})`,
    weightSum: sql<number>`SUM(${sourceRatings.weight})`,
  })
    .from(sourceRatings)
    .where(and(
      eq(sourceRatings.sourceId, sourceId),
      eq(sourceRatings.isFlagged, false)
    ));
  
  // Get rating distribution
  const distribution = await db.select({
    rating: sourceRatings.rating,
    count: count(sourceRatings.id),
  })
    .from(sourceRatings)
    .where(and(
      eq(sourceRatings.sourceId, sourceId),
      eq(sourceRatings.isFlagged, false)
    ))
    .groupBy(sourceRatings.rating);
  
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distribution.forEach(d => {
    ratingDistribution[d.rating] = Number(d.count);
  });
  
  const weightedAvg = statsResult.weightSum && Number(statsResult.weightSum) > 0
    ? Number(statsResult.weightedSum) / Number(statsResult.weightSum)
    : 0;
  
  return {
    ratings: ratings.map(r => ({
      ...r,
      userName: r.userName || 'Anonymous',
    })),
    stats: {
      totalRatings: Number(statsResult.totalRatings) || 0,
      averageRating: Number(statsResult.avgRating) || 0,
      weightedAverageRating: weightedAvg,
      ratingDistribution,
    },
  };
}

/**
 * Get full reputation data for a source
 */
export async function getSourceReputation(sourceId: string): Promise<SourceReputation | null> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) return null;
  
  const ratingsData = await getSourceRatings(sourceId, 5, 0);
  
  // Get cross-reference accuracy stats
  const [accuracyStats] = await db.select({
    totalClaims: count(crossReferenceResults.id),
    accurateClaims: sql<number>`SUM(CASE WHEN ${crossReferenceResults.wasAccurate} THEN 1 ELSE 0 END)`,
  })
    .from(crossReferenceResults)
    .where(eq(crossReferenceResults.sourceId, sourceId));
  
  const totalClaims = Number(accuracyStats?.totalClaims) || 0;
  const accurateClaims = Number(accuracyStats?.accurateClaims) || 0;
  
  const isStale = source.lastArticleAt 
    ? (Date.now() - new Date(source.lastArticleAt).getTime()) > CONFIG.STALE_DAYS * 24 * 60 * 60 * 1000
    : true;
  
  return {
    sourceId,
    reliabilityScore: source.reliabilityScore,
    totalRatings: ratingsData.stats.totalRatings,
    averageRating: ratingsData.stats.averageRating,
    weightedAverageRating: ratingsData.stats.weightedAverageRating,
    accurateClaims,
    totalClaimsVerified: totalClaims,
    accuracyRate: totalClaims > 0 ? accurateClaims / totalClaims : 0,
    isStale,
    lastArticleAt: source.lastArticleAt,
    recentRatings: ratingsData.ratings.slice(0, 5).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      userName: r.userName,
      createdAt: r.createdAt,
    })),
  };
}

/**
 * Detect anomalies in rating patterns
 */
async function detectAnomalies(sourceId: string): Promise<string | null> {
  const oneHourAgo = new Date(Date.now() - CONFIG.SPIKE_WINDOW_HOURS * 60 * 60 * 1000);
  
  // Check for rating spike
  const recentRatings = await db.select()
    .from(sourceRatings)
    .where(and(
      eq(sourceRatings.sourceId, sourceId),
      gte(sourceRatings.createdAt, oneHourAgo)
    ));
  
  if (recentRatings.length >= CONFIG.SPIKE_THRESHOLD) {
    // Check if ratings are coordinated (same rating from many users)
    const ratingCounts: Record<number, number> = {};
    recentRatings.forEach(r => {
      ratingCounts[r.rating] = (ratingCounts[r.rating] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(ratingCounts));
    const isCoordinated = maxCount / recentRatings.length >= CONFIG.COORDINATED_THRESHOLD;
    
    // Log the anomaly
    const anomalyType = isCoordinated ? 'coordinated' : 'spike';
    
    await db.insert(ratingAnomalies).values({
      sourceId,
      anomalyType,
      details: {
        recentCount: recentRatings.length,
        ratingDistribution: ratingCounts,
        detectedAt: new Date().toISOString(),
      },
      affectedRatingIds: recentRatings.map(r => r.id),
    });
    
    // Flag the recent ratings for review
    if (isCoordinated) {
      const mostCommonRating = Number(Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])[0][0]);
      
      for (const r of recentRatings.filter(r => r.rating === mostCommonRating)) {
        await db.update(sourceRatings)
          .set({ isFlagged: true, flagReason: `Part of ${anomalyType} pattern` })
          .where(eq(sourceRatings.id, r.id));
      }
      
      return `Warning: Coordinated rating pattern detected. Some ratings have been flagged for review.`;
    }
    
    return `Notice: Unusual rating activity detected for this source.`;
  }
  
  return null;
}

/**
 * Update source reliability score based on ratings
 */
async function updateSourceReliabilityFromRatings(sourceId: string): Promise<void> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) return;
  
  const oldScore = source.reliabilityScore;
  
  // Get weighted average of non-flagged ratings
  const [ratingStats] = await db.select({
    weightedSum: sql<number>`SUM(${sourceRatings.rating} * ${sourceRatings.weight})`,
    weightSum: sql<number>`SUM(${sourceRatings.weight})`,
    count: count(sourceRatings.id),
  })
    .from(sourceRatings)
    .where(and(
      eq(sourceRatings.sourceId, sourceId),
      eq(sourceRatings.isFlagged, false)
    ));
  
  // Get cross-reference accuracy
  const [accuracyStats] = await db.select({
    totalClaims: count(crossReferenceResults.id),
    accurateClaims: sql<number>`SUM(CASE WHEN ${crossReferenceResults.wasAccurate} THEN 1 ELSE 0 END)`,
  })
    .from(crossReferenceResults)
    .where(eq(crossReferenceResults.sourceId, sourceId));
  
  let newScore = oldScore;
  
  // Calculate new score if we have data
  if (Number(ratingStats.count) > 0 || Number(accuracyStats.totalClaims) > 0) {
    // User rating component (scale 1-5 to 0-100)
    const ratingScore = Number(ratingStats.weightSum) > 0
      ? (Number(ratingStats.weightedSum) / Number(ratingStats.weightSum)) * 20 // 1-5 -> 20-100
      : null;
    
    // Cross-reference accuracy component (0-100)
    const accuracyScore = Number(accuracyStats.totalClaims) > 0
      ? (Number(accuracyStats.accurateClaims) / Number(accuracyStats.totalClaims)) * 100
      : null;
    
    // Weighted combination
    let totalWeight = 0;
    let weightedScore = 0;
    
    if (ratingScore !== null) {
      weightedScore += ratingScore * CONFIG.WEIGHT_USER_RATINGS;
      totalWeight += CONFIG.WEIGHT_USER_RATINGS;
    }
    
    if (accuracyScore !== null) {
      weightedScore += accuracyScore * CONFIG.WEIGHT_CROSS_REFERENCE;
      totalWeight += CONFIG.WEIGHT_CROSS_REFERENCE;
    }
    
    // Always include current score weight for stability
    weightedScore += oldScore * CONFIG.WEIGHT_CURRENT_SCORE;
    totalWeight += CONFIG.WEIGHT_CURRENT_SCORE;
    
    newScore = Math.round(weightedScore / totalWeight * 10) / 10;
    
    // Clamp to 0-100
    newScore = Math.max(0, Math.min(100, newScore));
  }
  
  // Only update if score changed
  if (Math.abs(newScore - oldScore) > 0.1) {
    await db.update(sources)
      .set({ reliabilityScore: newScore })
      .where(eq(sources.id, sourceId));
    
    // Log history
    await db.insert(reliabilityHistory).values({
      sourceId,
      oldScore,
      newScore,
      changeReason: 'user_rating',
      changeMetadata: {
        ratingCount: Number(ratingStats.count),
        accuracyClaims: Number(accuracyStats.totalClaims),
      },
    });
  }
}

/**
 * Apply reputation decay to stale sources
 * Should be run periodically (e.g., daily via cron)
 */
export async function applyReputationDecay(): Promise<{
  processed: number;
  decayed: number;
  details: Array<{ sourceId: string; name: string; oldScore: number; newScore: number }>;
}> {
  const staleDate = new Date(Date.now() - CONFIG.STALE_DAYS * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Find sources that are stale and haven't had decay applied this week
  const staleSources = await db.select()
    .from(sources)
    .where(and(
      lte(sources.lastArticleAt, staleDate),
      sql`(${sources.decayAppliedAt} IS NULL OR ${sources.decayAppliedAt} < ${oneWeekAgo})`
    ));
  
  const details: Array<{ sourceId: string; name: string; oldScore: number; newScore: number }> = [];
  
  for (const source of staleSources) {
    const oldScore = source.reliabilityScore;
    
    // Calculate decay amount based on how long it's been stale
    const daysSinceLastArticle = source.lastArticleAt 
      ? (Date.now() - new Date(source.lastArticleAt).getTime()) / (24 * 60 * 60 * 1000)
      : CONFIG.STALE_DAYS + 7; // Assume at least a week stale if no lastArticleAt
    
    const weeksStale = Math.floor((daysSinceLastArticle - CONFIG.STALE_DAYS) / 7);
    const totalDecay = Math.min(CONFIG.MAX_DECAY, weeksStale * CONFIG.DECAY_PER_WEEK);
    
    // Calculate new score (minimum of 10)
    const newScore = Math.max(10, oldScore - CONFIG.DECAY_PER_WEEK);
    
    if (newScore < oldScore) {
      await db.update(sources)
        .set({ 
          reliabilityScore: newScore,
          decayAppliedAt: new Date(),
        })
        .where(eq(sources.id, source.id));
      
      await db.insert(reliabilityHistory).values({
        sourceId: source.id,
        oldScore,
        newScore,
        changeReason: 'decay',
        changeMetadata: {
          daysSinceLastArticle: Math.round(daysSinceLastArticle),
          weeksStale,
          decayApplied: CONFIG.DECAY_PER_WEEK,
        },
      });
      
      details.push({
        sourceId: source.id,
        name: source.name,
        oldScore,
        newScore,
      });
    }
  }
  
  return {
    processed: staleSources.length,
    decayed: details.length,
    details,
  };
}

/**
 * Record a cross-reference verification result
 */
export async function recordCrossReference(
  sourceId: string,
  contentId: string,
  wasAccurate: boolean,
  verificationSource: string,
  confidence: number = 0.5,
  claimId?: string
): Promise<void> {
  await db.insert(crossReferenceResults).values({
    sourceId,
    contentId,
    claimId: claimId || null,
    wasAccurate,
    verificationSource,
    confidence: Math.max(0, Math.min(1, confidence)),
  });
  
  // Update source reliability based on new cross-reference data
  await updateSourceReliabilityFromRatings(sourceId);
}

/**
 * Update user trust score based on their rating accuracy
 * Called when we determine if a user's past ratings were accurate
 */
export async function updateUserTrustScore(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;
  
  // Trust score is based on ratio of accurate ratings
  // New users start at 1.0, can go from 0.1 to 3.0
  if (user.totalRatingsGiven > 0) {
    const accuracyRatio = user.accurateRatings / user.totalRatingsGiven;
    const newTrustScore = CONFIG.MIN_TRUST_SCORE + 
      (CONFIG.MAX_TRUST_SCORE - CONFIG.MIN_TRUST_SCORE) * accuracyRatio;
    
    await db.update(users)
      .set({ trustScore: Math.round(newTrustScore * 100) / 100 })
      .where(eq(users.id, userId));
  }
}

/**
 * Get reliability history for a source
 */
export async function getReliabilityHistory(
  sourceId: string,
  limit = 50
): Promise<Array<{
  id: string;
  oldScore: number;
  newScore: number;
  changeReason: string;
  changeMetadata: unknown;
  changedAt: Date;
}>> {
  return db.select()
    .from(reliabilityHistory)
    .where(eq(reliabilityHistory.sourceId, sourceId))
    .orderBy(desc(reliabilityHistory.changedAt))
    .limit(limit);
}

/**
 * Update lastArticleAt timestamp when new content is ingested
 */
export async function recordNewArticle(sourceId: string): Promise<void> {
  await db.update(sources)
    .set({ lastArticleAt: new Date() })
    .where(eq(sources.id, sourceId));
}

import { Hono } from 'hono';
import { db } from '../db';
import { 
  sourceLists, 
  sourceListPackages, 
  sourceListSubscriptions,
  creatorPayoutSettings,
  creatorEarnings,
  sourceListReviews,
  users,
  domains
} from '../db/schema';
import { eq, and, desc, asc, gte, lte, sql, or, ilike } from 'drizzle-orm';
import { getMarketplaceFeePercent, isMarketplaceEnabled, getPlatformSettings } from '../services/platform/settings';

const app = new Hono();

// ============ Platform Info ============

// Get marketplace settings (public)
app.get('/settings', async (c) => {
  try {
    const settings = await getPlatformSettings();
    const enabled = await isMarketplaceEnabled();
    
    return c.json({
      success: true,
      data: {
        feePercent: settings.marketplace_fee_percent || 5,
        minWithdrawalUsdc: settings.min_withdrawal_usdc || 10,
        enabled,
      }
    });
  } catch (error) {
    console.error('Marketplace settings error:', error);
    return c.json({ success: false, error: 'Failed to fetch settings' }, 500);
  }
});

// ============ Public Marketplace ============

// Browse marketplace listings
app.get('/listings', async (c) => {
  try {
    const { 
      domain, 
      minPrice, 
      maxPrice, 
      sort = 'popular',
      search,
      limit = '20',
      offset = '0'
    } = c.req.query();

    // Use raw SQL to avoid Drizzle select field issues with nullable joins
    // Note: source_lists uses user_id not created_by, and has no domain_id column
    const listings = await db.execute(sql`
      SELECT 
        sl.id,
        sl.name,
        COALESCE(sl.description, '') as description,
        COALESCE(sl.marketplace_description, '') as "marketplaceDescription",
        sl.marketplace_image_cid as "marketplaceImageCid",
        sl.is_public as "isPublic",
        sl.user_id as "createdBy",
        u.name as "creatorName",
        COALESCE(sl.total_subscribers, 0) as "totalSubscribers",
        COALESCE(sl.total_revenue_usdc, 0)::float as "totalRevenueUsdc",
        COALESCE(sl.avg_rating, 0)::float as "avgRating",
        COALESCE(sl.rating_count, 0) as "ratingCount",
        sl.created_at as "createdAt",
        (SELECT MIN(price_usdc) FROM source_list_packages WHERE source_list_id = sl.id AND is_active = true) as "minPackagePrice"
      FROM source_lists sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.is_marketplace_listed = true
        AND EXISTS (SELECT 1 FROM source_list_packages WHERE source_list_id = sl.id AND is_active = true)
        ${search ? sql`AND (sl.name ILIKE ${'%' + search + '%'} OR sl.marketplace_description ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY ${sort === 'newest' ? sql`sl.created_at DESC` : 
                sort === 'rating' ? sql`sl.avg_rating DESC NULLS LAST` :
                sort === 'price-low' ? sql`(SELECT MIN(price_usdc) FROM source_list_packages WHERE source_list_id = sl.id AND is_active = true) ASC NULLS LAST` :
                sort === 'price-high' ? sql`(SELECT MIN(price_usdc) FROM source_list_packages WHERE source_list_id = sl.id AND is_active = true) DESC NULLS LAST` :
                sql`sl.total_subscribers DESC NULLS LAST`}
      LIMIT ${parseInt(limit)}
      OFFSET ${parseInt(offset)}
    `);

    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM source_lists 
      WHERE is_marketplace_listed = true
        AND EXISTS (SELECT 1 FROM source_list_packages WHERE source_list_id = source_lists.id AND is_active = true)
    `);

    // Handle different response formats from db.execute
    const listingData = Array.isArray(listings) ? listings : (listings.rows || []);
    const countData = Array.isArray(countResult) ? countResult : (countResult.rows || []);
    const totalCount = countData[0]?.count ? parseInt(String(countData[0].count)) : 0;

    return c.json({
      success: true,
      data: listingData,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
      }
    });
  } catch (error) {
    console.error('Marketplace listings error:', error);
    return c.json({ success: false, error: 'Failed to fetch listings' }, 500);
  }
});

// Get single listing details with packages
app.get('/listings/:listId', async (c) => {
  try {
    const listId = c.req.param('listId');

    const [listing] = await db
      .select({
        id: sourceLists.id,
        name: sourceLists.name,
        description: sourceLists.description,
        marketplaceDescription: sql<string>`source_lists.marketplace_description`,
        marketplaceImageCid: sql<string>`source_lists.marketplace_image_cid`,
        domainId: sourceLists.domainId,
        domainName: domains.name,
        createdBy: sourceLists.createdBy,
        creatorName: users.name,
        totalSubscribers: sql<number>`COALESCE(source_lists.total_subscribers, 0)`,
        avgRating: sql<number>`COALESCE(source_lists.avg_rating, 0)`,
        ratingCount: sql<number>`COALESCE(source_lists.rating_count, 0)`,
        itemCount: sourceLists.itemCount,
        createdAt: sourceLists.createdAt,
      })
      .from(sourceLists)
      .leftJoin(domains, eq(sourceLists.domainId, domains.id))
      .leftJoin(users, eq(sourceLists.createdBy, users.id))
      .where(eq(sourceLists.id, listId));

    if (!listing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    // Get packages
    const packages = await db
      .select()
      .from(sourceListPackages)
      .where(and(
        eq(sourceListPackages.sourceListId, listId),
        eq(sourceListPackages.isActive, true)
      ))
      .orderBy(asc(sourceListPackages.priceUsdc));

    // Get recent reviews
    const reviews = await db
      .select({
        id: sourceListReviews.id,
        rating: sourceListReviews.rating,
        reviewText: sourceListReviews.reviewText,
        reviewerName: users.name,
        createdAt: sourceListReviews.createdAt,
      })
      .from(sourceListReviews)
      .leftJoin(users, eq(sourceListReviews.reviewerId, users.id))
      .where(eq(sourceListReviews.sourceListId, listId))
      .orderBy(desc(sourceListReviews.createdAt))
      .limit(10);

    return c.json({
      success: true,
      data: {
        ...listing,
        packages,
        reviews,
      }
    });
  } catch (error) {
    console.error('Listing details error:', error);
    return c.json({ success: false, error: 'Failed to fetch listing' }, 500);
  }
});

// ============ Creator Package Management ============

// Get my packages for a source list
app.get('/lists/:listId/packages', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const listId = c.req.param('listId');

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // Verify ownership
    const [list] = await db
      .select()
      .from(sourceLists)
      .where(and(
        eq(sourceLists.id, listId),
        eq(sourceLists.createdBy, userId)
      ));

    if (!list) {
      return c.json({ success: false, error: 'List not found or not owned' }, 404);
    }

    const packages = await db
      .select()
      .from(sourceListPackages)
      .where(eq(sourceListPackages.sourceListId, listId))
      .orderBy(asc(sourceListPackages.priceUsdc));

    return c.json({ success: true, data: packages });
  } catch (error) {
    console.error('Get packages error:', error);
    return c.json({ success: false, error: 'Failed to fetch packages' }, 500);
  }
});

// Create a new package
app.post('/lists/:listId/packages', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const listId = c.req.param('listId');

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { name, description, imageCid, priceUsdc, durationDays, benefits, maxSupply } = body;

    if (!name || priceUsdc === undefined) {
      return c.json({ success: false, error: 'Name and price required' }, 400);
    }

    // Verify ownership
    const [list] = await db
      .select()
      .from(sourceLists)
      .where(and(
        eq(sourceLists.id, listId),
        eq(sourceLists.createdBy, userId)
      ));

    if (!list) {
      return c.json({ success: false, error: 'List not found or not owned' }, 404);
    }

    const [pkg] = await db
      .insert(sourceListPackages)
      .values({
        sourceListId: listId,
        creatorId: userId,
        name,
        description,
        imageCid,
        priceUsdc: parseFloat(priceUsdc),
        durationDays: durationDays ? parseInt(durationDays) : null,
        benefits: benefits || [],
        maxSupply: maxSupply ? parseInt(maxSupply) : null,
      })
      .returning();

    // Auto-list on marketplace if first package
    await db
      .update(sourceLists)
      .set({ 
        // @ts-ignore - column exists from migration
        is_marketplace_listed: true 
      })
      .where(eq(sourceLists.id, listId));

    return c.json({ success: true, data: pkg });
  } catch (error) {
    console.error('Create package error:', error);
    return c.json({ success: false, error: 'Failed to create package' }, 500);
  }
});

// Update a package
app.patch('/packages/:packageId', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const packageId = c.req.param('packageId');

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();

    // Verify ownership
    const [pkg] = await db
      .select()
      .from(sourceListPackages)
      .where(and(
        eq(sourceListPackages.id, packageId),
        eq(sourceListPackages.creatorId, userId)
      ));

    if (!pkg) {
      return c.json({ success: false, error: 'Package not found or not owned' }, 404);
    }

    const updates: any = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.imageCid !== undefined) updates.imageCid = body.imageCid;
    if (body.priceUsdc !== undefined) updates.priceUsdc = parseFloat(body.priceUsdc);
    if (body.durationDays !== undefined) updates.durationDays = body.durationDays ? parseInt(body.durationDays) : null;
    if (body.benefits !== undefined) updates.benefits = body.benefits;
    if (body.maxSupply !== undefined) updates.maxSupply = body.maxSupply ? parseInt(body.maxSupply) : null;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(sourceListPackages)
      .set(updates)
      .where(eq(sourceListPackages.id, packageId))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update package error:', error);
    return c.json({ success: false, error: 'Failed to update package' }, 500);
  }
});

// Delete a package (soft delete - set inactive)
app.delete('/packages/:packageId', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const packageId = c.req.param('packageId');

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const [pkg] = await db
      .select()
      .from(sourceListPackages)
      .where(and(
        eq(sourceListPackages.id, packageId),
        eq(sourceListPackages.creatorId, userId)
      ));

    if (!pkg) {
      return c.json({ success: false, error: 'Package not found or not owned' }, 404);
    }

    await db
      .update(sourceListPackages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(sourceListPackages.id, packageId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete package error:', error);
    return c.json({ success: false, error: 'Failed to delete package' }, 500);
  }
});

// ============ Subscription & Payment ============

// Subscribe to a package (mint NFT)
app.post('/subscribe', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { packageId, paymentTxHash, paymentToken } = body;

    if (!packageId) {
      return c.json({ success: false, error: 'Package ID required' }, 400);
    }

    // Get package details
    const [pkg] = await db
      .select()
      .from(sourceListPackages)
      .where(and(
        eq(sourceListPackages.id, packageId),
        eq(sourceListPackages.isActive, true)
      ));

    if (!pkg) {
      return c.json({ success: false, error: 'Package not found' }, 404);
    }

    // Check supply
    if (pkg.maxSupply && pkg.mintedCount >= pkg.maxSupply) {
      return c.json({ success: false, error: 'Package sold out' }, 400);
    }

    // Check if already subscribed with valid subscription
    const existing = await db
      .select()
      .from(sourceListSubscriptions)
      .where(and(
        eq(sourceListSubscriptions.sourceListId, pkg.sourceListId),
        eq(sourceListSubscriptions.subscriberId, userId),
        eq(sourceListSubscriptions.status, 'active'),
        or(
          sql`expires_at IS NULL`,
          gte(sourceListSubscriptions.expiresAt, new Date())
        )
      ));

    if (existing.length > 0) {
      return c.json({ success: false, error: 'Already subscribed' }, 400);
    }

    // Calculate expiry
    const expiresAt = pkg.durationDays 
      ? new Date(Date.now() + pkg.durationDays * 24 * 60 * 60 * 1000)
      : null;

    // Create subscription
    const [subscription] = await db
      .insert(sourceListSubscriptions)
      .values({
        packageId,
        sourceListId: pkg.sourceListId,
        subscriberId: userId,
        expiresAt,
        pricePaidUsdc: pkg.priceUsdc,
        paymentTxHash,
        paymentToken,
        status: 'active',
      })
      .returning();

    // Update package minted count
    await db
      .update(sourceListPackages)
      .set({ mintedCount: sql`minted_count + 1` })
      .where(eq(sourceListPackages.id, packageId));

    // Update list subscriber count
    await db
      .update(sourceLists)
      .set({ 
        // @ts-ignore
        total_subscribers: sql`COALESCE(total_subscribers, 0) + 1`,
        total_revenue_usdc: sql`COALESCE(total_revenue_usdc, 0) + ${pkg.priceUsdc}`,
      })
      .where(eq(sourceLists.id, pkg.sourceListId));

    // Record earnings with dynamic platform fee
    const feePercent = await getMarketplaceFeePercent();
    const platformFee = pkg.priceUsdc * (feePercent / 100);
    const netAmount = pkg.priceUsdc - platformFee;

    await db.insert(creatorEarnings).values({
      creatorId: pkg.creatorId,
      subscriptionId: subscription.id,
      grossAmountUsdc: pkg.priceUsdc,
      platformFeeUsdc: platformFee,
      netAmountUsdc: netAmount,
      txHash: paymentTxHash,
    });

    return c.json({ 
      success: true, 
      data: subscription,
      message: 'Subscription created successfully'
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return c.json({ success: false, error: 'Failed to subscribe' }, 500);
  }
});

// Check access to a source list
app.get('/access/:listId', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const listId = c.req.param('listId');

    if (!userId) {
      return c.json({ success: false, hasAccess: false });
    }

    // Check for valid subscription
    const [subscription] = await db
      .select()
      .from(sourceListSubscriptions)
      .where(and(
        eq(sourceListSubscriptions.sourceListId, listId),
        eq(sourceListSubscriptions.subscriberId, userId),
        eq(sourceListSubscriptions.status, 'active'),
        or(
          sql`expires_at IS NULL`,
          gte(sourceListSubscriptions.expiresAt, new Date())
        )
      ));

    // Also check if user is the owner
    const [list] = await db
      .select()
      .from(sourceLists)
      .where(and(
        eq(sourceLists.id, listId),
        eq(sourceLists.createdBy, userId)
      ));

    const hasAccess = !!subscription || !!list;

    return c.json({
      success: true,
      hasAccess,
      subscription: subscription || null,
      isOwner: !!list,
    });
  } catch (error) {
    console.error('Access check error:', error);
    return c.json({ success: false, hasAccess: false });
  }
});

// Get my subscriptions
app.get('/my-subscriptions', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const subscriptions = await db
      .select({
        id: sourceListSubscriptions.id,
        sourceListId: sourceListSubscriptions.sourceListId,
        listName: sourceLists.name,
        packageName: sourceListPackages.name,
        startsAt: sourceListSubscriptions.startsAt,
        expiresAt: sourceListSubscriptions.expiresAt,
        pricePaidUsdc: sourceListSubscriptions.pricePaidUsdc,
        status: sourceListSubscriptions.status,
        createdAt: sourceListSubscriptions.createdAt,
      })
      .from(sourceListSubscriptions)
      .leftJoin(sourceLists, eq(sourceListSubscriptions.sourceListId, sourceLists.id))
      .leftJoin(sourceListPackages, eq(sourceListSubscriptions.packageId, sourceListPackages.id))
      .where(eq(sourceListSubscriptions.subscriberId, userId))
      .orderBy(desc(sourceListSubscriptions.createdAt));

    return c.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('My subscriptions error:', error);
    return c.json({ success: false, error: 'Failed to fetch subscriptions' }, 500);
  }
});

// ============ Creator Earnings ============

// Get my earnings
app.get('/my-earnings', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // Get total earnings
    const [totals] = await db
      .select({
        totalGross: sql<number>`COALESCE(SUM(gross_amount_usdc), 0)`,
        totalFees: sql<number>`COALESCE(SUM(platform_fee_usdc), 0)`,
        totalNet: sql<number>`COALESCE(SUM(net_amount_usdc), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(creatorEarnings)
      .where(eq(creatorEarnings.creatorId, userId));

    // Get recent transactions
    const transactions = await db
      .select({
        id: creatorEarnings.id,
        grossAmountUsdc: creatorEarnings.grossAmountUsdc,
        platformFeeUsdc: creatorEarnings.platformFeeUsdc,
        netAmountUsdc: creatorEarnings.netAmountUsdc,
        txHash: creatorEarnings.txHash,
        listName: sourceLists.name,
        packageName: sourceListPackages.name,
        createdAt: creatorEarnings.createdAt,
      })
      .from(creatorEarnings)
      .leftJoin(sourceListSubscriptions, eq(creatorEarnings.subscriptionId, sourceListSubscriptions.id))
      .leftJoin(sourceLists, eq(sourceListSubscriptions.sourceListId, sourceLists.id))
      .leftJoin(sourceListPackages, eq(sourceListSubscriptions.packageId, sourceListPackages.id))
      .where(eq(creatorEarnings.creatorId, userId))
      .orderBy(desc(creatorEarnings.createdAt))
      .limit(50);

    return c.json({
      success: true,
      data: {
        totals,
        transactions,
      }
    });
  } catch (error) {
    console.error('My earnings error:', error);
    return c.json({ success: false, error: 'Failed to fetch earnings' }, 500);
  }
});

// ============ Payout Settings ============

// Get my payout settings
app.get('/payout-settings', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const [settings] = await db
      .select()
      .from(creatorPayoutSettings)
      .where(eq(creatorPayoutSettings.userId, userId));

    return c.json({ success: true, data: settings || null });
  } catch (error) {
    console.error('Get payout settings error:', error);
    return c.json({ success: false, error: 'Failed to fetch settings' }, 500);
  }
});

// Update payout settings
app.put('/payout-settings', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { payoutWallet } = body;

    if (!payoutWallet) {
      return c.json({ success: false, error: 'Payout wallet required' }, 400);
    }

    // Upsert
    const existing = await db
      .select()
      .from(creatorPayoutSettings)
      .where(eq(creatorPayoutSettings.userId, userId));

    let settings;
    if (existing.length > 0) {
      [settings] = await db
        .update(creatorPayoutSettings)
        .set({ payoutWallet, updatedAt: new Date() })
        .where(eq(creatorPayoutSettings.userId, userId))
        .returning();
    } else {
      [settings] = await db
        .insert(creatorPayoutSettings)
        .values({ userId, payoutWallet })
        .returning();
    }

    return c.json({ success: true, data: settings });
  } catch (error) {
    console.error('Update payout settings error:', error);
    return c.json({ success: false, error: 'Failed to update settings' }, 500);
  }
});

// ============ Listing Settings ============

// Update marketplace listing settings (cover image, description)
app.patch('/listings/:listId', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    const listId = c.req.param('listId');

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { marketplaceDescription, marketplaceImageCid } = body;

    // Verify ownership
    const [list] = await db
      .select()
      .from(sourceLists)
      .where(and(
        eq(sourceLists.id, listId),
        eq(sourceLists.createdBy, userId)
      ));

    if (!list) {
      return c.json({ success: false, error: 'List not found or not owned' }, 404);
    }

    // Update the listing settings using raw SQL for columns not in schema
    await db.execute(sql`
      UPDATE source_lists 
      SET 
        marketplace_description = COALESCE(${marketplaceDescription}, marketplace_description),
        marketplace_image_cid = COALESCE(${marketplaceImageCid}, marketplace_image_cid),
        updated_at = NOW()
      WHERE id = ${listId}
    `);

    return c.json({ 
      success: true, 
      data: {
        marketplaceDescription,
        marketplaceImageCid,
      }
    });
  } catch (error) {
    console.error('Update listing error:', error);
    return c.json({ success: false, error: 'Failed to update listing' }, 500);
  }
});

// ============ Reviews ============

// Add review
app.post('/reviews', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { sourceListId, rating, reviewText } = body;

    if (!sourceListId || !rating) {
      return c.json({ success: false, error: 'Source list ID and rating required' }, 400);
    }

    if (rating < 1 || rating > 5) {
      return c.json({ success: false, error: 'Rating must be 1-5' }, 400);
    }

    // Check if user has/had subscription
    const [subscription] = await db
      .select()
      .from(sourceListSubscriptions)
      .where(and(
        eq(sourceListSubscriptions.sourceListId, sourceListId),
        eq(sourceListSubscriptions.subscriberId, userId)
      ));

    if (!subscription) {
      return c.json({ success: false, error: 'Must be a subscriber to review' }, 400);
    }

    // Upsert review
    const existing = await db
      .select()
      .from(sourceListReviews)
      .where(and(
        eq(sourceListReviews.sourceListId, sourceListId),
        eq(sourceListReviews.reviewerId, userId)
      ));

    let review;
    if (existing.length > 0) {
      [review] = await db
        .update(sourceListReviews)
        .set({ rating, reviewText, updatedAt: new Date() })
        .where(and(
          eq(sourceListReviews.sourceListId, sourceListId),
          eq(sourceListReviews.reviewerId, userId)
        ))
        .returning();
    } else {
      [review] = await db
        .insert(sourceListReviews)
        .values({
          sourceListId,
          reviewerId: userId,
          subscriptionId: subscription.id,
          rating,
          reviewText,
        })
        .returning();
    }

    // Update average rating
    const [avgResult] = await db
      .select({
        avg: sql<number>`AVG(rating)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sourceListReviews)
      .where(eq(sourceListReviews.sourceListId, sourceListId));

    await db
      .update(sourceLists)
      .set({
        // @ts-ignore
        avg_rating: avgResult.avg,
        rating_count: avgResult.count,
      })
      .where(eq(sourceLists.id, sourceListId));

    return c.json({ success: true, data: review });
  } catch (error) {
    console.error('Add review error:', error);
    return c.json({ success: false, error: 'Failed to add review' }, 500);
  }
});

// ============ 1Click Payment Integration ============

import { getPaymentQuote, getPaymentStatus, USDC_TOKEN_IDS } from '../services/payments/one-click';

// Get payment quote for marketplace subscription
app.post('/payment/quote', async (c) => {
  try {
    const user = c.get('user') as any; const userId = user?.id;
    if (!userId) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const { amountUsdc, recipientNear } = await c.req.json();

    if (!amountUsdc || !recipientNear) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    // Get user's NEAR account for refund
    const [userRecord] = await db
      .select({ nearAccountId: users.nearAccountId })
      .from(users)
      .where(eq(users.id, userId));

    const refundAddress = userRecord?.nearAccountId || 'argus-intel.near'; // Fallback to platform wallet

    const quote = await getPaymentQuote({
      amountUsdc: parseFloat(amountUsdc),
      recipientAddress: recipientNear,
      recipientChain: 'near',
      refundAddress,
      dry: false,
    });

    return c.json({
      success: true,
      quote: {
        quoteId: quote.quoteId,
        depositAddress: quote.depositAddress,
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        deadline: quote.deadline,
        estimatedTimeMs: quote.estimatedTimeMs,
      },
    });
  } catch (error) {
    console.error('Payment quote error:', error);
    return c.json({ success: false, error: 'Failed to get payment quote' }, 500);
  }
});

// Check payment status
app.get('/payment/status/:depositAddress', async (c) => {
  try {
    const depositAddress = c.req.param('depositAddress');
    
    const status = await getPaymentStatus(depositAddress);
    
    return c.json({
      success: true,
      status: status.status,
      txHash: status.txHash,
      amountIn: status.amountIn,
      amountOut: status.amountOut,
      error: status.error,
    });
  } catch (error) {
    console.error('Payment status error:', error);
    return c.json({ success: false, error: 'Failed to check payment status' }, 500);
  }
});

export default app;

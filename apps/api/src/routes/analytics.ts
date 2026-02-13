/**
 * Analytics Routes
 * 
 * Platform metrics, leaderboards, and visualizations data
 */

import { Hono } from 'hono';
import { db } from '../db';
import { 
  sourceLists, 
  sourceListSubscriptions, 
  users,
  content,
  sources,
  briefings
} from '../db/schema';
import { eq, desc, count, sum, sql, gte, and } from 'drizzle-orm';

const app = new Hono();

/**
 * Platform overview stats
 * GET /analytics/overview
 */
app.get('/overview', async (c) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total counts
    const [totalLists] = await db.select({ count: count() }).from(sourceLists);
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [totalSources] = await db.select({ count: count() }).from(sources);
    const [totalArticles] = await db.select({ count: count() }).from(content);
    const [totalBriefings] = await db.select({ count: count() }).from(briefings);
    
    // Subscriptions
    const [totalSubs] = await db.select({ count: count() }).from(sourceListSubscriptions);
    const [activeSubs] = await db
      .select({ count: count() })
      .from(sourceListSubscriptions)
      .where(eq(sourceListSubscriptions.status, 'active'));

    // Recent activity
    const [articles24h] = await db
      .select({ count: count() })
      .from(content)
      .where(gte(content.fetchedAt, last24h));

    const [articles7d] = await db
      .select({ count: count() })
      .from(content)
      .where(gte(content.fetchedAt, last7d));

    // Revenue (from marketplace)
    const [revenue] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(total_revenue_usdc), 0)::float` 
      })
      .from(sourceLists);

    return c.json({
      success: true,
      data: {
        totals: {
          sourceLists: totalLists.count,
          users: totalUsers.count,
          sources: totalSources.count,
          articles: totalArticles.count,
          briefings: totalBriefings.count,
          subscriptions: totalSubs.count,
          activeSubscriptions: activeSubs.count,
        },
        activity: {
          articlesLast24h: articles24h.count,
          articlesLast7d: articles7d.count,
        },
        revenue: {
          totalUsdc: revenue.total || 0,
        },
        timestamp: now.toISOString(),
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    return c.json({ success: false, error: 'Failed to fetch analytics' }, 500);
  }
});

/**
 * Source list leaderboard
 * GET /analytics/leaderboard
 */
app.get('/leaderboard', async (c) => {
  try {
    const { limit = '20', sort = 'subscribers' } = c.req.query();

    const orderBy = sort === 'revenue' 
      ? desc(sourceLists.totalRevenueUsdc)
      : sort === 'rating'
      ? desc(sourceLists.avgRating)
      : desc(sourceLists.totalSubscribers);

    const leaderboard = await db
      .select({
        id: sourceLists.id,
        name: sourceLists.name,
        description: sourceLists.description,
        totalSubscribers: sourceLists.totalSubscribers,
        totalRevenueUsdc: sourceLists.totalRevenueUsdc,
        avgRating: sourceLists.avgRating,
        ratingCount: sourceLists.ratingCount,
        creatorId: sourceLists.createdBy,
        creatorName: users.name,
        createdAt: sourceLists.createdAt,
        isMarketplaceListed: sourceLists.isMarketplaceListed,
      })
      .from(sourceLists)
      .leftJoin(users, eq(sourceLists.createdBy, users.id))
      .where(eq(sourceLists.isPublic, true))
      .orderBy(orderBy)
      .limit(parseInt(limit));

    // Add rank
    const rankedLeaderboard = leaderboard.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

    return c.json({
      success: true,
      data: rankedLeaderboard,
      sortedBy: sort,
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return c.json({ success: false, error: 'Failed to fetch leaderboard' }, 500);
  }
});

/**
 * Time series data for charts
 * GET /analytics/timeseries
 */
app.get('/timeseries', async (c) => {
  try {
    const { metric = 'articles', days = '30' } = c.req.query();
    const daysNum = parseInt(days);
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

    let data: { date: string; count: number }[] = [];

    if (metric === 'articles') {
      const result = await db.execute(sql`
        SELECT 
          DATE(fetched_at) as date,
          COUNT(*) as count
        FROM content
        WHERE fetched_at >= ${startDate.toISOString()}
        GROUP BY DATE(fetched_at)
        ORDER BY date
      `);
      data = (result.rows || result) as { date: string; count: number }[];
    } else if (metric === 'subscriptions') {
      const result = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM source_list_subscriptions
        WHERE created_at >= ${startDate.toISOString()}
        GROUP BY DATE(created_at)
        ORDER BY date
      `);
      data = (result.rows || result) as { date: string; count: number }[];
    } else if (metric === 'users') {
      const result = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM users
        WHERE created_at >= ${startDate.toISOString()}
        GROUP BY DATE(created_at)
        ORDER BY date
      `);
      data = (result.rows || result) as { date: string; count: number }[];
    }

    return c.json({
      success: true,
      data,
      metric,
      days: daysNum,
    });
  } catch (error) {
    console.error('Timeseries error:', error);
    return c.json({ success: false, error: 'Failed to fetch timeseries' }, 500);
  }
});

/**
 * Top creators by revenue
 * GET /analytics/top-creators
 */
app.get('/top-creators', async (c) => {
  try {
    const { limit = '10' } = c.req.query();

    const creators = await db
      .select({
        userId: users.id,
        name: users.name,
        totalLists: count(sourceLists.id),
        totalSubscribers: sql<number>`COALESCE(SUM(${sourceLists.totalSubscribers}), 0)::int`,
        totalRevenue: sql<number>`COALESCE(SUM(${sourceLists.totalRevenueUsdc}), 0)::float`,
        avgRating: sql<number>`AVG(${sourceLists.avgRating})::float`,
      })
      .from(users)
      .innerJoin(sourceLists, eq(users.id, sourceLists.createdBy))
      .groupBy(users.id, users.name)
      .orderBy(desc(sql`SUM(${sourceLists.totalSubscribers})`))
      .limit(parseInt(limit));

    const rankedCreators = creators.map((c, i) => ({
      rank: i + 1,
      ...c,
    }));

    return c.json({
      success: true,
      data: rankedCreators,
    });
  } catch (error) {
    console.error('Top creators error:', error);
    return c.json({ success: false, error: 'Failed to fetch top creators' }, 500);
  }
});

export default app;

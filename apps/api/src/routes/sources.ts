import { Hono } from 'hono';
import { db, sources, domains, sourceLists, sourceListItems, users } from '../db';
import { eq, or, isNull, and } from 'drizzle-orm';
import { authMiddleware } from './auth';
import { suggestSourcesForTopic, suggestSourcesForDomain, validateRSSUrl } from '../services/intelligence/source-suggestions';
import { analyzeSource } from '../services/sources/ai-source-analyzer';

// User type from database
interface User {
  id: string;
  email: string;
  name: string;
  preferences: Record<string, unknown>;
}

// Context variables type
type Variables = {
  user: User | null;
};

export const sourcesRoutes = new Hono<{ Variables: Variables }>();

// Admin emails - only these users can manage global sources
const ADMIN_EMAILS = ['a.luhning@vitalpoint.ai'];

function isAdmin(user: User | null): boolean {
  return !!user && ADMIN_EMAILS.includes(user.email);
}

// Apply auth middleware to all routes
sourcesRoutes.use('*', authMiddleware);

// ==================== AI SOURCE ANALYZER ====================

// Analyze a URL or description and suggest how to add it
sourcesRoutes.post('/analyze', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { input } = body;

  if (!input || typeof input !== 'string') {
    return c.json({ success: false, error: 'Input is required' }, 400);
  }

  try {
    console.log(`[AI Analyzer] Analyzing: ${input.substring(0, 100)}...`);
    const result = await analyzeSource(input);
    
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    // Get available domains for selection
    const allDomains = await db.select({ id: domains.id, name: domains.name, slug: domains.slug })
      .from(domains);

    // Try to match suggested domain
    let matchedDomain = allDomains.find(d => 
      d.name.toLowerCase() === result.analysis?.suggestedDomain.toLowerCase() ||
      d.slug === result.analysis?.suggestedDomain.toLowerCase().replace(/\s+/g, '-')
    );

    return c.json({
      success: true,
      data: {
        analysis: result.analysis,
        matchedDomain: matchedDomain || null,
        availableDomains: allDomains,
      },
    });
  } catch (error) {
    console.error('[AI Analyzer] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    }, 500);
  }
});

// Validate a feed URL - test if it actually works and return sample items
sourcesRoutes.post('/validate-feed', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { url, type = 'rss' } = body;

  if (!url || typeof url !== 'string') {
    return c.json({ success: false, error: 'URL is required' }, 400);
  }

  try {
    console.log(`[Feed Validator] Testing: ${url}`);
    
    if (type === 'rss') {
      // Import RSS parser dynamically
      const Parser = (await import('rss-parser')).default;
      const parser = new Parser({
        timeout: 15000,
        headers: {
          'User-Agent': 'Argus/1.0 (+https://argus.vitalpoint.ai)',
        },
      });

      try {
        const feed = await parser.parseURL(url);
        
        // Get sample items (up to 3)
        const sampleItems = (feed.items || []).slice(0, 3).map(item => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || null,
          snippet: (item.contentSnippet || item.content || '').substring(0, 200),
        }));

        return c.json({
          success: true,
          valid: true,
          feedInfo: {
            title: feed.title || 'Unknown Feed',
            description: feed.description || '',
            itemCount: feed.items?.length || 0,
            lastBuildDate: feed.lastBuildDate || null,
          },
          sampleItems,
          message: `✅ Feed working! Found ${feed.items?.length || 0} items.`,
        });
      } catch (parseError) {
        console.error('[Feed Validator] Parse error:', parseError);
        return c.json({
          success: true,
          valid: false,
          error: parseError instanceof Error ? parseError.message : 'Failed to parse feed',
          message: '❌ Feed not accessible or invalid RSS/Atom format',
        });
      }
    } else if (type === 'youtube') {
      // For YouTube, we'd check the channel/playlist exists
      // For now, just validate the URL format
      const ytMatch = url.match(/youtube\.com\/(channel\/|c\/|@|user\/|playlist\?list=)/);
      if (ytMatch) {
        return c.json({
          success: true,
          valid: true,
          message: '✅ YouTube URL looks valid. Will monitor for new uploads.',
        });
      }
      return c.json({
        success: true,
        valid: false,
        message: '❌ Not a valid YouTube channel or playlist URL',
      });
    } else if (type === 'website') {
      // For websites, check if we can fetch the page
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Argus/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        
        if (res.ok) {
          return c.json({
            success: true,
            valid: true,
            message: '✅ Website accessible. Will scrape for content updates.',
          });
        }
        return c.json({
          success: true,
          valid: false,
          message: `❌ Website returned ${res.status} ${res.statusText}`,
        });
      } catch (fetchError) {
        return c.json({
          success: true,
          valid: false,
          error: fetchError instanceof Error ? fetchError.message : 'Fetch failed',
          message: '❌ Website not accessible',
        });
      }
    }

    return c.json({
      success: true,
      valid: null,
      message: '⚠️ Validation not available for this source type',
    });
  } catch (error) {
    console.error('[Feed Validator] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    }, 500);
  }
});

// Add source from AI analysis
sourcesRoutes.post('/from-analysis', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { analysis, domainId, isGlobal = false } = body;

  if (!analysis || !domainId) {
    return c.json({ success: false, error: 'Analysis and domainId are required' }, 400);
  }

  // Only admins can create global sources
  if (isGlobal && !isAdmin(user)) {
    return c.json({ success: false, error: 'Only admins can create global sources' }, 403);
  }

  try {
    // Determine source type
    let type: 'rss' | 'website' | 'youtube';
    let url: string;
    let config: Record<string, any> = {};

    switch (analysis.sourceType) {
      case 'rss':
        type = 'rss';
        url = analysis.feedUrl || analysis.websiteUrl;
        break;
      case 'youtube_channel':
      case 'youtube_playlist':
        type = 'youtube';
        url = analysis.websiteUrl;
        config.channelId = analysis.youtubeChannelId;
        break;
      case 'website':
        type = 'website';
        url = analysis.websiteUrl;
        config.scrapeSelector = 'article, .article, .post, main';
        break;
      default:
        type = 'website';
        url = analysis.websiteUrl || analysis.feedUrl;
    }

    if (!url) {
      return c.json({ success: false, error: 'No valid URL found in analysis' }, 400);
    }

    // Create the source
    const [newSource] = await db.insert(sources).values({
      name: analysis.name,
      type,
      url,
      domainId,
      reliabilityScore: analysis.confidence,
      isActive: true,
      config,
      createdBy: isGlobal ? null : user.id,
    }).returning();

    console.log(`[AI Analyzer] Created source: ${newSource.name} (${newSource.id})`);

    return c.json({
      success: true,
      data: {
        source: newSource,
        message: `Successfully added "${analysis.name}" as a ${type} source.`,
      },
    });
  } catch (error) {
    console.error('[AI Analyzer] Create error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create source',
    }, 500);
  }
});

// List sources (all global sources + user's own sources)
sourcesRoutes.get('/', async (c) => {
  const user = c.get('user');
  const domainId = c.req.query('domainId');
  const includeUserSources = c.req.query('includeUserSources') !== 'false';
  
  // Build conditions: global sources (createdBy is null) OR user's own sources
  let conditions: any[] = [];
  
  if (user && includeUserSources) {
    conditions.push(or(isNull(sources.createdBy), eq(sources.createdBy, user.id)));
  } else {
    conditions.push(isNull(sources.createdBy));
  }
  
  if (domainId) {
    conditions.push(eq(sources.domainId, domainId));
  }
  
  const allSources = await db.select({
    id: sources.id,
    name: sources.name,
    type: sources.type,
    url: sources.url,
    domainId: sources.domainId,
    reliabilityScore: sources.reliabilityScore,
    isActive: sources.isActive,
    config: sources.config,
    lastFetchedAt: sources.lastFetchedAt,
    createdAt: sources.createdAt,
    createdBy: sources.createdBy,
  }).from(sources).where(and(...conditions));
  
  // Add ownership info
  const enrichedSources = allSources.map(s => ({
    ...s,
    isGlobal: s.createdBy === null,
    isOwner: user ? s.createdBy === user.id : false,
    canEdit: user ? (s.createdBy === user.id || (s.createdBy === null && isAdmin(user))) : false,
  }));
  
  return c.json({ success: true, data: enrichedSources });
});

// Get source stats (must be before /:id to avoid matching)
sourcesRoutes.get('/stats', async (c) => {
  try {
    const totalSources = await db.select().from(sources);
    const activeSources = totalSources.filter(s => s.isActive);
    const avgReliability = totalSources.length > 0 
      ? Math.round(totalSources.reduce((sum, s) => sum + (s.reliabilityScore || 50), 0) / totalSources.length)
      : 50;
    
    // Get unique domains
    const domainIds = new Set(totalSources.map(s => s.domainId).filter(Boolean));
    
    return c.json({
      success: true,
      data: {
        total: totalSources.length,
        active: activeSources.length,
        avgReliability,
        domains: domainIds.size,
      }
    });
  } catch (error) {
    console.error('Sources stats error:', error);
    return c.json({ success: false, error: 'Failed to get stats' }, 500);
  }
});

// Get source by ID
sourcesRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  return c.json({ 
    success: true, 
    data: {
      ...source,
      isGlobal: source.createdBy === null,
      isOwner: user ? source.createdBy === user.id : false,
      canEdit: user ? (source.createdBy === user.id || (source.createdBy === null && isAdmin(user))) : false,
    }
  });
});

// ==================== SOURCE LISTS ====================

// List user's source lists
sourcesRoutes.get('/lists/my', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const lists = await db.select().from(sourceLists).where(eq(sourceLists.userId, user.id));
  
  // Get item counts for each list
  const listsWithCounts = await Promise.all(lists.map(async (list) => {
    const items = await db.select().from(sourceListItems).where(eq(sourceListItems.sourceListId, list.id));
    return {
      ...list,
      itemCount: items.length,
    };
  }));
  
  return c.json({ success: true, data: listsWithCounts });
});

// Get user's active source list (must be before :listId route!)
sourcesRoutes.get('/lists/active', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: true, data: null });
  }
  
  const prefs = user.preferences as { activeSourceListId?: string } || {};
  const activeListId = prefs.activeSourceListId;
  
  if (!activeListId) {
    return c.json({ success: true, data: null });
  }
  
  // Get the list details
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, activeListId)).limit(1);
  
  if (!list) {
    return c.json({ success: true, data: null });
  }
  
  // Get source IDs in this list
  const items = await db.select({ sourceId: sourceListItems.sourceId })
    .from(sourceListItems)
    .where(eq(sourceListItems.sourceListId, activeListId));
  
  return c.json({ 
    success: true, 
    data: {
      ...list,
      sourceIds: items.map(i => i.sourceId),
    }
  });
});

// Get a specific source list with its items
sourcesRoutes.get('/lists/:listId', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  // Check if user can view this list (owner or public)
  const canView = list.isPublic || (user && list.userId === user.id);
  if (!canView) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  // Get items with source details
  const items = await db
    .select({
      id: sourceListItems.id,
      sourceId: sourceListItems.sourceId,
      addedAt: sourceListItems.addedAt,
      source: {
        id: sources.id,
        name: sources.name,
        type: sources.type,
        url: sources.url,
        domainId: sources.domainId,
        reliabilityScore: sources.reliabilityScore,
        isActive: sources.isActive,
      },
    })
    .from(sourceListItems)
    .leftJoin(sources, eq(sourceListItems.sourceId, sources.id))
    .where(eq(sourceListItems.sourceListId, listId));
  
  return c.json({ 
    success: true, 
    data: {
      ...list,
      isOwner: user ? list.userId === user.id : false,
      items,
    }
  });
});

// Create a source list
sourcesRoutes.post('/lists', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const { name, description = '', isPublic = false } = body;
  
  if (!name) {
    return c.json({ success: false, error: 'Name is required' }, 400);
  }
  
  try {
    const [list] = await db.insert(sourceLists).values({
      userId: user.id,
      name,
      description,
      isPublic,
    }).returning();
    
    return c.json({ success: true, data: list });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create list',
    }, 500);
  }
});

// Update a source list
sourcesRoutes.patch('/lists/:listId', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  if (list.userId !== user.id) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const { name, description, isPublic } = body;
  
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (isPublic !== undefined) updateData.isPublic = isPublic;
  
  if (Object.keys(updateData).length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }
  
  try {
    const [updated] = await db.update(sourceLists)
      .set(updateData)
      .where(eq(sourceLists.id, listId))
      .returning();
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update list',
    }, 500);
  }
});

// Clear active source list (must be before :listId route!)
sourcesRoutes.delete('/lists/active', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  try {
    const currentPrefs = user.preferences as Record<string, unknown> || {};
    const { activeSourceListId, ...restPrefs } = currentPrefs;
    
    await db.update(users)
      .set({ preferences: restPrefs })
      .where(eq(users.id, user.id));
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear active list',
    }, 500);
  }
});

// Delete a source list
sourcesRoutes.delete('/lists/:listId', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  if (list.userId !== user.id) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  try {
    await db.delete(sourceLists).where(eq(sourceLists.id, listId));
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete list',
    }, 500);
  }
});

// Add source to a list
sourcesRoutes.post('/lists/:listId/items', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  if (list.userId !== user.id) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const { sourceId } = body;
  
  if (!sourceId) {
    return c.json({ success: false, error: 'sourceId is required' }, 400);
  }
  
  // Verify source exists
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  try {
    const [item] = await db.insert(sourceListItems).values({
      sourceListId: listId,
      sourceId,
    }).returning();
    
    return c.json({ success: true, data: item });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add source to list',
    }, 500);
  }
});

// Remove source from a list
sourcesRoutes.delete('/lists/:listId/items/:itemId', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  const itemId = c.req.param('itemId');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  if (list.userId !== user.id) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  try {
    await db.delete(sourceListItems).where(eq(sourceListItems.id, itemId));
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove source from list',
    }, 500);
  }
});

// ==================== SOURCE CRUD ====================

// AI suggest sources for a topic
sourcesRoutes.post('/suggest', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { topic, domainSlug, validate = false } = body;
  
  if (!topic && !domainSlug) {
    return c.json({ success: false, error: 'topic or domainSlug required' }, 400);
  }
  
  try {
    let result;
    
    if (domainSlug) {
      const [domain] = await db.select().from(domains).where(eq(domains.slug, domainSlug)).limit(1);
      if (domain) {
        result = await suggestSourcesForDomain(domainSlug, domain.name);
      } else {
        result = await suggestSourcesForTopic(domainSlug);
      }
    } else {
      result = await suggestSourcesForTopic(topic);
    }
    
    if (validate && result.suggestions.length > 0) {
      const validated = await Promise.all(
        result.suggestions.map(async (s) => ({
          ...s,
          validated: s.type === 'rss' ? await validateRSSUrl(s.url) : null,
        }))
      );
      result.suggestions = validated as any;
    }
    
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Add a suggested source to the database
sourcesRoutes.post('/add-suggested', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, url, type, domainId, reliabilityScore, asGlobal = false } = body;
  
  if (!name || !url || !type || !domainId) {
    return c.json({ success: false, error: 'name, url, type, and domainId required' }, 400);
  }
  
  // Only admins can add global sources
  if (asGlobal && !isAdmin(user)) {
    return c.json({ success: false, error: 'Only admins can create global sources' }, 403);
  }
  
  try {
    const [inserted] = await db.insert(sources).values({
      name,
      url,
      type,
      domainId,
      reliabilityScore: reliabilityScore || 50,
      createdBy: asGlobal ? null : (user?.id || null),
    }).returning();
    
    return c.json({ success: true, data: inserted });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Create a new source
sourcesRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, url, type, domainId, reliabilityScore, isActive, asGlobal = false } = body;
  
  if (!name || !url || !type) {
    return c.json({ success: false, error: 'name, url, and type are required' }, 400);
  }
  
  // Only admins can add global sources
  if (asGlobal && !isAdmin(user)) {
    return c.json({ success: false, error: 'Only admins can create global sources' }, 403);
  }
  
  try {
    const [inserted] = await db.insert(sources).values({
      name,
      url,
      type,
      domainId: domainId || null,
      reliabilityScore: reliabilityScore ?? 50,
      isActive: isActive ?? true,
      createdBy: asGlobal ? null : (user?.id || null),
    }).returning();
    
    return c.json({ success: true, data: inserted });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Update a source
sourcesRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  
  // Get the source first to check permissions
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  // Permission check: user owns it OR (it's global AND user is admin)
  const canEdit = user && (source.createdBy === user.id || (source.createdBy === null && isAdmin(user)));
  if (!canEdit) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  const { name, url, type, domainId, reliabilityScore, isActive } = body;
  
  try {
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (type !== undefined) updateData.type = type;
    if (domainId !== undefined) updateData.domainId = domainId;
    if (reliabilityScore !== undefined) updateData.reliabilityScore = reliabilityScore;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (Object.keys(updateData).length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400);
    }
    
    const [updated] = await db.update(sources)
      .set(updateData)
      .where(eq(sources.id, id))
      .returning();
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete a source
sourcesRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  // Get the source first to check permissions
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  
  if (!source) {
    return c.json({ success: false, error: 'Source not found' }, 404);
  }
  
  // Permission check: user owns it OR (it's global AND user is admin)
  const canDelete = user && (source.createdBy === user.id || (source.createdBy === null && isAdmin(user)));
  if (!canDelete) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  try {
    const [deleted] = await db.delete(sources)
      .where(eq(sources.id, id))
      .returning();
    
    return c.json({ success: true, data: deleted });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get user info (for checking if current user is admin)
sourcesRoutes.get('/user/info', async (c) => {
  const user = c.get('user');
  
  return c.json({ 
    success: true, 
    data: {
      isAuthenticated: !!user,
      isAdmin: isAdmin(user),
      userId: user?.id || null,
      email: user?.email || null,
    }
  });
});

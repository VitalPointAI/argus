import { Hono } from 'hono';
import { db, sources, domains, sourceLists, sourceListItems, users } from '../db';
import { eq, or, isNull, and } from 'drizzle-orm';
import { authMiddleware } from './auth';
import { suggestSourcesForTopic, suggestSourcesForDomain, validateRSSUrl } from '../services/intelligence/source-suggestions';

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

// ==================== ACTIVE SOURCE LIST ====================

// Get user's active source list
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
    // List was deleted, clear the preference
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

// Set a source list as active
sourcesRoutes.post('/lists/:listId/activate', async (c) => {
  const user = c.get('user');
  const listId = c.req.param('listId');
  
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  
  // Verify list exists and user can access it
  const [list] = await db.select().from(sourceLists).where(eq(sourceLists.id, listId)).limit(1);
  
  if (!list) {
    return c.json({ success: false, error: 'Source list not found' }, 404);
  }
  
  // User must own the list or it must be public
  if (list.userId !== user.id && !list.isPublic) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  try {
    // Update user preferences
    const currentPrefs = user.preferences as Record<string, unknown> || {};
    const newPrefs = { ...currentPrefs, activeSourceListId: listId };
    
    await db.update(users)
      .set({ preferences: newPrefs })
      .where(eq(users.id, user.id));
    
    return c.json({ 
      success: true, 
      data: { 
        activeSourceListId: listId,
        listName: list.name,
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate list',
    }, 500);
  }
});

// Clear active source list (show all sources)
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

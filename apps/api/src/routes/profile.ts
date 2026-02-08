import { Hono } from 'hono';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';

export const profileRoutes = new Hono();

// Preferences schema
interface UserPreferences {
  // Global domain filter - applies to dashboard, briefings, etc.
  domains: {
    selected: string[]; // Domain IDs user is interested in (empty = all)
  };
  // Notification emails (separate from login email)
  notificationEmails: {
    addresses: string[]; // List of notification emails
    primary: string; // Which one to use for notifications (empty = account email)
  };
  // Email notifications
  email: {
    enabled: boolean;
    address?: string; // Legacy - use notificationEmails instead
    briefings: {
      enabled: boolean;
      deliveryTimes: string[];
      timezone: string;
      domains: string[]; // Override global filter for briefings (empty = use global)
      format: 'executive' | 'summary' | 'full';
      includeAudio: boolean;
    };
    alerts: {
      enabled: boolean;
      minConfidence: number;
    };
    digest: {
      enabled: boolean;
      frequency: 'daily' | 'weekly' | 'never';
    };
  };
  telegram: {
    enabled: boolean;
    chatId?: string;
    briefings: {
      enabled: boolean;
      deliveryTimes: string[];
    };
  };
  web: {
    darkMode: boolean;
    compactView: boolean;
  };
}

const defaultPreferences: UserPreferences = {
  domains: {
    selected: [], // Empty = all domains
  },
  notificationEmails: {
    addresses: [],
    primary: '', // Empty = use account email
  },
  email: {
    enabled: false,
    briefings: {
      enabled: true,
      deliveryTimes: ['06:00'],
      timezone: 'America/New_York',
      domains: [],
      format: 'executive',
      includeAudio: false,
    },
    alerts: {
      enabled: false,
      minConfidence: 80,
    },
    digest: {
      enabled: false,
      frequency: 'weekly',
    },
  },
  telegram: {
    enabled: false,
    briefings: {
      enabled: false,
      deliveryTimes: ['06:00'],
    },
  },
  web: {
    darkMode: false,
    compactView: false,
  },
};

// Get current user profile
profileRoutes.get('/', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    preferences: users.preferences,
    trustScore: users.trustScore,
    totalRatingsGiven: users.totalRatingsGiven,
    accurateRatings: users.accurateRatings,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  // Merge with defaults
  const prefs = { ...defaultPreferences, ...(user.preferences as object) };

  return c.json({
    success: true,
    data: {
      ...user,
      preferences: prefs,
    },
  });
});

// Update profile (name, email)
profileRoutes.patch('/', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, email } = body;

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (name) updates.name = name;
  if (email) updates.email = email;

  try {
    const [updated] = await db.update(users)
      .set(updates)
      .where(eq(users.id, authUser.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return c.json({ success: false, error: 'Email already in use' }, 400);
    }
    throw error;
  }
});

// Update notification preferences
profileRoutes.put('/preferences', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  
  // Get current preferences
  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  // Deep merge preferences
  const currentPrefs = { ...defaultPreferences, ...(user.preferences as object) };
  const newPrefs = deepMerge(currentPrefs, body);

  await db.update(users)
    .set({ 
      preferences: newPrefs,
      updatedAt: new Date(),
    })
    .where(eq(users.id, authUser.id));

  return c.json({ success: true, data: newPrefs });
});

// Patch specific preference section
profileRoutes.patch('/preferences/:section', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  const section = c.req.param('section') as 'domains' | 'email' | 'telegram' | 'web';
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  if (!['domains', 'notificationEmails', 'email', 'telegram', 'web'].includes(section)) {
    return c.json({ success: false, error: 'Invalid section' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  
  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const currentPrefs = { ...defaultPreferences, ...(user.preferences as object) } as any;
  currentPrefs[section] = { ...currentPrefs[section], ...body };

  await db.update(users)
    .set({ 
      preferences: currentPrefs,
      updatedAt: new Date(),
    })
    .where(eq(users.id, authUser.id));

  return c.json({ success: true, data: currentPrefs });
});

// Helper: deep merge objects
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

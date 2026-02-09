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

// ============ Telegram Connect Flow ============

// In-memory store for pending connect codes (in production, use Redis)
const pendingTelegramCodes = new Map<string, { userId: string; expiresAt: Date }>();

// Generate a connect code for the current user
profileRoutes.post('/telegram/connect', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  // Generate a unique 6-character code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store the code
  pendingTelegramCodes.set(code, { userId: authUser.id, expiresAt });

  // Clean up expired codes
  for (const [key, value] of pendingTelegramCodes.entries()) {
    if (value.expiresAt < new Date()) {
      pendingTelegramCodes.delete(key);
    }
  }

  const botUsername = 'argusbriefing_bot';
  const connectUrl = `https://t.me/${botUsername}?start=${code}`;

  return c.json({
    success: true,
    data: {
      code,
      connectUrl,
      expiresAt: expiresAt.toISOString(),
      instructions: `Click the link or open Telegram and send /start ${code} to @${botUsername}`,
    },
  });
});

// Disconnect Telegram
profileRoutes.delete('/telegram/disconnect', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const currentPrefs = { ...defaultPreferences, ...(user.preferences as object) } as any;
  currentPrefs.telegram = {
    enabled: false,
    chatId: null,
    briefings: { enabled: false, deliveryTimes: ['06:00'] },
  };

  await db.update(users)
    .set({ preferences: currentPrefs, updatedAt: new Date() })
    .where(eq(users.id, authUser.id));

  return c.json({ success: true, message: 'Telegram disconnected' });
});

// Webhook endpoint for Telegram bot (called by Telegram)
profileRoutes.post('/telegram/webhook', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  
  // Handle /start command with code
  if (body.message?.text?.startsWith('/start')) {
    const parts = body.message.text.split(' ');
    const code = parts[1]?.toUpperCase();
    const chatId = String(body.message.chat.id);
    const username = body.message.from?.username || '';
    const firstName = body.message.from?.first_name || 'there';

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!code) {
      // No code - just a regular /start
      if (TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👋 Hi ${firstName}!\n\nI'm the Argus Intelligence briefing bot.\n\nTo connect your Argus account:\n1. Go to argus.vitalpoint.ai/settings\n2. Click "Connect Telegram"\n3. Send me the code you receive\n\nOnce connected, you'll receive personalized intelligence briefings here!`,
          }),
        });
      }
      return c.json({ ok: true });
    }

    // Check if code is valid
    const pending = pendingTelegramCodes.get(code);
    
    if (!pending || pending.expiresAt < new Date()) {
      if (TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ Invalid or expired code.\n\nPlease generate a new code from argus.vitalpoint.ai/settings`,
          }),
        });
      }
      return c.json({ ok: true });
    }

    // Link the account
    const [user] = await db.select({ preferences: users.preferences, name: users.name })
      .from(users)
      .where(eq(users.id, pending.userId));

    if (user) {
      const currentPrefs = { ...defaultPreferences, ...(user.preferences as object) } as any;
      currentPrefs.telegram = {
        enabled: true,
        chatId: chatId,
        username: username,
        briefings: {
          enabled: true,
          deliveryTimes: currentPrefs.email?.briefings?.deliveryTimes || ['06:00'],
        },
      };

      await db.update(users)
        .set({ preferences: currentPrefs, updatedAt: new Date() })
        .where(eq(users.id, pending.userId));

      // Remove the used code
      pendingTelegramCodes.delete(code);

      if (TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Connected!\n\nHi ${user.name}, your Argus account is now linked.\n\nYou'll receive intelligence briefings at your scheduled times. Manage your settings at argus.vitalpoint.ai/settings`,
          }),
        });
      }
    }

    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

// Get pending code status (for polling from frontend)
profileRoutes.get('/telegram/status', async (c) => {
  const authUser = c.get('user' as never) as { id: string } | null;
  
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const prefs = user.preferences as any;
  const connected = !!(prefs?.telegram?.enabled && prefs?.telegram?.chatId);

  return c.json({
    success: true,
    data: {
      connected,
      chatId: prefs?.telegram?.chatId || null,
      username: prefs?.telegram?.username || null,
    },
  });
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

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const authRoutes = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'argus-secret-change-in-production';
const SALT_ROUNDS = 10;
const COOKIE_NAME = 'argus_session';
const IS_PROD = process.env.NODE_ENV === 'production';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Generate JWT token for user
 */
function generateToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify JWT token and return payload
 */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

/**
 * Set session cookie (HttpOnly, Secure in production)
 */
function setSessionCookie(c: any, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear session cookie
 */
function clearSessionCookie(c: any) {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Auth middleware - extracts user from session cookie or Authorization header
 */
export async function authMiddleware(c: any, next: any) {
  // First try HttpOnly cookie (preferred)
  let token = getCookie(c, COOKIE_NAME);
  
  // Fallback to Authorization header for API clients
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  
  if (!token) {
    c.set('user', null);
    return next();
  }
  
  const payload = verifyToken(token);
  
  if (payload) {
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    c.set('user', user || null);
  } else {
    c.set('user', null);
  }
  
  return next();
}

/**
 * Require authentication middleware
 */
export function requireAuth(c: any, next: any) {
  if (!c.get('user')) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  return next();
}

// Register new user
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ success: false, error: 'Email already registered' }, 400);
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  // Create user
  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    name,
    preferences: {
      domains: [],
      deliveryChannels: ['web'],
      briefingSchedule: { morning: '06:00', evening: '18:00' },
      realTimeAlerts: false,
      minConfidenceThreshold: 50,
      briefingFormat: 'detailed',
      timezone: 'UTC',
    },
  }).returning();
  
  // Generate token and set HttpOnly cookie
  const token = generateToken(user.id, user.email);
  setSessionCookie(c, token);
  
  return c.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    },
  });
});

// Login
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // Verify password
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // Generate token and set HttpOnly cookie
  const token = generateToken(user.id, user.email);
  setSessionCookie(c, token);
  
  return c.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    },
  });
});

// Logout - clears HttpOnly cookie
authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }
  
  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      preferences: user.preferences,
    },
  });
});

// Update user preferences
authRoutes.patch('/preferences', authMiddleware, async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }
  
  const body = await c.req.json().catch(() => ({}));
  
  // Merge preferences
  const newPrefs = { ...user.preferences, ...body };
  
  await db.update(users)
    .set({ preferences: newPrefs })
    .where(eq(users.id, user.id));
  
  return c.json({
    success: true,
    data: { preferences: newPrefs },
  });
});

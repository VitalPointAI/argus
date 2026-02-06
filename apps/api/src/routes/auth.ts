import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';

export const authRoutes = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ success: false, error: 'Email already registered' }, 400);
  }
  
  // TODO: Hash password with Lucia
  // For now, placeholder
  const [user] = await db.insert(users).values({
    email,
    passwordHash: password, // TODO: Hash this!
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
  
  return c.json({
    success: true,
    data: { id: user.id, email: user.email, name: user.name },
  });
});

// Login
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // TODO: Verify password hash
  // TODO: Create session with Lucia
  
  return c.json({
    success: true,
    data: { id: user.id, email: user.email, name: user.name },
    // TODO: Return session token
  });
});

// Logout
authRoutes.post('/logout', async (c) => {
  // TODO: Invalidate session
  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', async (c) => {
  // TODO: Get user from session
  return c.json({ success: false, error: 'Not authenticated' }, 401);
});

import { Hono } from 'hono';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);
    
    return c.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

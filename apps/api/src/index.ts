import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import 'dotenv/config';

// Route imports
import { authRoutes } from './routes/auth';
import { domainsRoutes } from './routes/domains';
import { sourcesRoutes } from './routes/sources';
import { briefingsRoutes } from './routes/briefings';
import { healthRoutes } from './routes/health';
import { ingestionRoutes } from './routes/ingestion';
import { contentRoutes } from './routes/content';
import { verificationRoutes } from './routes/verification';
import { deliveryRoutes } from './routes/delivery';
import { apiV1Routes } from './routes/api-v1';
import { factcheckRoutes } from './routes/factcheck';
import articlesRoutes from './routes/articles';
import { adminRoutes } from './routes/admin';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://argus.vitalpoint.ai',
  ],
  credentials: true,
}));

// Routes
app.route('/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/domains', domainsRoutes);
app.route('/api/sources', sourcesRoutes);
app.route('/api/briefings', briefingsRoutes);
app.route('/api/ingestion', ingestionRoutes);
app.route('/api/content', contentRoutes);
app.route('/api/verification', verificationRoutes);
app.route('/api/delivery', deliveryRoutes);
app.route('/api/v1', apiV1Routes);
app.route('/api/factcheck', factcheckRoutes);
app.route('/api/articles', articlesRoutes);
app.route('/api/admin', adminRoutes);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Argus API',
    version: '0.1.0',
    status: 'operational',
  });
});

const port = parseInt(process.env.PORT || '3001');

console.log(`🦚 Argus API starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

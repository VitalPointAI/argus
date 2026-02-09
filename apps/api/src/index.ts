import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import 'dotenv/config';

// Route imports
import { authRoutes } from './routes/auth';
import { domainsRoutes } from './routes/domains';
import { sourcesRoutes } from './routes/sources';
import { ratingsRoutes } from './routes/ratings';
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
import { apiKeysRoutes, combinedAuthMiddleware } from './routes/api-keys';
import { emailRoutes } from './routes/email';
import { profileRoutes } from './routes/profile';
import humintRoutes from './routes/humint';
import bountiesRoutes from './routes/bounties';
import opsecRoutes from './routes/opsec';
import zkRoutes from './routes/zk';
import nftRoutes from './routes/nft';
import phantomAuthRoutes from './routes/phantom-auth';
import { initPhantomAuth } from './services/auth/phantom-auth';

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

// Combined auth middleware - enables both JWT and API key authentication
app.use('/api/*', combinedAuthMiddleware);

// Routes
app.route('/health', healthRoutes);
app.route('/api/health', healthRoutes); // Also expose under /api/health
app.route('/api/auth', authRoutes);
app.route('/api/keys', apiKeysRoutes); // API key management
app.route('/api/domains', domainsRoutes);
app.route('/api/sources', sourcesRoutes);
app.route('/api/sources', ratingsRoutes); // Rating routes under /api/sources/:id/rate etc
app.route('/api/briefings', briefingsRoutes);
app.route('/api/ingestion', ingestionRoutes);
app.route('/api/content', contentRoutes);
app.route('/api/verification', verificationRoutes);
app.route('/api/delivery', deliveryRoutes);
app.route('/api/v1', apiV1Routes);
app.route('/api/factcheck', factcheckRoutes);
app.route('/api/articles', articlesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/email', emailRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/humint', humintRoutes);
app.route('/api/bounties', bountiesRoutes);
app.route('/api/opsec', opsecRoutes);
app.route('/api/zk', zkRoutes);
app.route('/api/nft', nftRoutes);
app.route('/api/phantom', phantomAuthRoutes); // Anonymous passkey auth for HUMINT

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Argus API',
    version: '0.1.0',
    status: 'operational',
  });
});

const port = parseInt(process.env.PORT || '3001');

// Initialize services
async function start() {
  console.log(`🦚 Argus API starting on port ${port}`);
  
  // Initialize Phantom Auth for HUMINT
  try {
    await initPhantomAuth();
    console.log('✅ Phantom Auth initialized');
  } catch (error) {
    console.warn('⚠️ Phantom Auth not initialized:', error instanceof Error ? error.message : 'Unknown error');
    console.warn('   HUMINT registration will be unavailable until configured.');
  }
  
  serve({
    fetch: app.fetch,
    port,
  });
}

start();

-- Migration: API Keys for external access
-- Created: 2026-02-08

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by key prefix (used for hash comparison)
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);

-- Index for user's keys
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Index for active keys only
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- API key rate limiting table
CREATE TABLE IF NOT EXISTS api_key_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMP NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);

-- Index for rate limit lookups
CREATE INDEX idx_api_key_rate_limits_lookup ON api_key_rate_limits(api_key_id, window_start);

-- Cleanup old rate limit entries (run periodically)
-- DELETE FROM api_key_rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';

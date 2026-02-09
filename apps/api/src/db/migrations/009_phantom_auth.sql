-- Migration: 009_phantom_auth.sql
-- Add NEAR account ID to HUMINT sources for Phantom Auth integration

-- Add near_account_id column to humint_sources
ALTER TABLE humint_sources 
ADD COLUMN IF NOT EXISTS near_account_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_humint_sources_near_account 
ON humint_sources(near_account_id);

-- Phantom Auth tables (if not created by the package)
-- These match the schema from @vitalpoint/near-phantom-auth

-- Anonymous users (phantom identities)
CREATE TABLE IF NOT EXISTS anon_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT UNIQUE NOT NULL,
  near_account_id TEXT UNIQUE NOT NULL,
  mpc_public_key TEXT NOT NULL,
  derivation_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Passkeys (WebAuthn credentials)
CREATE TABLE IF NOT EXISTS anon_passkeys (
  credential_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES anon_users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS anon_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES anon_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- WebAuthn challenges (temporary)
CREATE TABLE IF NOT EXISTS anon_challenges (
  id UUID PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id UUID REFERENCES anon_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB
);

-- Recovery data references
CREATE TABLE IF NOT EXISTS anon_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES anon_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- Indexes for phantom auth tables
CREATE INDEX IF NOT EXISTS idx_anon_sessions_user ON anon_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_anon_sessions_expires ON anon_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_anon_passkeys_user ON anon_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_anon_challenges_expires ON anon_challenges(expires_at);

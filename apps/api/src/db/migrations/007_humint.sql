-- Migration: HUMINT (Human Intelligence) System
-- Adds support for anonymous human intelligence sources

-- Anonymous HUMINT sources
CREATE TABLE IF NOT EXISTS humint_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT UNIQUE NOT NULL,
  public_key TEXT UNIQUE NOT NULL,
  
  -- Profile
  bio TEXT,
  domains TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  event_types TEXT[] DEFAULT '{}',
  
  -- Reputation (crowd-sourced)
  reputation_score INTEGER DEFAULT 50,
  total_submissions INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  
  -- Monetization
  subscription_price_usdc DECIMAL(10,2),
  is_accepting_subscribers BOOLEAN DEFAULT false,
  total_earnings_usdc DECIMAL(20,6) DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

-- Payment addresses (unlinkable to codename externally)
CREATE TABLE IF NOT EXISTS source_payment_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- HUMINT Submissions
CREATE TABLE IF NOT EXISTS humint_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id) ON DELETE CASCADE,
  
  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  
  -- Context
  location_region TEXT,
  location_country TEXT,
  event_tag TEXT,
  occurred_at TIMESTAMPTZ,
  is_time_sensitive BOOLEAN DEFAULT false,
  
  -- Cryptographic proof
  content_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  
  -- Verification (crowd-sourced)
  verification_status TEXT DEFAULT 'unverified',
  verified_count INTEGER DEFAULT 0,
  contradicted_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  
  -- Metadata
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings from consumers
CREATE TABLE IF NOT EXISTS submission_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES humint_submissions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('verified', 'contradicted', 'neutral')),
  evidence_url TEXT,
  comment TEXT,
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, user_id)
);

-- Source subscriptions (direct to source)
CREATE TABLE IF NOT EXISTS source_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES humint_sources(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  amount_paid_usdc DECIMAL(10,2),
  payment_tx_hash TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, subscriber_id)
);

-- NFT source lists extension
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS nft_token_id BIGINT UNIQUE;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS subscription_price_usdc DECIMAL(10,2);
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS subscription_duration_days INTEGER DEFAULT 30;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS is_nft BOOLEAN DEFAULT false;

-- List subscriptions
CREATE TABLE IF NOT EXISTS list_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES source_lists(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  amount_paid_usdc DECIMAL(10,2),
  payment_tx_hash TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, subscriber_id)
);

-- Intel bounties
CREATE TABLE IF NOT EXISTS intel_bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  domains TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  
  reward_usdc DECIMAL(10,2) NOT NULL,
  min_source_reputation INTEGER DEFAULT 50,
  
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'paid', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  
  fulfilled_by UUID REFERENCES humint_sources(id),
  fulfillment_submission_id UUID REFERENCES humint_submissions(id),
  payment_tx_hash TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HUMINT sources can also be added to regular source lists
CREATE TABLE IF NOT EXISTS source_list_humint_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES source_lists(id) ON DELETE CASCADE,
  humint_source_id UUID REFERENCES humint_sources(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, humint_source_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_humint_sources_reputation ON humint_sources(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_humint_sources_regions ON humint_sources USING GIN(regions);
CREATE INDEX IF NOT EXISTS idx_humint_sources_domains ON humint_sources USING GIN(domains);
CREATE INDEX IF NOT EXISTS idx_humint_sources_codename ON humint_sources(codename);
CREATE INDEX IF NOT EXISTS idx_humint_submissions_source ON humint_submissions(source_id);
CREATE INDEX IF NOT EXISTS idx_humint_submissions_event ON humint_submissions(event_tag);
CREATE INDEX IF NOT EXISTS idx_humint_submissions_region ON humint_submissions(location_region);
CREATE INDEX IF NOT EXISTS idx_humint_submissions_submitted ON humint_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_ratings_submission ON submission_ratings(submission_id);
CREATE INDEX IF NOT EXISTS idx_source_subscriptions_source ON source_subscriptions(source_id);
CREATE INDEX IF NOT EXISTS idx_source_subscriptions_subscriber ON source_subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_intel_bounties_status ON intel_bounties(status);

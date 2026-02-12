-- Migration 011: Bounty Moderation & Legal Attestation
-- Implements Option 2 safeguards against malicious intel requests

-- Add moderation and attestation fields to intel_bounties
ALTER TABLE intel_bounties 
ADD COLUMN IF NOT EXISTS intended_use TEXT,
ADD COLUMN IF NOT EXISTS legal_attestation_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create category allowlist table
CREATE TABLE IF NOT EXISTS bounty_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  auto_approve BOOLEAN DEFAULT false, -- Some categories can skip review
  requires_kyc BOOLEAN DEFAULT false, -- Some categories need verified identity
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create blocked keywords table for auto-rejection
CREATE TABLE IF NOT EXISTS bounty_blocked_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default categories
INSERT INTO bounty_categories (name, description, auto_approve) VALUES
  ('geopolitics', 'Government policy, international relations, sanctions', true),
  ('market_intelligence', 'Public company intel, industry trends, market movements', true),
  ('osint', 'Open source intelligence, public records, social media analysis', true),
  ('conflict_zones', 'Military movements, humanitarian situations in conflict areas', false),
  ('corporate', 'Corporate strategy, M&A activity, executive changes', false),
  ('crypto_defi', 'Cryptocurrency projects, DeFi protocols, blockchain intel', true),
  ('technology', 'Tech industry, product launches, research breakthroughs', true),
  ('energy', 'Oil, gas, renewables, energy infrastructure', true),
  ('general', 'Other intelligence requests', false)
ON CONFLICT (name) DO NOTHING;

-- Insert blocked keywords (PII/targeting indicators)
INSERT INTO bounty_blocked_keywords (keyword, reason) VALUES
  ('home address', 'Personal targeting'),
  ('residential address', 'Personal targeting'),
  ('phone number', 'Personal contact info'),
  ('social security', 'Identity theft risk'),
  ('ssn', 'Identity theft risk'),
  ('passport', 'Identity document'),
  ('bank account', 'Financial targeting'),
  ('credit card', 'Financial targeting'),
  ('real name of', 'Doxxing'),
  ('true identity', 'Doxxing'),
  ('where does .* live', 'Stalking'),
  ('daily routine', 'Stalking'),
  ('schedule of', 'Stalking'),
  ('children', 'Child safety'),
  ('family members', 'Family targeting'),
  ('girlfriend', 'Relationship targeting'),
  ('boyfriend', 'Relationship targeting'),
  ('spouse', 'Relationship targeting'),
  ('medical records', 'Health privacy'),
  ('health information', 'Health privacy'),
  ('revenge', 'Malicious intent'),
  ('blackmail', 'Criminal intent'),
  ('extort', 'Criminal intent')
ON CONFLICT (keyword) DO NOTHING;

-- Index for faster keyword scanning
CREATE INDEX IF NOT EXISTS idx_bounties_review_status ON intel_bounties(review_status);
CREATE INDEX IF NOT EXISTS idx_bounties_category ON intel_bounties(category);

-- Update existing bounties to approved (grandfather them in)
UPDATE intel_bounties SET review_status = 'auto_approved' WHERE review_status IS NULL OR review_status = 'pending';

COMMENT ON TABLE bounty_categories IS 'Allowed categories for intel bounties with moderation rules';
COMMENT ON TABLE bounty_blocked_keywords IS 'Keywords that trigger auto-rejection of bounty requests';
COMMENT ON COLUMN intel_bounties.intended_use IS 'Required: How the requester plans to use this intelligence';
COMMENT ON COLUMN intel_bounties.legal_attestation_at IS 'Timestamp when user agreed to legal terms (no harm, lawful use)';
COMMENT ON COLUMN intel_bounties.review_status IS 'Moderation status: pending requires admin review before visibility';

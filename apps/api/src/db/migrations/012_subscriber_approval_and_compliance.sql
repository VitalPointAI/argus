-- Migration 012: Subscriber Approval & AI Compliance Agent
-- Sources can vet subscribers, AI reviews all content

-- ============================================
-- Subscriber Approval System
-- ============================================

-- Add approval workflow to subscriptions
ALTER TABLE source_subscriptions 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS subscriber_message TEXT; -- Why they want to subscribe

-- Subscriber reputation (for sources to evaluate)
CREATE TABLE IF NOT EXISTS subscriber_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Activity metrics
  account_age_days INTEGER DEFAULT 0,
  bounties_posted INTEGER DEFAULT 0,
  bounties_fulfilled INTEGER DEFAULT 0, -- Their bounties that got fulfilled
  subscriptions_count INTEGER DEFAULT 0,
  tips_given_count INTEGER DEFAULT 0,
  total_spent_usdc REAL DEFAULT 0,
  
  -- Trust signals
  email_verified BOOLEAN DEFAULT false,
  identity_verified BOOLEAN DEFAULT false, -- KYC if implemented
  vouched_by_count INTEGER DEFAULT 0, -- Other trusted users vouch
  
  -- Negative signals
  reports_against INTEGER DEFAULT 0,
  subscriptions_revoked INTEGER DEFAULT 0, -- Sources revoked their access
  
  -- Computed score (0-100)
  reputation_score INTEGER DEFAULT 10,
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Source can set subscription requirements
ALTER TABLE humint_sources
ADD COLUMN IF NOT EXISTS min_subscriber_reputation INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS require_approval BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_approve_above_reputation INTEGER DEFAULT 80; -- Auto-approve high-rep subscribers

-- ============================================
-- AI Compliance Agent System
-- ============================================

-- Track AI reviews of content
CREATE TABLE IF NOT EXISTS compliance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What's being reviewed
  content_type TEXT NOT NULL CHECK (content_type IN ('bounty_request', 'intel_submission', 'source_profile')),
  content_id UUID NOT NULL,
  
  -- Review details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'needs_revision', 'rejected')),
  ai_model TEXT, -- Which model reviewed
  ai_analysis JSONB, -- Full analysis from AI
  
  -- Issues found
  issues_found JSONB DEFAULT '[]', -- Array of {type, severity, description, suggestion}
  risk_score INTEGER DEFAULT 0, -- 0-100, higher = more concerning
  
  -- Resolution
  revision_requested_at TIMESTAMP,
  revision_message TEXT, -- What AI asked user to fix
  user_response TEXT, -- User's response/revision
  
  -- Final decision
  final_status TEXT CHECK (final_status IN ('approved', 'rejected')),
  final_reason TEXT,
  reviewed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Compliance rules (configurable)
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  rule_type TEXT NOT NULL, -- 'keyword', 'pattern', 'category', 'ai_check'
  applies_to TEXT NOT NULL, -- 'bounty_request', 'intel_submission', 'all'
  
  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_config JSONB NOT NULL, -- Depends on rule_type
  
  -- Action
  action TEXT NOT NULL CHECK (action IN ('flag', 'require_revision', 'auto_reject')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message_template TEXT, -- Message to show user
  
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Feed-Based Intel Delivery
-- ============================================

-- Source feeds (what subscribers see)
CREATE TABLE IF NOT EXISTS source_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES humint_sources(id) ON DELETE CASCADE,
  
  -- Content
  submission_id UUID REFERENCES humint_submissions(id), -- The underlying submission
  title TEXT NOT NULL,
  summary TEXT,
  content_preview TEXT, -- Truncated for non-subscribers
  
  -- Bounty connection (if this fulfills a bounty)
  fulfills_bounty_id UUID REFERENCES intel_bounties(id),
  
  -- Visibility
  visibility TEXT NOT NULL DEFAULT 'subscribers' CHECK (visibility IN ('public', 'subscribers', 'premium')),
  
  -- Engagement
  view_count INTEGER DEFAULT 0,
  reaction_count INTEGER DEFAULT 0,
  
  -- Compliance
  compliance_review_id UUID REFERENCES compliance_reviews(id),
  
  published_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification details
  type TEXT NOT NULL, -- 'bounty_fulfilled', 'subscription_request', 'new_feed_item', etc.
  title TEXT NOT NULL,
  body TEXT,
  data JSONB, -- Additional context
  
  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  
  -- Delivery
  delivered_via JSONB DEFAULT '[]', -- ['email', 'push', 'in_app']
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Insert Default Compliance Rules
-- ============================================

INSERT INTO compliance_rules (rule_type, applies_to, rule_name, rule_config, action, severity, message_template) VALUES
-- PII Detection
('ai_check', 'all', 'pii_detection', '{"check": "personal_identifiable_information", "includes": ["full_names_with_context", "addresses", "phone_numbers", "ssn", "financial_accounts"]}', 'require_revision', 'high', 'This content appears to contain personal identifiable information. Please remove or redact: {{issues}}'),

-- Targeting Detection
('ai_check', 'bounty_request', 'targeting_detection', '{"check": "individual_targeting", "signals": ["location_tracking", "schedule_monitoring", "relationship_mapping"]}', 'auto_reject', 'critical', 'This request appears designed to target or track an individual, which violates our terms of service.'),

-- Doxxing Detection
('ai_check', 'all', 'doxxing_detection', '{"check": "doxxing_intent", "signals": ["identity_reveal", "anonymous_unmasking", "private_info_exposure"]}', 'auto_reject', 'critical', 'This content appears intended to expose private information about individuals.'),

-- Quality Check for Submissions
('ai_check', 'intel_submission', 'quality_check', '{"check": "intel_quality", "min_detail_score": 40, "requires": ["source_context", "verifiability_notes"]}', 'require_revision', 'medium', 'This submission needs more detail or context. Please add: {{suggestions}}'),

-- Harmful Content
('ai_check', 'all', 'harmful_content', '{"check": "harmful_intent", "categories": ["violence", "illegal_activity", "harassment"]}', 'auto_reject', 'critical', 'This content violates our community guidelines regarding harmful content.')
ON CONFLICT DO NOTHING;

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_source_subscriptions_approval ON source_subscriptions(source_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_compliance_reviews_status ON compliance_reviews(content_type, status);
CREATE INDEX IF NOT EXISTS idx_source_feed_items_source ON source_feed_items(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriber_reputation_score ON subscriber_reputation(reputation_score);

-- ============================================
-- Update existing data
-- ============================================

-- Set existing subscriptions to approved (grandfather in)
UPDATE source_subscriptions SET approval_status = 'approved', approved_at = created_at WHERE approval_status IS NULL;

COMMENT ON TABLE compliance_reviews IS 'AI-driven content review for bounty requests and intel submissions';
COMMENT ON TABLE subscriber_reputation IS 'Reputation scores for subscribers, helps sources vet who can access their feed';
COMMENT ON TABLE source_feed_items IS 'Published intel from sources - fulfillments go here, not direct to requester';
COMMENT ON TABLE notifications IS 'User notifications for bounty fulfillment, subscription requests, etc.';

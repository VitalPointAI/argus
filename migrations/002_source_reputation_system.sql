-- Source Reputation System Migration
-- Phase 2: User ratings, reliability tracking, and anti-gaming measures

-- Add trust score to users (for weighted ratings)
ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score REAL NOT NULL DEFAULT 1.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_ratings_given INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accurate_ratings INTEGER NOT NULL DEFAULT 0;

-- Source reliability history (track score changes over time)
CREATE TABLE IF NOT EXISTS reliability_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  old_score REAL NOT NULL,
  new_score REAL NOT NULL,
  change_reason TEXT NOT NULL, -- 'user_rating', 'decay', 'cross_reference', 'manual', 'anomaly_correction'
  change_metadata JSONB NOT NULL DEFAULT '{}', -- additional context
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reliability_history_source_id ON reliability_history(source_id);
CREATE INDEX IF NOT EXISTS idx_reliability_history_changed_at ON reliability_history(changed_at);

-- User ratings for sources
CREATE TABLE IF NOT EXISTS source_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  weight REAL NOT NULL DEFAULT 1.0, -- based on user trust score at time of rating
  is_flagged BOOLEAN NOT NULL DEFAULT false, -- for anomaly detection
  flag_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, user_id) -- one rating per user per source
);

CREATE INDEX IF NOT EXISTS idx_source_ratings_source_id ON source_ratings(source_id);
CREATE INDEX IF NOT EXISTS idx_source_ratings_user_id ON source_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_source_ratings_created_at ON source_ratings(created_at);

-- Daily rating limits per user (anti-gaming)
CREATE TABLE IF NOT EXISTS user_rating_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  rating_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_rating_limits_user_date ON user_rating_limits(user_id, date);

-- Cross-reference accuracy tracking (for source reliability)
CREATE TABLE IF NOT EXISTS cross_reference_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES article_claims(id) ON DELETE SET NULL,
  was_accurate BOOLEAN NOT NULL,
  verification_source TEXT, -- what verified/contradicted it
  confidence REAL NOT NULL DEFAULT 0.5,
  verified_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cross_reference_source_id ON cross_reference_results(source_id);
CREATE INDEX IF NOT EXISTS idx_cross_reference_content_id ON cross_reference_results(content_id);

-- Rating anomaly log (for detecting manipulation)
CREATE TABLE IF NOT EXISTS rating_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL, -- 'spike', 'coordinated', 'bot_suspected'
  details JSONB NOT NULL DEFAULT '{}',
  affected_rating_ids JSONB NOT NULL DEFAULT '[]', -- UUIDs of flagged ratings
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolution_action TEXT
);

CREATE INDEX IF NOT EXISTS idx_rating_anomalies_source_id ON rating_anomalies(source_id);
CREATE INDEX IF NOT EXISTS idx_rating_anomalies_detected_at ON rating_anomalies(detected_at);

-- Add last_article_at to sources for decay tracking
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_article_at TIMESTAMP;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS decay_applied_at TIMESTAMP;

-- View for source reputation stats
CREATE OR REPLACE VIEW source_reputation_stats AS
SELECT 
  s.id as source_id,
  s.name,
  s.reliability_score,
  s.last_article_at,
  s.last_fetched_at,
  COALESCE(COUNT(sr.id), 0) as total_ratings,
  COALESCE(AVG(sr.rating), 0) as avg_rating,
  COALESCE(SUM(sr.rating * sr.weight) / NULLIF(SUM(sr.weight), 0), 0) as weighted_avg_rating,
  COALESCE((
    SELECT COUNT(*) FROM cross_reference_results cr 
    WHERE cr.source_id = s.id AND cr.was_accurate = true
  ), 0) as accurate_claims,
  COALESCE((
    SELECT COUNT(*) FROM cross_reference_results cr 
    WHERE cr.source_id = s.id
  ), 0) as total_claims_verified,
  CASE 
    WHEN s.last_article_at IS NULL THEN true
    WHEN s.last_article_at < NOW() - INTERVAL '30 days' THEN true
    ELSE false
  END as is_stale
FROM sources s
LEFT JOIN source_ratings sr ON s.id = sr.source_id AND sr.is_flagged = false
GROUP BY s.id, s.name, s.reliability_score, s.last_article_at, s.last_fetched_at;

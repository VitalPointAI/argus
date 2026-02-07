-- Add article_claims table for storing extracted claims from articles
CREATE TABLE IF NOT EXISTS article_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 50,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'unverified',
  verification_method TEXT,
  verified_by JSONB NOT NULL DEFAULT '[]',
  contradicted_by JSONB NOT NULL DEFAULT '[]',
  extracted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by content_id
CREATE INDEX IF NOT EXISTS idx_article_claims_content_id ON article_claims(content_id);

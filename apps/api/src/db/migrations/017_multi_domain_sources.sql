-- Migration: Multi-domain sources
-- Sources can now belong to multiple domains
-- Created: 2026-02-15

-- Junction table for source-domain relationships
CREATE TABLE IF NOT EXISTS source_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, domain_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_source_domains_source ON source_domains(source_id);
CREATE INDEX IF NOT EXISTS idx_source_domains_domain ON source_domains(domain_id);

-- Migrate existing domainId relationships to junction table
INSERT INTO source_domains (source_id, domain_id)
SELECT id, domain_id FROM sources WHERE domain_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Note: Keep domainId column for backwards compatibility as "primary" domain
-- New code should use source_domains table for domain associations

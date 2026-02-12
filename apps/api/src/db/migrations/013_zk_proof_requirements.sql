-- Migration 013: ZK Proof Requirements for Intel Bounties
-- AI identifies what proof is needed, sources provide ZK proofs to fulfill

-- Add proof requirements to bounties
ALTER TABLE intel_bounties
ADD COLUMN IF NOT EXISTS proof_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS proof_requirements_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS proof_requirements_ai_model TEXT;

-- Proof templates (reusable proof type definitions)
CREATE TABLE IF NOT EXISTS zk_proof_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name TEXT NOT NULL UNIQUE, -- 'location_proximity', 'timestamp_range', etc.
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Proof configuration
  proof_type TEXT NOT NULL, -- 'location', 'timestamp', 'document', 'image', 'multi_witness', 'credential'
  circuit_id TEXT, -- Reference to deployed ZK circuit (future)
  
  -- Parameters schema (what the bounty creator/AI must specify)
  parameter_schema JSONB NOT NULL, -- JSON Schema for required params
  -- Example for location: {"type": "object", "properties": {"lat": {"type": "number"}, "lng": {"type": "number"}, "radius_km": {"type": "number"}}}
  
  -- Verification
  verification_method TEXT NOT NULL DEFAULT 'server', -- 'server', 'onchain', 'hybrid'
  
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Submitted proofs from sources
CREATE TABLE IF NOT EXISTS zk_proof_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links
  submission_id UUID NOT NULL REFERENCES humint_submissions(id) ON DELETE CASCADE,
  bounty_id UUID REFERENCES intel_bounties(id),
  source_id UUID NOT NULL REFERENCES humint_sources(id),
  
  -- Which requirement this fulfills
  requirement_index INTEGER NOT NULL, -- Index in bounty's proof_requirements array
  proof_template_id UUID REFERENCES zk_proof_templates(id),
  
  -- The proof itself
  proof_type TEXT NOT NULL,
  proof_data JSONB NOT NULL, -- The actual ZK proof (public inputs + proof bytes)
  public_inputs JSONB, -- Public inputs that can be revealed
  
  -- Verification
  verification_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'failed', 'expired'
  verified_at TIMESTAMP,
  verification_result JSONB, -- Details of verification
  
  -- For multi-witness proofs
  witness_count INTEGER DEFAULT 1,
  required_witnesses INTEGER DEFAULT 1,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default proof templates
INSERT INTO zk_proof_templates (name, display_name, description, proof_type, parameter_schema, verification_method) VALUES
(
  'location_proximity',
  'Location Proximity',
  'Prove presence within a radius of target coordinates without revealing exact location',
  'location',
  '{"type": "object", "required": ["target_lat", "target_lng", "radius_km"], "properties": {"target_lat": {"type": "number", "description": "Target latitude"}, "target_lng": {"type": "number", "description": "Target longitude"}, "radius_km": {"type": "number", "description": "Maximum distance from target in kilometers"}}}',
  'server'
),
(
  'timestamp_range',
  'Timestamp Range',
  'Prove content was created/captured within a specific time window',
  'timestamp',
  '{"type": "object", "required": ["not_before", "not_after"], "properties": {"not_before": {"type": "string", "format": "date-time", "description": "Earliest allowed timestamp"}, "not_after": {"type": "string", "format": "date-time", "description": "Latest allowed timestamp"}}}',
  'server'
),
(
  'document_contains',
  'Document Contains',
  'Prove possession of a document containing specific keywords or patterns without revealing full content',
  'document',
  '{"type": "object", "required": ["required_keywords"], "properties": {"required_keywords": {"type": "array", "items": {"type": "string"}, "description": "Keywords that must appear in document"}, "document_type": {"type": "string", "description": "Expected document type (pdf, email, contract, etc.)"}}}',
  'server'
),
(
  'image_metadata',
  'Image Metadata',
  'Prove image has specific EXIF metadata properties without revealing the image',
  'image',
  '{"type": "object", "properties": {"min_resolution": {"type": "object", "properties": {"width": {"type": "integer"}, "height": {"type": "integer"}}}, "device_type": {"type": "string"}, "has_gps": {"type": "boolean"}}}',
  'server'
),
(
  'multi_source_corroboration',
  'Multi-Source Corroboration',
  'Require multiple independent sources to confirm the same information',
  'multi_witness',
  '{"type": "object", "required": ["min_witnesses"], "properties": {"min_witnesses": {"type": "integer", "minimum": 2, "description": "Minimum number of independent confirmations required"}}}',
  'server'
),
(
  'verifiable_credential',
  'Verifiable Credential',
  'Prove possession of a verifiable credential (press pass, employee ID, etc.)',
  'credential',
  '{"type": "object", "required": ["credential_type"], "properties": {"credential_type": {"type": "string", "description": "Type of credential required"}, "issuer": {"type": "string", "description": "Required issuer (optional)"}}}',
  'server'
),
(
  'satellite_imagery_match',
  'Satellite Imagery Match',
  'Prove submitted imagery matches known satellite data for a location/time',
  'image',
  '{"type": "object", "required": ["reference_hash", "location"], "properties": {"reference_hash": {"type": "string", "description": "Hash of reference satellite imagery"}, "location": {"type": "object", "properties": {"lat": {"type": "number"}, "lng": {"type": "number"}}}, "max_time_delta_hours": {"type": "integer"}}}',
  'hybrid'
)
ON CONFLICT (name) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proof_submissions_submission ON zk_proof_submissions(submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_bounty ON zk_proof_submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_status ON zk_proof_submissions(verification_status);
CREATE INDEX IF NOT EXISTS idx_bounties_proof_requirements ON intel_bounties USING GIN (proof_requirements);

COMMENT ON TABLE zk_proof_templates IS 'Reusable ZK proof type definitions with parameter schemas';
COMMENT ON TABLE zk_proof_submissions IS 'ZK proofs submitted by sources to fulfill bounty requirements';
COMMENT ON COLUMN intel_bounties.proof_requirements IS 'AI-generated array of proof requirements: [{template: "location_proximity", params: {lat, lng, radius_km}, description: "..."}]';

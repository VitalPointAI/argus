-- Migration 014: NEAR On-Chain Proof Registry
-- Adds support for registering ZK proofs on NEAR blockchain

-- Add on-chain tracking to existing proof submissions
ALTER TABLE zk_proof_submissions
ADD COLUMN IF NOT EXISTS on_chain_tx_hash VARCHAR(128),
ADD COLUMN IF NOT EXISTS on_chain_block_height BIGINT,
ADD COLUMN IF NOT EXISTS on_chain_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS on_chain_contract VARCHAR(128);

-- Create index for on-chain lookups
CREATE INDEX IF NOT EXISTS idx_zk_proof_submissions_on_chain
ON zk_proof_submissions (on_chain_tx_hash)
WHERE on_chain_tx_hash IS NOT NULL;

-- Table to cache on-chain source reputation (synced from NEAR)
CREATE TABLE IF NOT EXISTS near_source_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of codename
    codename VARCHAR(100), -- Nullable for privacy (only filled if source allows)
    reputation_score INT NOT NULL DEFAULT 0, -- 0-100
    total_proofs BIGINT NOT NULL DEFAULT 0,
    verified_proofs BIGINT NOT NULL DEFAULT 0,
    refuted_proofs BIGINT NOT NULL DEFAULT 0,
    total_attestations BIGINT NOT NULL DEFAULT 0,
    avg_confidence INT NOT NULL DEFAULT 0, -- 0-100
    first_proof_block BIGINT,
    last_proof_block BIGINT,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for reputation lookups
CREATE INDEX IF NOT EXISTS idx_near_source_reputation_score
ON near_source_reputation (reputation_score DESC);

-- Table to log all on-chain registrations (audit trail)
CREATE TABLE IF NOT EXISTS near_proof_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id VARCHAR(64) NOT NULL UNIQUE, -- On-chain proof ID
    submission_id UUID REFERENCES zk_proof_submissions(id),
    source_hash VARCHAR(64) NOT NULL,
    intel_hash VARCHAR(64) NOT NULL,
    commitment VARCHAR(64) NOT NULL,
    proof_type VARCHAR(50) NOT NULL,
    block_height BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    contract_id VARCHAR(128) NOT NULL,
    metadata JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, verified, contested, refuted
    attestation_count INT NOT NULL DEFAULT 0,
    avg_confidence INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for proof registry
CREATE INDEX IF NOT EXISTS idx_near_proof_registrations_source
ON near_proof_registrations (source_hash);

CREATE INDEX IF NOT EXISTS idx_near_proof_registrations_intel
ON near_proof_registrations (intel_hash);

CREATE INDEX IF NOT EXISTS idx_near_proof_registrations_status
ON near_proof_registrations (status);

-- Table to track attestations (synced from on-chain)
CREATE TABLE IF NOT EXISTS near_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id VARCHAR(64) NOT NULL REFERENCES near_proof_registrations(proof_id),
    attestor_account VARCHAR(128) NOT NULL, -- NEAR account
    confidence INT NOT NULL, -- 1-100
    note TEXT,
    block_height BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(proof_id, attestor_account)
);

-- Index for attestation lookups
CREATE INDEX IF NOT EXISTS idx_near_attestations_proof
ON near_attestations (proof_id);

CREATE INDEX IF NOT EXISTS idx_near_attestations_attestor
ON near_attestations (attestor_account);

-- Add comment for documentation
COMMENT ON TABLE near_source_reputation IS 'Cached on-chain source reputation from NEAR intel-registry contract';
COMMENT ON TABLE near_proof_registrations IS 'Audit trail of all proofs registered on NEAR blockchain';
COMMENT ON TABLE near_attestations IS 'Third-party attestations synced from on-chain';

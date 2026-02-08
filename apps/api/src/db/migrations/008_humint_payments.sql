-- Migration: HUMINT Payment Infrastructure for 1Click Cross-Chain Payments
-- Enables paying HUMINT sources on any chain via NEAR Intents

-- Add chain info to payment addresses
ALTER TABLE source_payment_addresses 
ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'near',
ADD COLUMN IF NOT EXISTS token_id TEXT;

-- Create payment records table
CREATE TABLE IF NOT EXISTS humint_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES humint_sources(id) ON DELETE CASCADE,
  
  -- Payment details
  amount_usdc REAL NOT NULL,
  reason TEXT NOT NULL, -- 'subscription', 'bounty', 'tip'
  reference_id UUID, -- subscription or bounty ID
  
  -- 1Click details
  deposit_address TEXT, -- 1Click temp deposit address
  recipient_address TEXT NOT NULL,
  recipient_chain TEXT NOT NULL,
  recipient_token_id TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, deposited, processing, success, failed, refunded
  one_click_quote_id TEXT,
  deposit_tx_hash TEXT,
  settlement_tx_hash TEXT,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_humint_payments_status ON humint_payments(status);
CREATE INDEX IF NOT EXISTS idx_humint_payments_source ON humint_payments(source_id);

-- Index for source payment addresses by chain
CREATE INDEX IF NOT EXISTS idx_source_payment_addresses_chain ON source_payment_addresses(chain);

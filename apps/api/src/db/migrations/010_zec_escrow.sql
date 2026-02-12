-- Migration: ZEC Escrow and Withdrawal System
-- Created: 2026-02-12

-- Escrow balances (internal tracking, not on-chain yet)
CREATE TABLE IF NOT EXISTS humint_escrow_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES humint_sources(id) ON DELETE CASCADE,
  balance_zec REAL NOT NULL DEFAULT 0,
  total_earned_zec REAL NOT NULL DEFAULT 0,
  total_withdrawn_zec REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint on source_id (one balance per source)
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_balances_source ON humint_escrow_balances(source_id);

-- Withdrawal queue with time-delayed processing
CREATE TABLE IF NOT EXISTS humint_withdrawal_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES humint_sources(id) ON DELETE CASCADE,
  
  -- Amount in fixed denominations
  amount_zec REAL NOT NULL,
  denominations JSONB NOT NULL DEFAULT '[]', -- e.g., [2.5, 2.5] for 5 ZEC
  
  -- Recipient address (shielded z-address)
  recipient_z_address TEXT NOT NULL,
  
  -- Time-delayed processing
  queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMP NOT NULL, -- Random time 1-48h from queued_at
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Transaction details (after processing)
  tx_ids JSONB DEFAULT '[]', -- Array of tx IDs (one per denomination)
  error_message TEXT,
  
  -- Completion
  processed_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Index for finding pending withdrawals
CREATE INDEX IF NOT EXISTS idx_withdrawal_queue_pending 
ON humint_withdrawal_queue(status, scheduled_for) 
WHERE status = 'pending';

-- Escrow transactions (credits and debits)
CREATE TABLE IF NOT EXISTS humint_escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES humint_sources(id) ON DELETE CASCADE,
  
  -- Transaction type
  type TEXT NOT NULL, -- 'credit' (bounty accepted) or 'debit' (withdrawal)
  amount_zec REAL NOT NULL,
  
  -- Reference
  reference_type TEXT, -- 'bounty', 'tip', 'subscription', 'withdrawal'
  reference_id UUID, -- bounty_id, withdrawal_id, etc.
  
  -- Balance after transaction
  balance_after REAL NOT NULL,
  
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_transactions_source 
ON humint_escrow_transactions(source_id, created_at DESC);

-- Add z_address to source payment addresses if not exists
-- (this stores their wallet z-address separately from other payment methods)
ALTER TABLE source_payment_addresses 
ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'payment';

-- Comment explaining address types:
-- 'payment' = existing payment addresses for receiving funds
-- 'zec_wallet' = their embedded wallet z-address for ZEC withdrawals

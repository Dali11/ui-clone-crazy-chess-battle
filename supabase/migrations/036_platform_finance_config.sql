-- Migration 036: Expand withdrawal_config into a full platform finance config
-- Adds minimum/maximum withdrawal amounts, minimum deposit amount,
-- processing fee %, and daily withdrawal limits.

ALTER TABLE public.withdrawal_config
  ADD COLUMN IF NOT EXISTS min_withdrawal_cents   INT NOT NULL DEFAULT 1000,    -- MK 10 minimum
  ADD COLUMN IF NOT EXISTS max_withdrawal_cents   INT NOT NULL DEFAULT 5000000, -- MK 50,000 maximum
  ADD COLUMN IF NOT EXISTS min_deposit_cents      INT NOT NULL DEFAULT 500,     -- MK 5 minimum
  ADD COLUMN IF NOT EXISTS processing_fee_pct     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS daily_withdrawal_limit_cents INT NOT NULL DEFAULT 1000000, -- MK 10,000/day
  ADD COLUMN IF NOT EXISTS withdrawal_fee_cents  INT NOT NULL DEFAULT 0,        -- flat fee per withdrawal
  ADD COLUMN IF NOT EXISTS deposit_fee_cents      INT NOT NULL DEFAULT 0;        -- flat fee per deposit

-- Add admin_notes to deposits for manual credit audit trail
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS credited_by UUID REFERENCES public.profiles(id);

-- Add admin_notes to withdrawals (already has admin_notes, but add processed_by_name)
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update the admin log to support finance config changes
-- (admin_logs table already exists, no changes needed)

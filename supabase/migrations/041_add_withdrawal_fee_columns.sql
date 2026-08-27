-- Migration 041: Add fee and net_amount columns to withdrawals table
-- The withdrawal request route already writes to these columns (fee, net_amount)
-- but they were never created on the actual table, so the UPDATE silently failed.
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee INTEGER DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS net_amount INTEGER DEFAULT 0;

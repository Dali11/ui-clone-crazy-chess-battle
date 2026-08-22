-- Fix: The deposits table CHECK constraint doesn't include 'processing',
-- but both the verify route and webhook route use 'processing' as an atomic
-- guard to prevent double-crediting. The UPDATE to 'processing' was silently
-- failing, so credit_wallet never ran and balances were never updated.

-- Drop the old constraint and add the corrected one
ALTER TABLE public.deposits
  DROP CONSTRAINT IF EXISTS deposits_status_check;

ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_status_check
  CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled'));

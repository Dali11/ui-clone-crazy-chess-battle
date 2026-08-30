-- ============================================================
-- 026: PawaPay integration — pan-African mobile money payments.
-- Adds payment_provider, pawapay_ref, and country columns to
-- deposits and withdrawals to support PawaPay alongside PayChangu.
-- ============================================================

-- ── deposits table ──────────────────────────────────────────
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'paychangu';

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS pawapay_ref text;

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS country text;

-- ── withdrawals table ──────────────────────────────────────
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'paychangu';

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS pawapay_ref text;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS country text;

-- Index for fast PawaPay webhook lookups
CREATE INDEX IF NOT EXISTS idx_deposits_pawapay_ref ON public.deposits (pawapay_ref) WHERE pawapay_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_pawapay_ref ON public.withdrawals (pawapay_ref) WHERE pawapay_ref IS NOT NULL;

-- Index for country-based admin filtering
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles (country) WHERE country IS NOT NULL;

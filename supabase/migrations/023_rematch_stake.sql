-- ============================================================
-- 023: Add stake support to rematch_offers
-- Allows rematches of staked battles to also be staked,
-- with the same stake amount as the original battle.
-- ============================================================

ALTER TABLE public.rematch_offers
  ADD COLUMN IF NOT EXISTS stake INT DEFAULT 0;

COMMENT ON COLUMN public.rematch_offers.stake IS
  'Stake amount in MWK for staked battle rematches. 0 = free rematch.';

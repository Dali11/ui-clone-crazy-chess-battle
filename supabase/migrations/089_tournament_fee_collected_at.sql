-- 089: fee_collected_at on tournaments
--
-- The Command Centre overview attributes player-led tournament platform
-- fees (5% of gross entry fees) to a period by timestamp. It previously
-- filtered on tournaments.updated_at — a column that does not exist on
-- this table, which 500'd the whole /api/admin/commandcentre/overview
-- route ("column tournaments.updated_at does not exist").
--
-- The fee is written in exactly two places (settleFixedPoolEntryFees at
-- start for fixed-pool tournaments, finish.ts for entry-fee tournaments),
-- so a dedicated fee_collected_at set alongside platform_fee_collected is
-- an exact record — no proxy needed.
--
-- No backfill: as of 2026-09-17 there are zero tournaments with
-- platform_fee_collected > 0, so there is no historical fee revenue to
-- re-date.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS fee_collected_at timestamptz;

COMMENT ON COLUMN public.tournaments.fee_collected_at IS
  'When the platform 5% cut of a player-created tournament''s entry fees was settled (set atomically with platform_fee_collected).';

-- 090: Track entry fees on house fixed-pool tournaments
--
-- House (admin-hosted) fixed-pool tournaments that charge an entry fee are
-- platform revenue: the fee is pure income for the house (affiliate-
-- eligible, see 084), while the fixed prize is a house cost. Platform
-- profit on such a tournament = total entry fees collected − prize pool.
-- Free-entry fixed pools are pure cost (fees − prize = −prize).
--
-- entry_fees_collected was only incremented for PLAYER-created fixed pools
-- (join route). Going forward the join route increments it for every fixed
-- pool, so the Command Centre can compute the house net per tournament
-- directly from the row. This migration backfills the column for house
-- fixed-pool tournaments from the deposits ledger (reference
-- 'tournament:<id>:entry', abs(amount) — wallet-debit rows are negative).

UPDATE public.tournaments t
SET entry_fees_collected = COALESCE(sub.total_fees, 0)
FROM (
  SELECT regexp_replace(reference, '^tournament:|:entry$', '', 'g') AS tournament_id,
         SUM(ABS(amount)) AS total_fees
  FROM public.deposits
  WHERE method = 'tournament_entry'
    AND status = 'success'
    AND reference LIKE 'tournament:%:entry'
  GROUP BY 1
) sub
WHERE t.pool_source = 'fixed'
  AND NOT COALESCE(t.is_player_created, false)
  AND t.id::text = sub.tournament_id;

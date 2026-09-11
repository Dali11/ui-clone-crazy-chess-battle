-- 056: Fix battle_queue uniqueness that permanently bricked repeat players.
--
-- The original UNIQUE (player_id, stake, status) index meant a player could
-- ever have only ONE 'expired' / 'left' / 'matched' row per stake. Every
-- status transition after the first one failed with 23505 (duplicate key):
--
--   * heal-stuck timeout refunds silently failed -> stakes locked in escrow
--     forever (10 players / MK10,000 stuck before this fix, oldest 2026-08-29)
--   * /battles/leave silently reported "alreadyLeft" without refunding
--   * the matchmaker silently skipped returning players — they could queue
--     but never be matched again
--
-- The real invariant is "at most one ACTIVE queue entry per player". A
-- partial unique index enforces exactly that, leaving terminal statuses free.
--
-- NOTE: applied directly to production on 2026-09-11 (the constraint existed
-- there as a unique INDEX, not a table constraint). This file records it.

DROP INDEX IF EXISTS battle_queue_player_id_stake_status_key;

CREATE UNIQUE INDEX battle_queue_one_active_per_player
  ON battle_queue(player_id)
  WHERE status = 'waiting';

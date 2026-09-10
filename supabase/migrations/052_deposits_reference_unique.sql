-- 052: deposits_reference_unique — DB-level idempotency backstop for money paths.
--
-- Applied to production on 2026-09-10 via the Supabase Management API (by Elara).
-- The secure-wallet admin migration route now carries the same definition.
--
-- IMPORTANT: the index is deliberately SCOPED to exactly-once flows. A global
-- unique index on deposits.reference would break legitimate repeatable rows:
--   battle_queue:{userId}:{stake}           (repeated queue joins)
--   battle_challenge_{create,accept}:{...}  (repeated stakes)
--   tournament:{tournamentId}:entry         (multiple players per tournament)
--   tournament:{id}:refund:min_players_not_met (one row per player)
--   battle:{gameId}:refund                  (legacy draw refunds: one row per player)
--
-- Historical duplicate battle_queue_refund rows (13 refs / 16 rows, from
-- pre-guard double-taps) were preserved but suffixed ':dup-N' so the unique
-- index could be created without destroying the audit trail.

CREATE UNIQUE INDEX IF NOT EXISTS deposits_reference_unique
  ON deposits (reference)
  WHERE reference LIKE 'league:%'
     OR reference LIKE 'battle_queue_refund:%'
     OR reference LIKE 'battle_queue_timeout:%'
     OR reference LIKE 'battle_cancel:%'
     OR reference LIKE 'heal_stuck:%'
     OR reference LIKE 'battle:%:draw:%'
     OR reference LIKE 'expired_challenge:%'
     OR reference LIKE 'cleanup_expired:%';

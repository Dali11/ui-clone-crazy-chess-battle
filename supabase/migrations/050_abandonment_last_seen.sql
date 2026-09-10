-- 050: Abandonment detection (2-minute auto-resign)
--
-- Tracks the last time each player was actively connected to their game
-- (the client polls /api/game/timeout-check every 4s while on the game
-- page; each poll refreshes the polling player's *_last_seen). If a player
-- goes silent for ABANDON_SECONDS (120s) mid-game, they are deemed to have
-- abandoned and the game resolves as a resignation in the opponent's favor.
--
-- NULL = the player hasn't been seen since this feature shipped; they are
-- exempt until their first post-deploy poll sets the column (grace period
-- for games already in progress).
--
-- Applied to production via the Supabase management API on 2026-09-10.

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS white_last_seen TIMESTAMPTZ;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS black_last_seen TIMESTAMPTZ;

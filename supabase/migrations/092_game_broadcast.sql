-- 092: Live game broadcasting (2026-09-25)
-- Broadcast model:
--   * tournament games  -> always broadcast (public events)
--   * staked battles   -> always broadcast (public money matches)
--   * free play        -> opt-in via games.broadcast toggle (default false)
-- The Live list (dashboard + /api/games/live) surfaces games with
-- status='playing' that are broadcastable per the rules above.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS broadcast boolean NOT NULL DEFAULT false;

-- Cheap scan for the live-games query: only in-progress games.
CREATE INDEX IF NOT EXISTS idx_games_live_broadcast
  ON public.games (created_at DESC)
  WHERE status = 'playing';

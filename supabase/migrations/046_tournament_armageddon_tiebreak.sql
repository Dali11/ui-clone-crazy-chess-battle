-- Add is_tiebreak column to games table for knockout tournament Armageddon tiebreaks.
-- When a knockout game ends in a draw, an Armageddon tiebreak game is created with
-- this flag set to true. The tiebreak game has draw odds for Black (a draw counts
-- as a Black win), so it always produces a decisive result.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS is_tiebreak BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick lookup of tiebreak games by tournament
CREATE INDEX IF NOT EXISTS idx_games_tiebreak ON public.games(is_tiebreak) WHERE is_tiebreak = true;

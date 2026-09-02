-- Add admin_override flag to league_fixtures so we can distinguish
-- admin-set results from game-decided results
ALTER TABLE public.league_fixtures
  ADD COLUMN IF NOT EXISTS admin_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Add double_forfeit as a valid result value
COMMENT ON COLUMN public.league_fixtures.result IS 'pending, home_win, away_win, draw, double_forfeit';

-- ============================================================
-- League Season Archives & Payouts
-- ============================================================

-- Season archives: snapshot of final standings when a league season completes
CREATE TABLE IF NOT EXISTS public.league_season_archives (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID NOT NULL REFERENCES public.premier_leagues(id) ON DELETE CASCADE,
  season_id           TEXT,
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  final_standings     JSONB NOT NULL DEFAULT '[]'::jsonb,
  champion_player_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  runner_up_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing archives by league or by completion date
CREATE INDEX IF NOT EXISTS idx_league_season_archives_league_id
  ON public.league_season_archives (league_id);
CREATE INDEX IF NOT EXISTS idx_league_season_archives_completed_at
  ON public.league_season_archives (completed_at DESC);

-- League payouts: records of prize money distributed at season end
CREATE TABLE IF NOT EXISTS public.league_payouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID NOT NULL REFERENCES public.premier_leagues(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  amount      INT NOT NULL,  -- in cents
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up payouts by player or league
CREATE INDEX IF NOT EXISTS idx_league_payouts_player_id
  ON public.league_payouts (player_id);
CREATE INDEX IF NOT EXISTS idx_league_payouts_league_id
  ON public.league_payouts (league_id);

-- Enable RLS
ALTER TABLE public.league_season_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_payouts ENABLE ROW LEVEL SECURITY;

-- RLS policies: all reads are public (standings are public info)
-- Writes only via service role (admin)
CREATE POLICY "league_season_archives_read_all"
  ON public.league_season_archives FOR SELECT
  USING (true);

CREATE POLICY "league_payouts_read_own"
  ON public.league_payouts FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "league_payouts_read_all_admin"
  ON public.league_payouts FOR SELECT
  USING (true);

COMMENT ON TABLE public.league_season_archives IS 'Snapshots of league standings at season completion';
COMMENT ON TABLE public.league_payouts IS 'Records of prize money distributed to players at season end';

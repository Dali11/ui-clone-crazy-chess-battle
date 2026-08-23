-- ============================================================
-- CrazyChess Competitive League System
-- No Base44 dependency — fully self-contained in Supabase
-- ============================================================

-- Competitive Seasons
CREATE TABLE IF NOT EXISTS public.competitive_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Competitive Divisions
CREATE TABLE IF NOT EXISTS public.competitive_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL,
  eligibility_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Premier Leagues
CREATE TABLE IF NOT EXISTS public.premier_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  season_id UUID REFERENCES public.competitive_seasons(id) ON DELETE SET NULL,
  division_id UUID REFERENCES public.competitive_divisions(id) ON DELETE SET NULL,
  player_ids UUID[] DEFAULT '{}',
  total_matchdays INT DEFAULT 0,
  current_matchday INT DEFAULT 1,
  scoring_config JSONB DEFAULT '{"winPoints": 3, "drawPoints": 1, "lossPoints": 0}',
  status TEXT NOT NULL DEFAULT 'upcoming',
  qualifying_spots INT DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- League Fixtures (matches)
CREATE TABLE IF NOT EXISTS public.league_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES public.premier_leagues(id) ON DELETE CASCADE,
  matchday INT NOT NULL,
  home_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  away_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  result TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'home_win', 'away_win', 'draw'
  played BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- League Standings (league table)
CREATE TABLE IF NOT EXISTS public.league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES public.premier_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  previous_position INT NOT NULL DEFAULT 0,
  played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  form TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_league_fixtures_league ON public.league_fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_league_fixtures_matchday ON public.league_fixtures(league_id, matchday);
CREATE INDEX IF NOT EXISTS idx_league_standings_league ON public.league_standings(league_id);
CREATE INDEX IF NOT EXISTS idx_premier_leagues_season ON public.premier_leagues(season_id);

-- Enable RLS
ALTER TABLE public.competitive_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premier_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;

-- Public read access for league data (it's public-facing)
CREATE POLICY "League data is public" ON public.competitive_seasons FOR SELECT USING (true);
CREATE POLICY "League data is public" ON public.competitive_divisions FOR SELECT USING (true);
CREATE POLICY "League data is public" ON public.premier_leagues FOR SELECT USING (true);
CREATE POLICY "League data is public" ON public.league_fixtures FOR SELECT USING (true);
CREATE POLICY "League data is public" ON public.league_standings FOR SELECT USING (true);

-- Only authenticated admins can write
CREATE POLICY "Admins can manage seasons" ON public.competitive_seasons FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage divisions" ON public.competitive_divisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage leagues" ON public.premier_leagues FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage fixtures" ON public.league_fixtures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage standings" ON public.league_standings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed: Malawi Season 1 + Premier League
-- ============================================================

INSERT INTO public.competitive_seasons (name, country, start_date, end_date, status, config)
VALUES ('CrazyChess Malawi Season 1', 'MW', '2026-09-01', '2026-12-31', 'upcoming',
  '{"swissQualifiers": true, "premierLeagueEnabled": true, "cupEnabled": true}')
ON CONFLICT DO NOTHING;

INSERT INTO public.competitive_divisions (name, code, country, eligibility_config)
VALUES
  ('Men''s Division', 'MW-MEN', 'MW', '{"gender": "male", "minRating": 0}'),
  ('Women''s Division', 'MW-WOMEN', 'MW', '{"gender": "female", "minRating": 0}'),
  ('Open Division', 'MW-OPEN', 'MW', '{"minRating": 0}')
ON CONFLICT (code) DO NOTHING;

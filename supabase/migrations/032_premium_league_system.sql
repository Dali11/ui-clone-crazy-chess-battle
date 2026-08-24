-- ============================================================
-- Migration 032: Premium League System — 5 tiers, prize pools,
-- configurable promotion/relegation, premium competitions
-- (Champions League, Sponsored Shield), and admin-configurable
-- league settings.
-- ============================================================

-- ============================================================
-- 1. Extend premier_leagues with prize pool, qualifying positions,
--    payout config, and season duration
-- ============================================================

ALTER TABLE premier_leagues
  ADD COLUMN IF NOT EXISTS prize_pool_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_currency TEXT NOT NULL DEFAULT 'MWK',
  ADD COLUMN IF NOT EXISTS qualifying_positions INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS payout_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS season_duration_weeks INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_logo_url TEXT;

-- payout_config JSONB structure example:
-- { "1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08 }
-- (percentages of prize_pool_cents, keys are finishing positions)

-- ============================================================
-- 2. Premium Competitions — Champions League, Sponsored Shield, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'champions_league'
    CHECK (type IN ('champions_league', 'shield', 'cup', 'custom')),
  description TEXT,
  sponsor_name TEXT,
  sponsor_logo_url TEXT,

  -- Format
  format JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: { "groupStage": true, "groupSize": 5, "groupsQualify": 2,
  --   "knockoutRounds": true, "thirdPlacePlayoff": true }

  -- Qualification
  qualification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: { "fromLeagues": [1,2,3,4,5], "topN": 10, "requiresMembership": true }

  -- Prize
  prize_pool_cents INT NOT NULL DEFAULT 0,
  prize_currency TEXT NOT NULL DEFAULT 'MWK',

  -- Status
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'registration', 'group_stage', 'knockouts', 'semi_finals', 'final', 'completed', 'cancelled')),

  -- Scheduling
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  season_id UUID REFERENCES premier_leagues(id) ON DELETE SET NULL,

  -- Eligibility
  requires_membership BOOLEAN NOT NULL DEFAULT TRUE,
  min_rating INT DEFAULT 0,
  max_rating INT,
  eligibility_config JSONB DEFAULT NULL,

  -- Ownership
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_competitions_status ON premium_competitions(status);
CREATE INDEX IF NOT EXISTS idx_premium_competitions_type ON premium_competitions(type);

-- ============================================================
-- 3. Premium Competition Participants
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  qualified_from_league_id UUID REFERENCES premier_leagues(id) ON DELETE SET NULL,
  qualified_from_tier INT,
  league_position INT,
  group_number INT,
  seed INT,
  status TEXT NOT NULL DEFAULT 'qualified'
    CHECK (status IN ('qualified', 'eliminated', 'champion', 'runner_up', 'third_place')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pcp_competition ON premium_competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_pcp_player ON premium_competition_participants(player_id);

-- ============================================================
-- 4. Premium Competition Fixtures (group stage + knockouts)
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_competition_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'group_stage'
    CHECK (stage IN ('group_stage', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final')),
  group_number INT,                 -- NULL for knockout rounds
  round INT NOT NULL DEFAULT 1,     -- round within the stage
  home_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  away_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  home_score INT,
  away_score INT,
  result TEXT,                       -- 'home_win', 'away_win', 'draw'
  played BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_date TIMESTAMPTZ,
  next_fixture_id UUID REFERENCES premium_competition_fixtures(id) ON DELETE SET NULL,
  bracket_position INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcf_competition ON premium_competition_fixtures(competition_id);
CREATE INDEX IF NOT EXISTS idx_pcf_stage ON premium_competition_fixtures(stage);
CREATE INDEX IF NOT EXISTS idx_pcf_players ON premium_competition_fixtures(home_player_id, away_player_id);

-- ============================================================
-- 5. Premium Competition Standings (group stage)
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_competition_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_number INT NOT NULL,
  position INT NOT NULL DEFAULT 1,
  played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pcs_competition ON premium_competition_standings(competition_id);
CREATE INDEX IF NOT EXISTS idx_pcs_group ON premium_competition_standings(competition_id, group_number);

-- ============================================================
-- 6. Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_premium_competitions_updated_at ON premium_competitions;
CREATE TRIGGER update_premium_competitions_updated_at
  BEFORE UPDATE ON premium_competitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_premium_competition_fixtures_updated_at ON premium_competition_fixtures;
CREATE TRIGGER update_premium_competition_fixtures_updated_at
  BEFORE UPDATE ON premium_competition_fixtures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_premium_competition_standings_updated_at ON premium_competition_standings;
CREATE TRIGGER update_premium_competition_standings_updated_at
  BEFORE UPDATE ON premium_competition_standings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. RLS Policies
-- ============================================================

ALTER TABLE premium_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Premium competitions visible to authenticated" ON premium_competitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage premium competitions" ON premium_competitions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

ALTER TABLE premium_competition_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants visible to authenticated" ON premium_competition_participants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage participants" ON premium_competition_participants
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

ALTER TABLE premium_competition_fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fixtures visible to authenticated" ON premium_competition_fixtures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage fixtures" ON premium_competition_fixtures
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

ALTER TABLE premium_competition_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standings visible to authenticated" ON premium_competition_standings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage standings" ON premium_competition_standings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================
-- 8. Update market_config: membership price to MK10,000/month
-- ============================================================

UPDATE market_config
  SET membership_price_cents = 1000000  -- MK10,000 in cents
  WHERE country_code = 'MW';

-- ============================================================
-- 9. Seed the 5 Premium Leagues (admin-configurable, not hardcoded)
--    These are template records — admin can change capacity,
--    prize pools, promo/releg numbers, qualifying positions, etc.
-- ============================================================

-- Default payout config: top 5 share the prize pool
-- { "1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08 }

INSERT INTO premier_leagues
  (name, status, country, league_size, tier, gender_restriction, entry_type,
   promotes_count, relegates_count, qualifying_positions,
   prize_pool_cents, prize_currency, season_duration_weeks, payout_config)
VALUES
  ('CrazyChess Premier League', 'upcoming', 'MW', 100, 1, 'open', 'membership',
   0, 5, 10, 50000000, 'MWK', 12,
   '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
  ('CrazyChess Championship', 'upcoming', 'MW', 100, 2, 'open', 'membership',
   5, 5, 10, 40000000, 'MWK', 12,
   '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
  ('CrazyChess Bronze League', 'upcoming', 'MW', 100, 3, 'open', 'membership',
   5, 5, 10, 30000000, 'MWK', 12,
   '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
  ('CrazyChess Amateur League', 'upcoming', 'MW', 100, 4, 'open', 'membership',
   5, 5, 10, 20000000, 'MWK', 12,
   '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
  ('CrazyChess Open League', 'upcoming', 'MW', 0, 5, 'open', 'membership',
   5, 0, 10, 10000000, 'MWK', 12,
   '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. Helper: Get league prize payout for a finishing position
-- ============================================================

CREATE OR REPLACE FUNCTION get_league_payout(p_league_id UUID, p_position INT)
RETURNS INT AS $$
DECLARE
  pool INT;
  config JSONB;
  pct FLOAT;
BEGIN
  SELECT prize_pool_cents, payout_config INTO pool, config
  FROM premier_leagues WHERE id = p_league_id;

  IF pool = 0 OR config IS NULL THEN
    RETURN 0;
  END IF;

  pct := (config ->> p_position::text)::FLOAT;
  IF pct IS NULL THEN
    RETURN 0;
  END IF;

  RETURN (pool * pct)::INT;
END;
$$ LANGUAGE plpgsql;

-- Migration 029: League Registration & Qualification System
-- Adds registration flow, entry types (free/membership), and qualification tracking

-- ============================================================
-- Extend premier_leagues with registration & entry config
-- ============================================================

ALTER TABLE premier_leagues
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'free'
    CHECK (entry_type IN ('free', 'membership')),
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS min_rating INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_rating INT,
  ADD COLUMN IF NOT EXISTS requires_qualification BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qualifier_tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;

-- ============================================================
-- League registrations table
-- Tracks players who want to join a league
-- ============================================================

CREATE TABLE IF NOT EXISTS league_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES premier_leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  qualification_reason TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, player_id)
);

-- Index for querying registrations by league
CREATE INDEX IF NOT EXISTS idx_league_registrations_league_id
  ON league_registrations(league_id);

-- Index for querying a player's registrations
CREATE INDEX IF NOT EXISTS idx_league_registrations_player_id
  ON league_registrations(player_id);

-- Index for checking registration status
CREATE INDEX IF NOT EXISTS idx_league_registrations_status
  ON league_registrations(status);

-- ============================================================
-- Memberships table — tracks CrazyChess Club subscriptions
-- ============================================================

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MWK',
  country TEXT NOT NULL DEFAULT 'MW',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memberships_player_id ON memberships(player_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

-- ============================================================
-- Trigger: update updated_at timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_league_registrations_updated_at ON league_registrations;
CREATE TRIGGER update_league_registrations_updated_at
  BEFORE UPDATE ON league_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships;
CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Update league status enum to support registration
-- ============================================================

ALTER TABLE premier_leagues
  DROP CONSTRAINT IF EXISTS premier_leagues_status_check;

ALTER TABLE premier_leagues
  ADD CONSTRAINT premier_leagues_status_check
    CHECK (status IN ('upcoming', 'registration', 'active', 'completed'));

-- ============================================================
-- Helper: check if a player has an active membership
-- ============================================================

CREATE OR REPLACE FUNCTION has_active_membership(p_player_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE player_id = p_player_id
      AND status = 'active'
      AND end_date > NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Helper: check if a player is registered for a league
-- ============================================================

CREATE OR REPLACE FUNCTION is_registered_for_league(p_league_id UUID, p_player_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM league_registrations
    WHERE league_id = p_league_id
      AND player_id = p_player_id
      AND status IN ('pending', 'approved')
  );
END;
$$ LANGUAGE plpgsql;

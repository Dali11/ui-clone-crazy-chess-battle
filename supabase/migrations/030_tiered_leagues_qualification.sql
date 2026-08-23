-- Migration 030: Tiered Leagues, Gender Divisions & Qualification Checklist
-- Adds league tiers (promotion/relegation), gender restrictions,
-- player verification fields, and a qualification checklist system

-- ============================================================
-- 1. Add verification & gender fields to profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verification_method TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chesscom_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS games_played INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for querying by gender for division filtering
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);

-- ============================================================
-- 2. Add tier, gender restriction & promotion/relegation to leagues
-- ============================================================

ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS tier INT NOT NULL DEFAULT 1;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS gender_restriction TEXT NOT NULL DEFAULT 'open'
  CHECK (gender_restriction IN ('male', 'female', 'open'));
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS promotes_count INT NOT NULL DEFAULT 2;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS relegates_count INT NOT NULL DEFAULT 2;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS min_games_played INT NOT NULL DEFAULT 0;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS min_account_age_days INT NOT NULL DEFAULT 0;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_identity_verification BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_phone_verification BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_chesscom_verification BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for querying leagues by tier and gender
CREATE INDEX IF NOT EXISTS idx_premier_leagues_tier ON premier_leagues(tier);
CREATE INDEX IF NOT EXISTS idx_premier_leagues_gender ON premier_leagues(gender_restriction);

-- ============================================================
-- 3. Player qualification checklist table
-- ============================================================

CREATE TABLE IF NOT EXISTS player_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  league_id UUID REFERENCES premier_leagues(id) ON DELETE CASCADE,
  -- Checklist items
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  gender_selected BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  chesscom_linked BOOLEAN NOT NULL DEFAULT FALSE,
  min_games_met BOOLEAN NOT NULL DEFAULT FALSE,
  account_age_met BOOLEAN NOT NULL DEFAULT FALSE,
  membership_active BOOLEAN NOT NULL DEFAULT FALSE,
  rating_requirement_met BOOLEAN NOT NULL DEFAULT FALSE,
  gender_requirement_met BOOLEAN NOT NULL DEFAULT FALSE,
  -- Overall status
  all_requirements_met BOOLEAN NOT NULL DEFAULT FALSE,
  -- Snapshot of requirements at check time
  requirements_snapshot JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, league_id)
);

CREATE INDEX IF NOT EXISTS idx_player_qualifications_player ON player_qualifications(player_id);
CREATE INDEX IF NOT EXISTS idx_player_qualifications_league ON player_qualifications(league_id);

-- ============================================================
-- 4. Helper: check all qualification requirements for a player
-- ============================================================

CREATE OR REPLACE FUNCTION check_qualification(
  p_player_id UUID,
  p_league_id UUID
) RETURNS JSONB AS $$
DECLARE
  league_rec RECORD;
  profile_rec RECORD;
  membership_count INT;
  games_count INT;
  account_age_days INT;
  result JSONB;
BEGIN
  SELECT * INTO league_rec FROM premier_leagues WHERE id = p_league_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'League not found');
  END IF;

  SELECT * INTO profile_rec FROM profiles WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  -- Check membership
  SELECT COUNT(*) INTO membership_count FROM memberships
    WHERE player_id = p_player_id AND status = 'active' AND end_date > NOW();

  -- Check games played
  games_count := COALESCE(profile_rec.games_played, 0);

  -- Check account age
  account_age_days := EXTRACT(DAY FROM (NOW() - COALESCE(profile_rec.account_created_at, profile_rec.created_at, NOW())));

  -- Build checklist
  result := jsonb_build_object(
    'profile_complete', (
      COALESCE(profile_rec.display_name, '') <> '' AND
      COALESCE(profile_rec.country, '') <> '' AND
      COALESCE(profile_rec.full_name, '') <> ''
    ),
    'gender_selected', COALESCE(profile_rec.gender, '') <> '',
    'gender_requirement_met', CASE
      WHEN league_rec.gender_restriction = 'open' THEN true
      WHEN league_rec.gender_restriction = 'male' THEN profile_rec.gender = 'male'
      WHEN league_rec.gender_restriction = 'female' THEN profile_rec.gender = 'female'
      ELSE true
    END,
    'phone_verified', CASE
      WHEN league_rec.requires_phone_verification THEN COALESCE(profile_rec.phone_verified, false)
      ELSE true
    END,
    'identity_verified', CASE
      WHEN league_rec.requires_identity_verification THEN COALESCE(profile_rec.identity_verified, false)
      ELSE true
    END,
    'chesscom_linked', CASE
      WHEN league_rec.requires_chesscom_verification THEN COALESCE(profile_rec.chesscom_verified, false)
      ELSE true
    END,
    'min_games_met', games_count >= COALESCE(league_rec.min_games_played, 0),
    'account_age_met', account_age_days >= COALESCE(league_rec.min_account_age_days, 0),
    'membership_active', CASE
      WHEN league_rec.entry_type = 'membership' THEN membership_count > 0
      ELSE true
    END,
    'rating_requirement_met', CASE
      WHEN COALESCE(league_rec.min_rating, 0) > 0 THEN COALESCE(profile_rec.rating, 0) >= league_rec.min_rating
      ELSE true
    END,
    'requirements', jsonb_build_object(
      'requires_phone_verification', league_rec.requires_phone_verification,
      'requires_identity_verification', league_rec.requires_identity_verification,
      'requires_chesscom_verification', league_rec.requires_chesscom_verification,
      'min_games_played', league_rec.min_games_played,
      'min_account_age_days', league_rec.min_account_age_days,
      'entry_type', league_rec.entry_type,
      'gender_restriction', league_rec.gender_restriction,
      'min_rating', COALESCE(league_rec.min_rating, 0),
      'max_rating', league_rec.max_rating
    )
  );

  -- Check if all requirements are met
  RETURN jsonb_set(result, '{all_requirements_met}',
    to_jsonb(
      (result->>'profile_complete')::boolean AND
      (result->>'gender_selected')::boolean AND
      (result->>'gender_requirement_met')::boolean AND
      (result->>'phone_verified')::boolean AND
      (result->>'identity_verified')::boolean AND
      (result->>'chesscom_linked')::boolean AND
      (result->>'min_games_met')::boolean AND
      (result->>'account_age_met')::boolean AND
      (result->>'membership_active')::boolean AND
      (result->>'rating_requirement_met')::boolean
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Trigger: update updated_at on player_qualifications
-- ============================================================

DROP TRIGGER IF EXISTS update_player_qualifications_updated_at ON player_qualifications;
CREATE TRIGGER update_player_qualifications_updated_at
  BEFORE UPDATE ON player_qualifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

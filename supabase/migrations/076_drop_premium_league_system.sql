-- ============================================================
-- Migration 076: Drop the abandoned Premier/Premium League system
-- (owner decision 2026-09-15). The XP Leagues (league_xp_members,
-- league_xp_history, platform_settings section 'leagues_xp') are the
-- platform's ONLY league system.
--
-- The 028–030/032 competitive/premium schema and the 029 'memberships'
-- table were never wired into the app code (the CrazyChess Club uses
-- profiles columns + platform_revenue_sweeps instead, migration 067).
-- Migration 054 already dropped the fixture/standings/registration/
-- archive tables. This removes the remaining dead tables, their helper
-- functions, and the leftover seed rows.
-- ============================================================

-- Premium competitions (empty)
DROP TABLE IF EXISTS premium_competition_standings CASCADE;
DROP TABLE IF EXISTS premium_competition_fixtures CASCADE;
DROP TABLE IF EXISTS premium_competition_participants CASCADE;
DROP TABLE IF EXISTS premium_competitions CASCADE;

-- Competitive league skeleton (2 seed seasons, 3 seed divisions)
DROP TABLE IF EXISTS premier_leagues CASCADE;
DROP TABLE IF EXISTS competitive_divisions CASCADE;
DROP TABLE IF EXISTS competitive_seasons CASCADE;

-- Legacy membership table (empty — Club memberships live on profiles)
DROP TABLE IF EXISTS memberships CASCADE;

-- Dead helper functions
DROP FUNCTION IF EXISTS has_active_membership(p_player_id UUID);
DROP FUNCTION IF EXISTS get_league_payout(p_league_id UUID, p_position INT);
DROP FUNCTION IF EXISTS sync_league_player_ids();
DROP FUNCTION IF EXISTS atomic_join_league(p_league_id UUID, p_player_id UUID);

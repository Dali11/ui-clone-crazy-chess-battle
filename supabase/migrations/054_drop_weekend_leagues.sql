-- 054: Drop the retired weekend/premier fixture-league system.
--
-- The weekend leagues were fully retired in code (commit 6093b26 — engine,
-- scheduler, cron, registration popup, membership, season-end all removed;
-- XP leagues are the only league). This removes the orphaned tables.
--
-- Data safety: before running, premier_leagues (5 rows),
-- league_registrations (225) and league_standings (13) were exported to JSON
-- backups. league_fixtures, league_payouts, league_season_archives and
-- premium_competition_fixtures were empty.
--
-- XP league tables (league_xp_events, league_xp_history, league_xp_members,
-- league_xp_monthly_history) are untouched.

-- Registration rows reference premier_leagues — drop children first.
DROP TABLE IF EXISTS league_registrations CASCADE;
DROP TABLE IF EXISTS league_fixtures CASCADE;
DROP TABLE IF EXISTS league_payouts CASCADE;
DROP TABLE IF EXISTS league_season_archives CASCADE;
DROP TABLE IF EXISTS league_standings CASCADE;
DROP TABLE IF EXISTS premium_competition_fixtures CASCADE;
DROP TABLE IF EXISTS premier_leagues CASCADE;

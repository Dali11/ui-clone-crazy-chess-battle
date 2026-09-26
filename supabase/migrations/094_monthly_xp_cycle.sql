-- 094: Monthly XP cycle — single leaderboard, Club/Non-Club levels (2026-09-26)
--
-- The 5-tier weekly XP league is retired. XP now runs on ONE cycle:
-- the calendar month. The leaderboard resets on the 1st, a lifetime
-- XP total is maintained forever, and the only player level is Club
-- membership (Non-Club vs Club), which only changes the XP rates:
--   Free: win +3/+6, draw +1/+2, loss -1/-1  (non-club/club)
--   Cash: win +5/+10, draw +2.5/+5, loss +1/+2
--
-- Changes:
--  * league_xp_members.lifetime_xp added — career XP, never resets;
--    backfilled from the league_xp_events audit log.
--  * xp / amount / final_xp columns go numeric(12,1) — cash draws pay
--    2.5 XP (and 5 XP for club), which integers can't store.
--  * All members collapse to tier 1: there is one leaderboard now.
--    The tier column stays (history tables reference it) but nothing
--    reads it for ranking anymore.
--  * league_xp_members.week_start now stores the MONTH key
--    (yyyy-mm-01) — column name predates the monthly cycle.
--  * league_xp_monthly_history.lifetime_xp added so monthly snapshots
--    record each player's career XP at close.

ALTER TABLE public.league_xp_members
  ALTER COLUMN xp TYPE numeric(12,1);

ALTER TABLE public.league_xp_members
  ADD COLUMN IF NOT EXISTS lifetime_xp numeric(12,1) NOT NULL DEFAULT 0;

ALTER TABLE public.league_xp_events
  ALTER COLUMN amount TYPE numeric(12,1);

ALTER TABLE public.league_xp_history
  ALTER COLUMN final_xp TYPE numeric(12,1);

ALTER TABLE public.league_xp_monthly_history
  ALTER COLUMN final_xp TYPE numeric(12,1);

ALTER TABLE public.league_xp_monthly_history
  ADD COLUMN IF NOT EXISTS lifetime_xp numeric(12,1) NOT NULL DEFAULT 0;

-- Backfill lifetime XP from the events audit log (authoritative —
-- every award ever made is an event row).
UPDATE public.league_xp_members m
SET lifetime_xp = COALESCE((
  SELECT SUM(e.amount) FROM public.league_xp_events e WHERE e.user_id = m.user_id
), 0);

-- Single leaderboard: everyone competes together.
UPDATE public.league_xp_members SET tier = 1;

CREATE INDEX IF NOT EXISTS idx_league_xp_members_cycle
  ON public.league_xp_members(week_start, xp DESC);

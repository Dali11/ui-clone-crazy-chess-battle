-- 094: Monthly XP cycle — single leaderboard, Club/Non-Club levels (2026-09-26)
--
-- The XP league cycle moves from weekly to the calendar month (owner
-- redesign + correction 2026-09-26). Boards reset on the 1st, a
-- lifetime XP total is maintained forever, the five-tier ladder and
-- fair-share rebalance are MAINTAINED on the monthly cycle, and Club
-- membership (Non-Club vs Club) sets the XP rates:
--   Free: win +3/+6, draw +1/+2, loss -1/-1  (non-club/club)
--   Cash: win +5/+10, draw +2.5/+5, loss +1/+2
--
-- Changes:
--  * league_xp_members.lifetime_xp added — career XP, never resets;
--    backfilled from the league_xp_events audit log.
--  * xp / amount / final_xp columns go numeric(12,1) — cash draws pay
--    2.5 XP (and 5 XP for club), which integers can't store.
--  * The five-tier ladder and fair-share rebalance are MAINTAINED
--    (owner correction 2026-09-26) — tiers are untouched; they now ride
--    the monthly cycle.
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

CREATE INDEX IF NOT EXISTS idx_league_xp_members_cycle
  ON public.league_xp_members(week_start, xp DESC);

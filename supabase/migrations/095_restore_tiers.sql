-- 095: Tier restore (2026-09-26)
--
-- The initial single-leaderboard cutover briefly collapsed every
-- member to tier 1. The owner corrected course the same day (the
-- five-tier ladder is maintained, only the cycle moved to monthly),
-- so tiers were restored from the most recent league_xp_history
-- snapshot. This records that restore. Applied live 2026-09-26 —
-- verified: Open 216, Amateur/Bronze/Knights/Premier 117 each.

UPDATE public.league_xp_members m
SET tier = h.tier
FROM (
  SELECT DISTINCT ON (user_id) user_id, tier
  FROM public.league_xp_history
  ORDER BY user_id, week_start DESC
) h
WHERE h.user_id = m.user_id;

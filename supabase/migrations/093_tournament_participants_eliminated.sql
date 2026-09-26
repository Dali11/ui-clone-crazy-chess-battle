-- 093: tournament_participants.eliminated
--
-- The app-wide active-tournament redirect (/api/tournaments/active-game)
-- has always filtered on participants.eliminated, but the column never
-- existed in the live database — the query silently errored (42703) and
-- the endpoint always returned { active: false }, so players could freely
-- leave live tournaments to play other games. Column applied live on
-- 2026-09-26; this migration makes the repo schema match.
--
-- Knockout round advancement (advance-round) now sets eliminated = true
-- for losers, which releases them from the redirect once their run ends.
-- Swiss/arena players are never eliminated, and 3rd-place-match players
-- are still pulled to their game (the redirect's game lookup ignores
-- this flag).

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS eliminated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_alive
  ON public.tournament_participants(tournament_id, eliminated);

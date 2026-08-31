-- Migration: Add unique constraints to prevent duplicate tournament rounds and games
-- This prevents the duplicate game creation bug that caused tournament cancellations

-- 1. Unique constraint on tournament_rounds (tournament_id, round_number)
-- Note: This may already exist from 001_initial_schema.sql. Using IF NOT EXISTS for safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tournament_rounds_tournament_id_round_number_key'
  ) THEN
    ALTER TABLE public.tournament_rounds 
    ADD CONSTRAINT tournament_rounds_tournament_id_round_number_key 
    UNIQUE (tournament_id, round_number);
  END IF;
END $$;

-- 2. Unique constraint on games for tournament pairings
-- Prevents duplicate games with the same tournament, round, and player pairing
-- Only applies to tournament games (tournament_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS games_tournament_round_pairing_unique 
ON public.games (tournament_id, tournament_round, white_player_id, black_player_id)
WHERE tournament_id IS NOT NULL AND tournament_round IS NOT NULL;

-- 3. Add advisory lock helper for tournament advancement
-- Used to prevent concurrent round advancement across serverless instances
CREATE OR REPLACE FUNCTION try_tournament_advisory_lock(tournament_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  PERFORM pg_try_advisory_xact_lock(hashtext(tournament_uuid::text));
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

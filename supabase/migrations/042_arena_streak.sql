-- Add arena_streak column to tournament_participants for tracking consecutive wins
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS arena_streak integer DEFAULT 0;

-- Add index for arena tournament queries (available players lookup)
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id 
ON tournament_participants(tournament_id);

-- ============================================================
-- 022: Set default value on games.fen so games created via direct
-- insert (not the create_game RPC) still get a valid starting position.
-- Prevents "Cannot read properties of null (reading 'split')" crashes
-- in chess.js when realtime updates spread null fen into client state.
-- ============================================================

-- Backfill any existing null fen rows
UPDATE public.games
SET fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
WHERE fen IS NULL;

-- Set the default for future inserts
ALTER TABLE public.games
  ALTER COLUMN fen SET DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

-- Add NOT NULL constraint (safe now that all rows are backfilled)
ALTER TABLE public.games
  ALTER COLUMN fen SET NOT NULL;

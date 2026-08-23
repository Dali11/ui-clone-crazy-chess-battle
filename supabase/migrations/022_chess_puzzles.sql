-- ============================================================
-- Chess Puzzles — tactical puzzles for players to solve
-- ============================================================

-- Puzzle sets (curated collections)
CREATE TABLE IF NOT EXISTS public.puzzle_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  difficulty  TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard', 'expert')),
  icon        TEXT NOT NULL DEFAULT '🧩',
  color       TEXT NOT NULL DEFAULT '#a78bfa',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual puzzles
CREATE TABLE IF NOT EXISTS public.chess_puzzles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          UUID REFERENCES public.puzzle_sets(id) ON DELETE CASCADE,
  fen             TEXT NOT NULL,           -- position before the puzzle starts
  solution_moves  JSONB NOT NULL,           -- ["Qh5", "Nf6", ...] sequence of correct moves
  turn            TEXT NOT NULL DEFAULT 'white',  -- whose turn it is to move
  rating          INT NOT NULL DEFAULT 1200,     -- puzzle difficulty rating
  themes          TEXT[] NOT NULL DEFAULT '{}',   -- ["fork", "pin", "mate", ...]
  initial_move    TEXT,                           -- the opponent's last move (for highlight)
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_puzzles_set ON public.chess_puzzles(set_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON public.chess_puzzles(rating);

-- Track per-user puzzle progress
CREATE TABLE IF NOT EXISTS public.puzzle_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id       UUID NOT NULL REFERENCES public.chess_puzzles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'unattempted' CHECK (status IN ('unattempted', 'solved', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  time_spent_ms   INT NOT NULL DEFAULT 0,
  solved_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_progress_user ON public.puzzle_progress(user_id, status);

-- RLS
ALTER TABLE public.puzzle_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzle_progress ENABLE ROW LEVEL SECURITY;

-- Puzzle sets and puzzles are readable by all authenticated users
CREATE POLICY "Users read puzzle sets" ON public.puzzle_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users read puzzles" ON public.chess_puzzles FOR SELECT TO authenticated USING (true);

-- Progress is user-scoped
CREATE POLICY "Users read own progress" ON public.puzzle_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users upsert own progress" ON public.puzzle_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own progress" ON public.puzzle_progress FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.puzzle_progress;

-- ============================================================
-- Puzzle progress — tracks per-user puzzle solving progress
-- with level-based progression (Level 1-10)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.puzzle_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level           INT NOT NULL CHECK (level >= 1 AND level <= 10),
  puzzle_id       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unsolved' CHECK (status IN ('unsolved', 'solved', 'skipped')),
  attempts        INT NOT NULL DEFAULT 0,
  solved_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_progress_user ON public.puzzle_progress(user_id, level);
CREATE INDEX IF NOT EXISTS idx_puzzle_progress_user_level ON public.puzzle_progress(user_id, level, status);

ALTER TABLE public.puzzle_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own puzzle progress" ON public.puzzle_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own puzzle progress" ON public.puzzle_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own puzzle progress" ON public.puzzle_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.puzzle_progress;

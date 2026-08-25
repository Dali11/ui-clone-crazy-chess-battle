-- ============================================================
-- 034: Friendly draughts challenges (no stake, casual/ranked game link)
--      Mirrors the chess `challenges` table but points at draughts_games.
--      Links expire 10 minutes after creation with no acceptance.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.draughts_challenges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acceptor_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  time_control      TEXT NOT NULL,
  initial_minutes   INT NOT NULL,
  increment_seconds INT NOT NULL DEFAULT 0,
  rated             BOOLEAN NOT NULL DEFAULT true,
  color             TEXT NOT NULL DEFAULT 'random',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  game_id           UUID REFERENCES public.draughts_games(id),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draughts_challenges_challenger ON public.draughts_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_draughts_challenges_status ON public.draughts_challenges(status);

ALTER TABLE public.draughts_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or pending draughts challenges" ON public.draughts_challenges
  FOR SELECT TO authenticated
  USING (challenger_id = auth.uid() OR acceptor_id = auth.uid() OR status = 'pending');
CREATE POLICY "Create own draughts challenges" ON public.draughts_challenges
  FOR INSERT TO authenticated WITH CHECK (challenger_id = auth.uid());
CREATE POLICY "Challenger updates own draughts challenge" ON public.draughts_challenges
  FOR UPDATE TO authenticated USING (challenger_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.draughts_challenges;

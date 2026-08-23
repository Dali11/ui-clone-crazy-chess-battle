-- ============================================================
-- Rematch offers — allow players to challenge opponents to a rematch
-- after a game ends. The rematch game only starts when the opponent accepts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rematch_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  requester_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  new_game_id     UUID REFERENCES public.games(id),
  time_control    TEXT,
  initial_minutes INT,
  increment_seconds INT,
  rated           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_rematch_offers_opponent ON public.rematch_offers(opponent_id, status);
CREATE INDEX IF NOT EXISTS idx_rematch_offers_requester ON public.rematch_offers(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_rematch_offers_from_game ON public.rematch_offers(from_game_id);

ALTER TABLE public.rematch_offers ENABLE ROW LEVEL SECURITY;

-- Users can read offers where they are the requester or opponent
CREATE POLICY "Users read own rematch offers" ON public.rematch_offers
  FOR SELECT TO authenticated USING (requester_id = auth.uid() OR opponent_id = auth.uid());

-- Users can insert rematch offers where they are the requester
CREATE POLICY "Users create rematch offers" ON public.rematch_offers
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

-- Users can update rematch offers where they are the opponent (to accept/decline)
CREATE POLICY "Users update rematch offers as opponent" ON public.rematch_offers
  FOR UPDATE TO authenticated USING (opponent_id = auth.uid() OR requester_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rematch_offers;

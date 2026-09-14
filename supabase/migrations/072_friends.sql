-- ============================================================
-- 072: Friends system (chess.com-style)
--
-- players can send friend requests, accept/decline, and
-- one-tap challenge friends to free (non-staked) games.
-- Requester = who sent it; addressee = who it's addressed to.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.friends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

-- fast lookups: "who has pending requests for me" + "are we friends"
CREATE INDEX IF NOT EXISTS idx_friends_addressee_pending
  ON public.friends(addressee_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_friends_requester
  ON public.friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_accepted
  ON public.friends(requester_id, addressee_id) WHERE status = 'accepted';

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Both participants can see the relationship
CREATE POLICY "friends_participant_read" ON public.friends
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Only on behalf of yourself
CREATE POLICY "friends_requester_insert" ON public.friends
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Addressee responds (accept/decline); requester can cancel/delete own row
CREATE POLICY "friends_participant_update" ON public.friends
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "friends_participant_delete" ON public.friends
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

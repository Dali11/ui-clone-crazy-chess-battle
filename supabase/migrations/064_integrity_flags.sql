-- 064: Player integrity / anti-cheat (Phase 1)
-- 1) Per-move think times captured on games (move route appends
--    {u: 'w'|'b', ms} per move) — powers robotic-rhythm analysis.
-- 2) integrity_flags — admin-reviewable signals (shared payment phone,
--    robotic move times). Open flags HOLD league payouts (deposits stay
--    'pending' with a HELD note, wallet not credited) and block
--    withdrawals until an admin resolves them.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS move_times JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.integrity_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'confirmed')),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One flag per user per signal type; scans refresh open flags only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integrity_flags_user_type
  ON public.integrity_flags(user_id, type);
CREATE INDEX IF NOT EXISTS idx_integrity_flags_status
  ON public.integrity_flags(status);

-- Service-role only: RLS enabled with NO policies = users can never
-- read or write their own flags through the anon/authed API.
ALTER TABLE public.integrity_flags ENABLE ROW LEVEL SECURITY;

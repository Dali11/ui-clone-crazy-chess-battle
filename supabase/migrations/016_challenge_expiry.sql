-- ============================================================
-- 016: Challenge expiry — 10 minute timeout for ALL challenges
-- Both regular and battle challenges expire after 10 minutes
-- of no acceptance, with escrowed funds refunded.
-- ============================================================

-- Change default expiry to 10 minutes for regular challenges
ALTER TABLE public.challenges
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');

-- Change default expiry to 10 minutes for battle challenges
ALTER TABLE public.battle_challenges
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');

-- Update any existing pending challenges to 10 minutes from now
-- (so old 2h/24h challenges don't linger)
UPDATE public.challenges
  SET expires_at = now() + interval '10 minutes'
  WHERE status = 'pending'
  AND expires_at > now() + interval '10 minutes';

UPDATE public.battle_challenges
  SET expires_at = now() + interval '10 minutes'
  WHERE status = 'pending'
  AND expires_at > now() + interval '10 minutes';

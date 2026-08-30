-- ============================================================
-- 025: Track original color for proper rematch color swap
-- The player who had white in the original game gets black in the
-- rematch, and vice versa.
-- ============================================================

ALTER TABLE public.rematch_offers
  ADD COLUMN IF NOT EXISTS requester_was_white BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.rematch_offers.requester_was_white IS
  'Whether the requester played white in the original game. Used to swap colors in the rematch.';

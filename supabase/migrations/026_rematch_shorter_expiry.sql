-- Shorten rematch offer expiry from 5 minutes to 30 seconds.
-- Rematches are meant to be ephemeral — if the opponent doesn't respond
-- quickly (accepts, declines, starts another game, or leaves the page),
-- the offer should expire immediately rather than lingering.
ALTER TABLE public.rematch_offers ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 seconds');

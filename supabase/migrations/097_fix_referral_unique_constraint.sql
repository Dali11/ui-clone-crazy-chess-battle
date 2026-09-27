-- ============================================================
-- Fix referral tracking: referrals.referral_code was wrongly UNIQUE
-- ============================================================
-- Bug: migration 008 declared referral_code TEXT NOT NULL UNIQUE on the
-- referrals table. That's the shared code a referrer hands out to MANY
-- people -- it must repeat across rows. With the UNIQUE constraint in
-- place, only the first-ever referral for a given code could be
-- inserted; every subsequent signup via the same link threw a duplicate
-- key violation on INSERT and was silently dropped by the API route.
--
-- The real invariant (one referral row per referred player, enforced
-- today only in application code in /api/affiliate/track) belongs on
-- referred_id, not referral_code. Add it as a DB-level constraint too,
-- so the guarantee holds even under a race between two parallel
-- requests for the same new signup.

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referral_code_key;
ALTER TABLE referrals ALTER COLUMN referral_code DROP NOT NULL;

DROP INDEX IF EXISTS idx_referrals_referred_unique;
CREATE UNIQUE INDEX idx_referrals_referred_unique ON referrals(referred_id) WHERE referred_id IS NOT NULL;

-- ============================================================
-- 066: Quick Match announce — challenges.source column
--
-- Quick Match search now auto-posts a challenge link to the
-- player's COUNTRY group room while they wait. Those auto-created
-- challenges are tagged source='quick_match_announce' so the app
-- can cancel them when the search ends (leave / paired / accepted),
-- and dedupe repeats within the 10-minute link window.
-- ============================================================

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- quick lookups: pending announces per challenger
CREATE INDEX IF NOT EXISTS idx_challenges_source_pending
  ON challenges(challenger_id, source) WHERE status = 'pending';

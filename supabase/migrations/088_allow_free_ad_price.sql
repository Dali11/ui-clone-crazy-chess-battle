-- ============================================================
-- 088_allow_free_ad_price.sql
-- The original 073_direct_ads.sql check constraint required
-- price_mwk > 0, written before "free (house/comped) ads" existed.
-- The admin free-ad flow (src/app/api/admin/ads/route.ts POST)
-- legitimately inserts price_mwk = 0 for house placements — every
-- attempt has been failing this constraint ever since.
--
-- Loosen to >= 0. Negative prices remain impossible.
-- ============================================================

ALTER TABLE ad_campaigns
  DROP CONSTRAINT IF EXISTS ad_campaigns_price_mwk_check;

ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_price_mwk_check CHECK (price_mwk >= 0);

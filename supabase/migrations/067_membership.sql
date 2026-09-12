-- ============================================================
-- 067: Membership (ad-free supporter plan, MW first)
--
-- MK10,000/month membership. Members get no ads (and future perks).
-- Purchase flows through the SAME PayChangu mobile-money rails as
-- deposits: a deposits row with method='membership_purchase' that,
-- on payment success, extends profiles.membership_until instead of
-- crediting the wallet. The cash lands in the platform's PayChangu
-- merchant account = platform revenue, so the weekly revenue sweep
-- counts membership purchases alongside battle + withdrawal fees.
-- ============================================================

-- Lazy expiry: NULL or past = not a member. No cron needed.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS membership_until TIMESTAMPTZ;

-- Membership purchases are revenue for the sweep's window breakdown.
ALTER TABLE platform_revenue_sweeps
  ADD COLUMN IF NOT EXISTS membership_fees_mwk INTEGER NOT NULL DEFAULT 0;

-- Config section: price + master switch (editable in Admin → Platform Settings)
INSERT INTO platform_settings (section, config)
VALUES ('membership', '{"enabled": true, "price_mwk": 10000, "name": "Membership", "period_days": 30}'::jsonb)
ON CONFLICT (section) DO NOTHING;

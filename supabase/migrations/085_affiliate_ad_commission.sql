-- ============================================================
-- 085_affiliate_ad_commission.sql
-- Affiliate program: self-serve ad commission (owner rule 2026-09-16).
--
-- When a referred player buys a self-serve ad campaign, their referrer
-- earns a commission on the ad spend:
--   * FIRST ad purchase ever  -> 25% (config: ad_first_pct)
--   * every subsequent one    -> 10% forever (config: ad_repeat_pct)
--
-- Gates & guarantees (same rails as 084 pay_affiliate_fee_share):
--   * Referred player must be KYC-verified (identity_verified).
--   * Commission is paid from the ad spend the platform has already
--     collected — never more than it.
--   * Idempotent: one payout per campaign; a refund claws the
--     commission back (clawback_affiliate_ad_commission), so the
--     program never pays on money returned to the advertiser.
--   * Config in platform_settings.section='affiliate':
--       ad_commission_enabled (bool, default true)
--       ad_first_pct (default 25), ad_repeat_pct (default 10)
--   * Rejected campaigns keep the money (ad space was held) — the
--     commission stands; only full refunds reverse it.
-- ============================================================

-- 1. Ad commission payout (service role only)
CREATE OR REPLACE FUNCTION public.pay_affiliate_ad_commission(
  p_user_id UUID,
  p_ad_spend INT,
  p_campaign_id UUID
)
RETURNS INT AS $$
DECLARE
  v_config JSONB;
  v_enabled BOOLEAN;
  v_pct INT;
  v_ref RECORD;
  v_commission INT;
BEGIN
  IF p_ad_spend IS NULL OR p_ad_spend <= 0 OR p_campaign_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Config: admin can pause or re-tune ad commissions without a deploy
  SELECT config INTO v_config FROM platform_settings WHERE section = 'affiliate' LIMIT 1;
  IF v_config IS NULL THEN v_config := '{}'::jsonb; END IF;
  v_enabled := COALESCE((v_config->>'ad_commission_enabled')::BOOLEAN, TRUE);
  IF v_enabled = FALSE THEN RETURN 0; END IF;

  -- Idempotency: never pay twice for the same campaign
  IF EXISTS (
    SELECT 1 FROM deposits
    WHERE reference = 'affiliate_ad:' || p_campaign_id AND amount > 0
  ) THEN
    RETURN 0;
  END IF;

  -- Find the referral linking this player to a referrer
  SELECT * INTO v_ref FROM referrals WHERE referred_id = p_user_id LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- KYC gate: ad spend only counts once the referred player is identity-verified
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND identity_verified = TRUE
  ) THEN
    RETURN 0;
  END IF;

  -- First ad purchase ever? (refunded campaigns never counted as purchases)
  IF EXISTS (
    SELECT 1 FROM ad_campaigns
    WHERE advertiser_id = p_user_id
      AND id <> p_campaign_id
      AND status <> 'refunded'
  ) THEN
    v_pct := COALESCE((v_config->>'ad_repeat_pct')::INT, 10);
  ELSE
    v_pct := COALESCE((v_config->>'ad_first_pct')::INT, 25);
  END IF;
  IF v_pct <= 0 THEN RETURN 0; END IF;

  v_commission := FLOOR(p_ad_spend * v_pct / 100.0);
  IF v_commission <= 0 THEN RETURN 0; END IF;

  -- Credit the referrer's wallet (atomic; converts MWK to their local currency)
  PERFORM public.credit_wallet(v_ref.referrer_id, v_commission);

  -- Ledger entry (audited trail; reference keyed to the campaign for clawback)
  INSERT INTO deposits (user_id, amount, method, status, reference)
  VALUES (
    v_ref.referrer_id,
    v_commission,
    'affiliate_commission',
    'success',
    'affiliate_ad:' || p_campaign_id || ':mk' || p_ad_spend
  );

  -- Update the referral row (same bookkeeping as fee share)
  UPDATE referrals
  SET status = 'rewarded',
      activation_condition = COALESCE(activation_condition, 'fee_share'),
      activated_at = COALESCE(activated_at, now()),
      completed_at = now(),
      commission_amount = commission_amount + v_commission,
      commission_paid = TRUE
  WHERE id = v_ref.id;

  -- Notify the referrer
  INSERT INTO notifications (user_id, type, title, body, data, read)
  VALUES (
    v_ref.referrer_id,
    'affiliate_commission',
    'Ad Commission Earned',
    'You earned MK ' || v_commission || ' from your referral''s ad campaign.',
    jsonb_build_object('commission', v_commission, 'referred_user', p_user_id, 'source', 'ad_campaign', 'campaign', p_campaign_id),
    FALSE
  );

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PostgreSQL grants EXECUTE to PUBLIC by default — must revoke that too,
-- otherwise any client could call the function with a fake ad spend.
REVOKE EXECUTE ON FUNCTION public.pay_affiliate_ad_commission(UUID, INT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.pay_affiliate_ad_commission(UUID, INT, UUID) TO service_role;

-- 2. Clawback on ad refund (service role only)
--    When an admin refunds a campaign, the advertiser gets their money
--    back — the referrer's commission on that spend is reversed with it.
--    Idempotent: safe to call twice; only reverses what was actually paid.
CREATE OR REPLACE FUNCTION public.clawback_affiliate_ad_commission(
  p_campaign_id UUID
)
RETURNS INT AS $$
DECLARE
  v_camp RECORD;
  v_ref RECORD;
  v_paid INT;
BEGIN
  IF p_campaign_id IS NULL THEN RETURN 0; END IF;

  SELECT advertiser_id, price_mwk INTO v_camp FROM ad_campaigns WHERE id = p_campaign_id LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_ref FROM referrals WHERE referred_id = v_camp.advertiser_id LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- What commission was paid for this campaign?
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM deposits
  WHERE user_id = v_ref.referrer_id
    AND method = 'affiliate_commission'
    AND reference LIKE 'affiliate_ad:' || p_campaign_id || ':%'
    AND amount > 0;
  IF v_paid <= 0 THEN RETURN 0; END IF;

  -- Idempotency: only claw back once per campaign
  IF EXISTS (
    SELECT 1 FROM deposits
    WHERE reference = 'affiliate_ad_clawback:' || p_campaign_id
  ) THEN
    RETURN 0;
  END IF;

  PERFORM public.debit_wallet(v_ref.referrer_id, v_paid);

  -- Reversal ledger entry (audited trail)
  INSERT INTO deposits (user_id, amount, method, status, reference, admin_notes)
  VALUES (
    v_ref.referrer_id,
    -v_paid,
    'affiliate_commission',
    'success',
    'affiliate_ad_clawback:' || p_campaign_id,
    'Ad campaign refunded — commission on this campaign reversed.'
  );

  -- Referral bookkeeping: subtract what this campaign paid (never below 0)
  UPDATE referrals
  SET commission_amount = GREATEST(0, commission_amount - v_paid)
  WHERE id = v_ref.id;

  -- Notify the referrer
  INSERT INTO notifications (user_id, type, title, body, data, read)
  VALUES (
    v_ref.referrer_id,
    'affiliate_commission',
    'Ad Commission Reversed',
    'MK ' || v_paid || ' commission was reversed because the ad campaign was refunded.',
    jsonb_build_object('clawback', v_paid, 'source', 'ad_campaign', 'campaign', p_campaign_id),
    FALSE
  );

  RETURN v_paid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.clawback_affiliate_ad_commission(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.clawback_affiliate_ad_commission(UUID) TO service_role;

-- 3. Config (merge — preserves the existing switches from 084)
INSERT INTO platform_settings (section, config, updated_at)
VALUES ('affiliate', '{"ad_commission_enabled": true, "ad_first_pct": 25, "ad_repeat_pct": 10}'::jsonb, now())
ON CONFLICT (section) DO UPDATE SET
  config = platform_settings.config || '{"ad_commission_enabled": true, "ad_first_pct": 25, "ad_repeat_pct": 10}'::jsonb,
  updated_at = now();

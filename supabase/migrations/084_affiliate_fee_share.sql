-- ============================================================
-- 084_affiliate_fee_share.sql
-- Affiliate program v2: referrers earn a share (default 25%)
-- of every platform fee their referred players generate — forever.
--
-- Revenue lines shared:
--   * Battle rake (10% of pot) — hooked in src/lib/battles/settle.ts
--   * Fixed-pool tournament entry fees — hooked in tournaments/[id]/join
--   * Membership fees — already handled by process_affiliate_commission
-- Entry-fee prize pools are NOT shared (player money, not revenue).
--
-- Gates & guarantees:
--   * Referred player must be KYC-verified (identity_verified) —
--     spam accounts generate zero shareable fees, so they pay nothing.
--   * Share is always a fraction of fees the platform has ALREADY
--     collected — payout can never exceed revenue.
--   * Config in platform_settings.section='affiliate':
--       fee_share_enabled (bool, default true), fee_share_pct (default 25)
--
-- Legacy berry referral rewards are retired: check_referral_activation
-- becomes a no-op (kept for compatibility with existing call sites).
-- ============================================================

-- 1. Fee-share payout function (called from server code, service role)
CREATE OR REPLACE FUNCTION public.pay_affiliate_fee_share(
  p_user_id UUID,
  p_fee_amount INT,
  p_source TEXT
)
RETURNS INT AS $$
DECLARE
  v_config JSONB;
  v_pct INT;
  v_ref RECORD;
  v_share INT;
BEGIN
  IF p_fee_amount IS NULL OR p_fee_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Config: admin can pause or re-tune the share without a deploy
  SELECT config INTO v_config
  FROM platform_settings
  WHERE section = 'affiliate'
  LIMIT 1;

  IF v_config IS NULL THEN
    v_config := '{}'::jsonb;
  END IF;
  IF COALESCE((v_config->>'fee_share_enabled')::BOOLEAN, TRUE) = FALSE THEN
    RETURN 0;
  END IF;
  v_pct := COALESCE((v_config->>'fee_share_pct')::INT, 25);
  IF v_pct <= 0 THEN
    RETURN 0;
  END IF;

  -- Find the referral linking this player to a referrer
  SELECT * INTO v_ref
  FROM referrals
  WHERE referred_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- KYC gate: fees only count once the referred player is identity-verified
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND identity_verified = TRUE
  ) THEN
    RETURN 0;
  END IF;

  -- Share of the fee the platform already collected (never more than it)
  v_share := FLOOR(p_fee_amount * v_pct / 100.0);
  IF v_share <= 0 THEN
    RETURN 0;
  END IF;

  -- Credit the referrer's wallet (atomic; converts MWK to their local currency)
  PERFORM public.credit_wallet(v_ref.referrer_id, v_share);

  -- Ledger entry (same audited trail as membership commissions)
  INSERT INTO deposits (user_id, amount, method, status, reference)
  VALUES (
    v_ref.referrer_id,
    v_share,
    'affiliate_commission',
    'success',
    'affiliate:' || p_user_id::text || ':' || COALESCE(p_source, 'fee') || ':mk' || p_fee_amount
  );

  -- Update the referral row (first share marks it active/rewarded)
  UPDATE referrals
  SET status = 'rewarded',
      activation_condition = COALESCE(activation_condition, 'fee_share'),
      activated_at = COALESCE(activated_at, now()),
      completed_at = now(),
      commission_amount = commission_amount + v_share,
      commission_paid = TRUE
  WHERE id = v_ref.id;

  -- Notify the referrer
  INSERT INTO notifications (user_id, type, title, body, data, read)
  VALUES (
    v_ref.referrer_id,
    'affiliate_commission',
    'Affiliate Commission Earned',
    'You earned MK ' || v_share || ' from the platform fees your referral generated.',
    jsonb_build_object('commission', v_share, 'referred_user', p_user_id, 'source', p_source),
    FALSE
  );

  RETURN v_share;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only: called from trusted server code with amounts the
-- platform itself computed. No client-callable path.
-- PostgreSQL grants EXECUTE to PUBLIC by default — must revoke that too,
-- otherwise any client could call the function with a fake fee amount.
REVOKE EXECUTE ON FUNCTION public.pay_affiliate_fee_share(UUID, INT, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.pay_affiliate_fee_share(UUID, INT, TEXT) TO service_role;

-- 2. Retire the legacy activation hook (berry rewards) — no-op now.
--    Kept for compatibility: src/lib/league-xp/award.ts still calls it.
CREATE OR REPLACE FUNCTION public.check_referral_activation(
  p_user_id UUID,
  p_action TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Retired 2026-09-16: replaced by pay_affiliate_fee_share (cash fee share).
  -- Berry referral rewards are gone; the cash program pays on real fees.
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Seed the fee-share config (merge — preserves the existing 'enabled'
--    switch that gates membership commissions)
INSERT INTO platform_settings (section, config, updated_at)
VALUES ('affiliate', '{"fee_share_enabled": true, "fee_share_pct": 25}'::jsonb, now())
ON CONFLICT (section) DO UPDATE SET
  config = platform_settings.config || '{"fee_share_enabled": true, "fee_share_pct": 25}'::jsonb,
  updated_at = now();

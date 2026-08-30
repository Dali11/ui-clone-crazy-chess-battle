-- ============================================================
-- 043_affiliate_commission.sql
-- Affiliate program overhaul: 25% commission on membership fees
-- ============================================================

-- 1. Add commission tracking columns to referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_amount INT NOT NULL DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN NOT NULL DEFAULT false;

-- 2. Update status constraint to include 'activated'
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending', 'signed_up', 'activated', 'rewarded'));

-- 3. Create affiliate commission function
-- Called on every successful membership payment.
-- Credits 25% of the membership fee to the referrer's wallet_balance (MWK),
-- records it in the deposits ledger, and tracks the total on the referral row.
-- Returns the commission amount (0 if no referrer found).
CREATE OR REPLACE FUNCTION public.process_affiliate_commission(
  p_user_id UUID,
  p_amount INT
)
RETURNS INT AS $$
DECLARE
  v_referral RECORD;
  v_commission INT;
BEGIN
  -- Find the active referral for this user (any status — commissions are ongoing)
  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- 25% commission, rounded down to whole MWK
  v_commission := FLOOR(p_amount * 0.25);

  IF v_commission <= 0 THEN
    RETURN 0;
  END IF;

  -- Credit referrer's wallet (wallet_balance is in MWK, integer)
  UPDATE profiles
  SET wallet_balance = wallet_balance + v_commission
  WHERE id = v_referral.referrer_id;

  -- Record in deposits ledger for audit trail
  INSERT INTO deposits (user_id, amount, method, status, reference)
  VALUES (
    v_referral.referrer_id,
    v_commission,
    'affiliate_commission',
    'success',
    'affiliate:' || p_user_id::text || ':membership:mk' || p_amount
  );

  -- Mark referral as activated on first commission
  IF v_referral.status NOT IN ('rewarded', 'activated') THEN
    UPDATE referrals
    SET status = 'rewarded',
        activated_at = now(),
        completed_at = now(),
        activation_condition = 'membership_purchase',
        berries_awarded = 0,
        commission_amount = v_commission,
        commission_paid = true
    WHERE id = v_referral.id;
  ELSE
    -- Accumulate commission for repeat membership payments
    UPDATE referrals
    SET commission_amount = commission_amount + v_commission,
        commission_paid = true
    WHERE id = v_referral.id;
  END IF;

  -- Notify the referrer
  INSERT INTO notifications (user_id, type, title, body, data, read)
  VALUES (
    v_referral.referrer_id,
    'affiliate_commission',
    'Affiliate Commission Earned',
    'You earned MK ' || v_commission || ' commission from your referral''s membership purchase.',
    jsonb_build_object('commission', v_commission, 'referred_user', p_user_id),
    false
  );

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.process_affiliate_commission(UUID, INT) TO authenticated;

-- 4. Keep check_referral_activation for legacy triggers (battles, tournaments, etc.)
-- but update it to also handle membership_purchase as a no-op (handled by
-- process_affiliate_commission instead) so it doesn't silently fail.
CREATE OR REPLACE FUNCTION public.check_referral_activation(
  p_user_id UUID,
  p_action TEXT
)
RETURNS VOID AS $$
DECLARE
  v_referral RECORD;
  v_should_activate BOOLEAN := false;
  v_condition TEXT;
BEGIN
  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = p_user_id AND status IN ('pending', 'signed_up');

  IF NOT FOUND THEN RETURN; END IF;
  IF v_referral.status IN ('activated', 'rewarded') THEN RETURN; END IF;

  CASE p_action
    WHEN 'battle' THEN
      v_should_activate := true;
      v_condition := 'chess_battle';
    WHEN 'tournament' THEN
      v_should_activate := true;
      v_condition := 'tournament_joined';
    WHEN 'wallet_topup' THEN
      v_should_activate := true;
      v_condition := 'wallet_topup';
    WHEN 'quick_match' THEN
      UPDATE referrals SET quick_matches_played = quick_matches_played + 1 WHERE id = v_referral.id;
      SELECT quick_matches_played >= 10 INTO v_should_activate FROM referrals WHERE id = v_referral.id;
      v_condition := '10_quick_matches';
    WHEN 'membership_purchase' THEN
      -- Handled by process_affiliate_commission — no-op here
      RETURN;
    ELSE
      RETURN;
  END CASE;

  IF v_should_activate THEN
    UPDATE referrals
    SET status = 'rewarded', activation_condition = v_condition,
        activated_at = now(), completed_at = now(), berries_awarded = 1000
    WHERE id = v_referral.id;

    PERFORM public.credit_berries(v_referral.referrer_id, 1000, NULL, 'Referral reward');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration 040: Fix stale "_cents" references left over from the amount_cents -> amount
-- column rename (migrate_cents.py). The columns were renamed on profiles.wallet_balance_cents
-- -> wallet_balance, withdrawals.amount_cents -> amount, premier_leagues.prize_pool_cents ->
-- prize_pool, but these three RPC function bodies (and one param name) were never updated,
-- so they referenced columns that no longer exist / an argument name the client no longer sends.
--
-- request_withdrawal: client (src/app/api/withdrawals/request/route.ts) calls with p_amount,
-- but the live function still expected p_amount_cents -> PostgREST "function not found in
-- schema cache". Also its body still wrote to wallet_balance_cents / amount_cents.

DROP FUNCTION IF EXISTS public.request_withdrawal(UUID, INT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.request_withdrawal(
  p_user_id        UUID,
  p_amount         INT,
  p_phone          TEXT,
  p_operator_ref_id TEXT,
  p_operator_name  TEXT
)
RETURNS UUID AS $$
DECLARE
  withdrawal_id UUID;
  current_balance INT;
BEGIN
  SELECT wallet_balance INTO current_balance
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.withdrawals (user_id, amount, phone, operator_name, operator_ref_id, status)
  VALUES (p_user_id, p_amount, p_phone, p_operator_name, p_operator_ref_id, 'pending')
  RETURNING id INTO withdrawal_id;

  RETURN withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(UUID, INT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(UUID, INT, TEXT, TEXT, TEXT) TO service_role;

-- refund_withdrawal: still wrote to wallet_balance_cents / read v_withdrawal.amount_cents.
CREATE OR REPLACE FUNCTION public.refund_withdrawal(
  p_withdrawal_id UUID,
  p_admin_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_withdrawal RECORD;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF v_withdrawal IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  IF v_withdrawal.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Withdrawal cannot be refunded from status %', v_withdrawal.status;
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_withdrawal.amount
  WHERE id = v_withdrawal.user_id;

  UPDATE public.withdrawals
  SET status = 'rejected',
      processed_by = p_admin_id,
      processed_at = now(),
      updated_at = now()
  WHERE id = p_withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refund_withdrawal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_withdrawal(UUID, UUID) TO service_role;

-- get_league_payout: still read prize_pool_cents (column is now prize_pool).
CREATE OR REPLACE FUNCTION public.get_league_payout(p_league_id UUID, p_position INT)
RETURNS INT AS $$
DECLARE
  pool INT;
  config JSONB;
  pct FLOAT;
BEGIN
  SELECT prize_pool, payout_config INTO pool, config
  FROM premier_leagues WHERE id = p_league_id;

  IF pool = 0 OR config IS NULL THEN
    RETURN 0;
  END IF;

  pct := (config ->> p_position::text)::FLOAT;
  IF pct IS NULL THEN
    RETURN 0;
  END IF;

  RETURN (pool * pct)::INT;
END;
$$ LANGUAGE plpgsql;

-- Migration 096: fix wallet-ledger units for withdrawal refunds.
--
-- WHY: withdrawals are stored in the player's LOCAL wallet currency
-- (migration 080). request_withdrawal debits the wallet with the raw
-- local amount, and refunds must credit the same raw local amount back
-- (symmetric). But the LEDGER rows told two different stories:
--
--   1. refund_failed_payout (086) credited the wallet correctly but
--      wrote the raw LOCAL amount into deposits.amount — a column that
--      is MWK-normalized everywhere else. A Zambian player's ZK 65
--      refund was recorded as MK 65 in the ledger, so the Command
--      Centre Player Dossier's derived balance undercounted by the FX
--      factor (~75x) and flagged a false discrepancy.
--
--   2. refund_withdrawal (040, used by admin reject + approve-failure)
--      credited the wallet with NO ledger row at all — the wallet moved
--      with no audit trail in the deposits ledger, and the player's
--      wallet timeline never showed the refund coming back.

-- ── 1. refund_failed_payout: MWK-normalized ledger + local columns ─────
CREATE OR REPLACE FUNCTION public.refund_failed_payout(
  p_withdrawal_id UUID,
  p_reason TEXT DEFAULT 'Payout failed at provider'
)
RETURNS VOID AS $$
DECLARE
  v_withdrawal RECORD;
  v_rate NUMERIC;
  v_local INT;
  v_amount_mwk INT;
  v_currency TEXT;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF v_withdrawal IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  -- Terminal + already refunded — duplicate callback, nothing to do.
  IF v_withdrawal.status = 'rejected' THEN
    RETURN;
  END IF;

  IF v_withdrawal.status NOT IN ('pending', 'approved', 'completed') THEN
    RAISE EXCEPTION 'Cannot refund withdrawal in status %', v_withdrawal.status;
  END IF;

  -- Withdrawal amounts are in the player's wallet currency. Credit the
  -- wallet with the SAME raw local amount that was debited (symmetric),
  -- but record the MWK-normalized value in the ledger.
  SELECT public.wallet_currency(v_withdrawal.user_id) INTO v_currency;
  SELECT public.mwk_rate(v_withdrawal.user_id) INTO v_rate;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'refund_failed_payout: FX rate unavailable';
  END IF;

  v_local := v_withdrawal.amount;
  v_amount_mwk := round(v_local / v_rate)::INT;

  -- Give the money back to the player's wallet (raw local, symmetric
  -- with the debit)
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_local
  WHERE id = v_withdrawal.user_id;

  -- Audit trail in the wallet ledger: MWK-normalized amount + the local
  -- value/currency so history can display the player's own currency.
  INSERT INTO public.deposits (user_id, amount, amount_local, currency, method, reference, admin_notes)
  VALUES (
    v_withdrawal.user_id,
    v_amount_mwk,
    v_local,
    v_currency,
    'withdrawal_failed_refund',
    'withdrawal_failed:' || p_withdrawal_id,
    'Payout failed at provider and was refunded. Reason: ' || COALESCE(p_reason, 'unknown')
  );

  -- Mark terminal (refunded). Raw status change so duplicate callbacks
  -- are caught by the check above.
  UPDATE public.withdrawals
  SET status = 'rejected',
      processed_at = now(),
      updated_at = now()
  WHERE id = p_withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.refund_failed_payout(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.refund_failed_payout(UUID, TEXT) TO service_role;

-- ── 2. refund_withdrawal: add the missing ledger row ────────────────────
CREATE OR REPLACE FUNCTION public.refund_withdrawal(
  p_withdrawal_id UUID,
  p_admin_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_withdrawal RECORD;
  v_rate NUMERIC;
  v_local INT;
  v_amount_mwk INT;
  v_currency TEXT;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF v_withdrawal IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  IF v_withdrawal.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Withdrawal cannot be refunded from status %', v_withdrawal.status;
  END IF;

  SELECT public.wallet_currency(v_withdrawal.user_id) INTO v_currency;
  SELECT public.mwk_rate(v_withdrawal.user_id) INTO v_rate;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'refund_withdrawal: FX rate unavailable';
  END IF;

  v_local := v_withdrawal.amount;
  v_amount_mwk := round(v_local / v_rate)::INT;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_local
  WHERE id = v_withdrawal.user_id;

  -- Audit trail (was missing): same ledger semantics as
  -- refund_failed_payout above.
  INSERT INTO public.deposits (user_id, amount, amount_local, currency, method, reference, admin_notes)
  VALUES (
    v_withdrawal.user_id,
    v_amount_mwk,
    v_local,
    v_currency,
    'withdrawal_refund',
    'withdrawal_rejected:' || p_withdrawal_id,
    'Withdrawal rejected — amount returned to wallet'
  );

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

-- ── 3. Backfill: fix ledger rows already written with local units ─────
-- Rows written by the pre-096 refund_failed_payout carry the raw LOCAL
-- amount in deposits.amount and no currency. For non-MWK wallets only:
-- convert amount to MWK and preserve the local value in amount_local.
-- Idempotent: fixed rows get a currency, so they no longer match.
UPDATE public.deposits d
SET amount = round(d.amount / public.mwk_rate(d.user_id))::INT,
    amount_local = d.amount,
    currency = public.wallet_currency(d.user_id)
WHERE d.method = 'withdrawal_failed_refund'
  AND d.currency IS NULL
  AND public.wallet_currency(d.user_id) <> 'MWK'
  AND public.mwk_rate(d.user_id) > 0;

-- Migration 086: refund_failed_payout RPC — closes a live financial gap
-- now that PawaPay payouts are active.
--
-- The approve route and revenue sweep mark a withdrawal "completed" the
-- moment PawaPay ACCEPTS the payout (initiation, not final status). If
-- PawaPay later reports FAILED, the webhook must refund the player's
-- wallet — but refund_withdrawal refuses status 'completed' and the
-- webhook skipped rows already marked 'completed'. Result: a failed
-- payout silently kept the player's debited money.
--
-- This RPC:
--   * refunds from pending / approved / completed (completed = the
--     optimistic "initiated" marker)
--   * is idempotent: rejected rows return quietly (duplicate callbacks)
--   * writes an audit row into the deposits ledger

CREATE OR REPLACE FUNCTION public.refund_failed_payout(
  p_withdrawal_id UUID,
  p_reason TEXT DEFAULT 'Payout failed at provider'
)
RETURNS VOID AS $$
DECLARE
  v_withdrawal RECORD;
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

  -- Give the money back to the player's wallet
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_withdrawal.amount
  WHERE id = v_withdrawal.user_id;

  -- Audit trail in the wallet ledger
  INSERT INTO public.deposits (user_id, amount, method, reference, admin_notes)
  VALUES (
    v_withdrawal.user_id,
    v_withdrawal.amount,
    'withdrawal_failed_refund',
    'withdrawal_failed:' || p_withdrawal_id,
    'Payout failed at provider and was refunded. Reason: ' || COALESCE(p_reason, 'unknown')
  );

  -- Mark terminal (refunded). Use raw status change so duplicate
  -- callbacks are caught by the check above.
  UPDATE public.withdrawals
  SET status = 'rejected',
      processed_at = now(),
      updated_at = now()
  WHERE id = p_withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only the webhook / service role may trigger failure refunds.
REVOKE ALL ON FUNCTION public.refund_failed_payout(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.refund_failed_payout(UUID, TEXT) TO service_role;

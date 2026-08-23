-- Migration 024: Fix refund_withdrawal RPC to set processed_by and processed_at
-- The original refund_withdrawal RPC (migration 011) set status='rejected' and updated_at
-- but never set processed_by or processed_at. This made admin audit logs incomplete —
-- you couldn't tell who rejected a withdrawal or when from the withdrawals table itself.

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

  -- Credit the amount back to the user's wallet
  UPDATE public.profiles
  SET wallet_balance_cents = wallet_balance_cents + v_withdrawal.amount_cents
  WHERE id = v_withdrawal.user_id;

  -- Mark the withdrawal as rejected (refunded) with audit fields
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

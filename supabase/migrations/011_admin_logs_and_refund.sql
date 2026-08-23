-- Migration 011: Fix missing admin_logs table and refund_withdrawal RPC
-- These are referenced throughout the app (admin panel, withdrawal approve/reject)
-- but were never created. refund_withdrawal in particular is a live financial bug:
-- if a mobile-money payout fails after a withdrawal was debited, the app tries to
-- call refund_withdrawal to give the money back — but the function doesn't exist,
-- so the refund silently fails while the admin is told "Wallet has been refunded."

-- ============================================================
-- 1. admin_logs table — audit trail for admin panel actions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES public.profiles(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin logs" ON public.admin_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "Admins insert admin logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);

-- ============================================================
-- 2. refund_withdrawal RPC — atomically refund a withdrawal to the
--    user's wallet and mark it rejected. Used when an admin rejects
--    a pending withdrawal, or when a mobile-money payout fails after
--    the wallet was already debited.
-- ============================================================
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

  -- Mark the withdrawal as rejected (refunded)
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

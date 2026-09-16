-- ============================================================
-- Migration 087: Admin Phase 2 — Finance & Reconciliation
--
-- Adds the Phase 2 financial operations layer:
--   1. provider_transactions   — append-only record of every payment
--                                 provider callback (the reconciliation
--                                 engine matches these against internal
--                                 deposits/withdrawals).
--   2. financial_audit_log     — immutable audit trail for every
--                                 financial admin action.
--   3. reconciliation_exceptions — exceptions queue produced by the
--                                 reconciliation engine.
--   4. settlements              — money movement between the payment
--                                 infrastructure and CrazyChess accounts.
--   5. apply_financial_adjustment RPC — the ONLY sanctioned way to make
--                                 a corrective ledger adjustment: it
--                                 writes a ledger row, moves the wallet
--                                 via the existing credit/debit_wallet
--                                 RPCs (never edits wallet_balance
--                                 directly) and writes an audit record.
--
-- Security posture: every table is admin-readable via RLS and written
-- ONLY by the service role (API routes). Mutating RPCs are revoked
-- from PUBLIC/anon/authenticated so only the service role can call them.
-- ============================================================

-- ── 1. provider_transactions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL DEFAULT 'pawapay',
  provider_ref    TEXT NOT NULL,              -- pawaPay depositId / payoutId, paychangu reference
  direction       TEXT NOT NULL CHECK (direction IN ('deposit', 'payout')),
  provider_status TEXT,                       -- raw provider status (COMPLETED, FAILED, ...)
  amount_local    NUMERIC,
  currency        TEXT,
  country         TEXT,
  raw_payload     JSONB DEFAULT '{}'::jsonb,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_tx_ref
  ON public.provider_transactions (provider, provider_ref, direction);

CREATE INDEX IF NOT EXISTS idx_provider_tx_received
  ON public.provider_transactions (received_at DESC);

ALTER TABLE public.provider_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read provider transactions" ON public.provider_transactions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- No INSERT/UPDATE/DELETE policies: only the service role can write.

-- ── 2. financial_audit_log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES public.profiles(id),
  action          TEXT NOT NULL,              -- e.g. reconcile.resolve, adjustment.apply, settlement.create
  entity_type     TEXT,                       -- deposit | withdrawal | exception | settlement | player
  entity_id       TEXT,
  transaction_ref TEXT,                        -- provider or internal reference
  previous_state  JSONB DEFAULT '{}'::jsonb,
  new_state       JSONB DEFAULT '{}'::jsonb,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_created
  ON public.financial_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_entity
  ON public.financial_audit_log (entity_type, entity_id);

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read financial audit log" ON public.financial_audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- Append-only: no UPDATE/DELETE policies at all. Application code never
-- issues UPDATE/DELETE against this table — financial records are immutable.

-- ── 3. reconciliation_exceptions ───────────────────────────
CREATE TABLE IF NOT EXISTS public.reconciliation_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN (
                    'amount_mismatch', 'status_mismatch', 'unmatched_provider',
                    'duplicate_internal', 'missing_provider_record', 'stuck_pending')),
  provider        TEXT,
  provider_ref    TEXT,
  entity_type     TEXT NOT NULL,               -- deposit | withdrawal
  entity_id       UUID,
  country         TEXT,
  currency        TEXT,
  provider_amount NUMERIC,
  internal_amount NUMERIC,
  difference      NUMERIC,
  provider_status TEXT,
  internal_status TEXT,
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved        BOOLEAN NOT NULL DEFAULT false,
  resolved_by     UUID REFERENCES public.profiles(id),
  resolved_at     TIMESTAMPTZ,
  resolution_action TEXT,                      -- confirm_match | adjust | dismiss | reopen
  resolution_note TEXT
);

-- One live (unresolved) exception per logical problem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_exception_live
  ON public.reconciliation_exceptions (kind, entity_type, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(provider_ref, ''))
  WHERE NOT resolved;

CREATE INDEX IF NOT EXISTS idx_recon_exception_open
  ON public.reconciliation_exceptions (resolved, detected_at DESC);

ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reconciliation exceptions" ON public.reconciliation_exceptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- Writes only via service role.

-- ── 4. settlements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country           TEXT,
  currency          TEXT NOT NULL DEFAULT 'USD',
  amount_local      NUMERIC NOT NULL,
  amount_usd        NUMERIC,
  kind              TEXT NOT NULL CHECK (kind IN ('player_money', 'platform_revenue', 'company_funds')),
  provider_reference TEXT,
  settlement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'settled', 'reconciled')),
  notes             TEXT,
  created_by        UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_date
  ON public.settlements (settlement_date DESC);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settlements" ON public.settlements
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
-- Writes only via service role.

-- ── 5. apply_financial_adjustment RPC ──────────────────────
-- Controlled, auditable corrective adjustment. p_amount_mwk is signed:
--   positive = credit the player, negative = debit the player.
-- Moves the wallet via the existing credit_wallet/debit_wallet RPCs
-- (which perform local-currency conversion per migration 080), writes a
-- ledger row (deposits, method 'admin_adjustment'), and writes an
-- immutable financial_audit_log entry. wallet_balance itself is never
-- touched directly (migration 082 blocks that anyway).
CREATE OR REPLACE FUNCTION public.apply_financial_adjustment(
  p_admin_id     UUID,
  p_player_id    UUID,
  p_amount_mwk   INTEGER,
  p_reason       TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit_id   UUID;
  v_balance_before INTEGER;
  v_balance_after  INTEGER;
  v_wallet_currency TEXT;
BEGIN
  IF p_admin_id IS NULL OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required for financial adjustments';
  END IF;
  IF p_amount_mwk = 0 THEN
    RAISE EXCEPTION 'Adjustment amount cannot be zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin not found or not an admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT wallet_balance INTO v_balance_before
  FROM public.profiles WHERE id = p_player_id;
  SELECT public.wallet_currency(p_player_id) INTO v_wallet_currency;

  -- Ledger row first (single source of truth for the movement).
  INSERT INTO public.deposits (
    user_id, amount, status, method, reference, admin_notes, credited_by, currency, country
  ) VALUES (
    p_player_id,
    p_amount_mwk,
    'success',
    'admin_adjustment',
    'adjustment:' || gen_random_uuid(),
    left(p_reason, 500),
    p_admin_id,
    'MWK',
    (SELECT country FROM public.profiles WHERE id = p_player_id)
  )
  RETURNING id INTO v_deposit_id;

  -- Move the wallet through the sanctioned RPCs (never a direct UPDATE).
  IF p_amount_mwk > 0 THEN
    PERFORM public.credit_wallet(p_player_id, p_amount_mwk);
  ELSE
    PERFORM public.debit_wallet(p_player_id, -p_amount_mwk);
  END IF;

  SELECT wallet_balance INTO v_balance_after
  FROM public.profiles WHERE id = p_player_id;

  -- Immutable audit entry.
  INSERT INTO public.financial_audit_log (
    admin_id, action, entity_type, entity_id, transaction_ref,
    previous_state, new_state, reason
  ) VALUES (
    p_admin_id,
    'adjustment.apply',
    'deposit',
    v_deposit_id,
    'adjustment:' || v_deposit_id,
    jsonb_build_object(
      'wallet_balance_before', v_balance_before,
      'wallet_currency', v_wallet_currency,
      'amount_mwk', p_amount_mwk
    ),
    jsonb_build_object(
      'wallet_balance_after', v_balance_after,
      'wallet_currency', v_wallet_currency,
      'ledger_row', v_deposit_id
    ),
    p_reason
  );

  RETURN v_deposit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_financial_adjustment(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 6. Supporting indexes for the Phase 2 ledger queries ───
CREATE INDEX IF NOT EXISTS idx_deposits_country ON public.deposits (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_method_created ON public.deposits (method, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_country ON public.withdrawals (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_provider_ref
  ON public.deposits (paychangu_ref) WHERE paychangu_ref IS NOT NULL;

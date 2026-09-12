-- Migration 065: Weekly platform revenue sweep
-- Records each automated sweep of platform revenue (battle fees + withdrawal
-- fees) to the owner's wallet/payout. A sweep row only "advances" the revenue
-- window when credited=true — skipped rows (below-min, disabled) are log
-- entries that leave the revenue to be carried into the next window.

create table if not exists public.platform_revenue_sweeps (
  id uuid primary key default gen_random_uuid(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  battle_fees_mwk integer not null default 0,
  withdrawal_fees_mwk integer not null default 0,
  total_mwk integer not null default 0,
  credited boolean not null default false,
  withdrawal_id uuid,
  payout_status text not null default 'skipped',  -- skipped | skipped_below_min | credit_failed | wallet_only | pending | payout_failed | paid
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_revenue_sweeps_created
  on public.platform_revenue_sweeps (created_at desc);
